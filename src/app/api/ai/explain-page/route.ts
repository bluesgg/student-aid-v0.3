import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import { getOpenAIClient, DEFAULT_MODEL } from '@/lib/openai/client'
import { checkQuota } from '@/lib/quota/check'
import { deductQuota } from '@/lib/quota/deduct'
import { extractPageText } from '@/lib/pdf/extract'
import {
  buildExplainPagePrompt,
  parseExplainPageResponse,
} from '@/lib/openai/prompts/explain-page'
import {
  checkUserSharePreference,
  checkSharedCache,
  tryStartGeneration,
  recordLatencySample,
  PROMPT_VERSION,
  type StickerLocale,
} from '@/lib/stickers/shared-cache'
import { determineEffectiveMode, type EffectiveMode } from '@/lib/pdf/page-metadata'
import { z } from 'zod'

const requestSchema = z.object({
  courseId: z.string().uuid(),
  fileId: z.string().uuid(),
  page: z.number().int().positive(),
  pdfType: z.enum(['Lecture', 'Homework', 'Exam', 'Other']),
  locale: z.enum(['en', 'zh-Hans']).optional().default('en'),
})

/**
 * POST /api/ai/explain-page - Generate auto-stickers for a page
 * 
 * Workflow:
 * 1. Check quota (fail fast with 402 if insufficient)
 * 2. Check user-specific stickers cache (for backwards compatibility)
 * 3. If file has content_hash, check shared cache:
 *    - status='ready' → Return 200 with stickers
 *    - status='generating' → Return 202 with generationId
 *    - not found → Start generation, return 202
 * 4. For old files without content_hash, use sync generation
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    // Parse and validate request body
    const body = await request.json()
    const parseResult = requestSchema.safeParse(body)

    if (!parseResult.success) {
      return errors.invalidInput(parseResult.error.errors[0].message)
    }

    const { courseId, fileId, page, pdfType, locale } = parseResult.data

    // Get file info
    const { data: file, error: fileError } = await supabase
      .from('files')
      .select('*')
      .eq('id', fileId)
      .eq('course_id', courseId)
      .eq('user_id', user.id)
      .single()

    if (fileError || !file) {
      return errors.notFound('File')
    }

    // Check if file is scanned
    if (file.is_scanned) {
      return errors.custom('FILE_IS_SCANNED', 'Scanned PDFs do not support AI explain', 400)
    }

    // Check if page is valid
    if (page > file.page_count) {
      return errors.invalidInput(`Page ${page} does not exist (file has ${file.page_count} pages)`)
    }

    // ==================== STEP 1: Check quota first (fail fast) ====================
    const quotaCheck = await checkQuota(supabase, user.id, 'autoExplain')

    if (!quotaCheck.allowed) {
      return errors.custom('QUOTA_EXCEEDED', 'Auto explain quota exceeded', 429, {
        bucket: 'autoExplain',
        used: quotaCheck.quota.used,
        limit: quotaCheck.quota.limit,
        resetAt: quotaCheck.quota.resetAt,
      })
    }

    // ==================== STEP 2: Check user-specific stickers cache ====================
    const { data: existingStickers } = await supabase
      .from('stickers')
      .select('*')
      .eq('file_id', fileId)
      .eq('user_id', user.id)
      .eq('page', page)
      .eq('type', 'auto')

    if (existingStickers && existingStickers.length > 0) {
      // Return cached stickers without deducting quota
      const latencyMs = Date.now() - startTime
      
      // Record latency sample (cache hit from user stickers)
      await recordLatencySample({
        pdfHash: file.content_hash || undefined,
        page,
        locale,
        latencyMs,
        cacheHit: true,
      })

      const { data: quotas } = await supabase
        .from('quotas')
        .select('*')
        .eq('user_id', user.id)
        .eq('bucket', 'autoExplain')
        .single()

      return successResponse({
        stickers: existingStickers.map((s) => ({
          id: s.id,
          type: s.type,
          page: s.page,
          anchor: {
            textSnippet: s.anchor_text,
            rect: s.anchor_rect,
          },
          parentId: s.parent_id,
          contentMarkdown: s.content_markdown,
          folded: s.folded,
          depth: s.depth,
          createdAt: s.created_at,
        })),
        quota: {
          autoExplain: {
            used: quotas?.used ?? 0,
            limit: quotas?.limit ?? 300,
            resetAt: quotas?.reset_at ?? new Date().toISOString(),
          },
        },
        cached: true,
        source: 'user_cache',
      })
    }

    // ==================== STEP 3: Check shared cache (if file has content_hash) ====================
    const contentHash = file.content_hash as string | null

    if (contentHash) {
      // Check user opt-out preference
      const shareToCache = await checkUserSharePreference(user.id)

      if (shareToCache) {
        // Determine effective mode before cache lookup
        let effectiveMode: EffectiveMode = 'text_only'
        try {
          // Download PDF to determine effective mode if needed
          const { data: pdfData } = await supabase.storage
            .from('course-files')
            .download(file.storage_key)

          if (pdfData) {
            const buffer = Buffer.from(await pdfData.arrayBuffer())
            effectiveMode = await determineEffectiveMode(contentHash, page, buffer)
          }
        } catch (modeError) {
          console.error('Error determining effective mode:', modeError)
          // Default to text_only on error
        }

        // Check shared cache
        const cacheResult = await checkSharedCache(
          contentHash,
          page,
          locale as StickerLocale,
          effectiveMode
        )

        if (cacheResult.status === 'ready' && cacheResult.stickers) {
          // Shared cache hit! Deduct quota and return stickers
          const deductResult = await deductQuota(supabase, user.id, 'autoExplain')
          const latencyMs = Date.now() - startTime

          // Record latency sample
          await recordLatencySample({
            pdfHash: contentHash,
            page,
            locale,
            effectiveMode,
            latencyMs,
            cacheHit: true,
          })

          // Copy stickers to user's stickers table for future access
          await copySharedStickersToUser(
            supabase,
            cacheResult.stickers,
            user.id,
            courseId,
            fileId,
            page
          )

          return successResponse({
            stickers: formatStickers(cacheResult.stickers),
            quota: {
              autoExplain: deductResult.quota,
            },
            cached: true,
            source: 'shared_cache',
            generationId: cacheResult.generationId,
          })
        }

        if (cacheResult.status === 'generating' && cacheResult.generationId) {
          // Generation in progress - return 202 with generationId
          return NextResponse.json(
            {
              ok: true,
              status: 'generating',
              generationId: cacheResult.generationId,
              message: 'Sticker generation in progress. Poll /api/ai/explain-page/status/:generationId for updates.',
              pollInterval: 2000,
            },
            { status: 202 }
          )
        }

        // Not found - try to start generation
        try {
          const startResult = await tryStartGeneration({
            pdfHash: contentHash,
            page,
            locale: locale as StickerLocale,
            effectiveMode,
            userId: user.id,
            quotaUnits: 1,
          })

          if (startResult.started || startResult.alreadyExists) {
            // Return 202 with generationId
            return NextResponse.json(
              {
                ok: true,
                status: 'generating',
                generationId: startResult.generationId,
                message: startResult.started
                  ? 'Sticker generation started. Poll /api/ai/explain-page/status/:generationId for updates.'
                  : 'Sticker generation already in progress. Poll for updates.',
                pollInterval: 2000,
              },
              { status: 202 }
            )
          }
        } catch (startError) {
          console.error('Error starting generation:', startError)
          // Fall through to sync generation
        }
      }
    }

    // ==================== STEP 4: Sync generation (fallback for old files or opted-out users) ====================
    return await syncGenerateStickers(supabase, {
      user,
      courseId,
      fileId,
      file,
      page,
      pdfType,
      locale,
      startTime,
    })

  } catch (error) {
    console.error('Explain page error:', error)
    return errors.internalError()
  }
}

/**
 * Sync sticker generation (original flow for backwards compatibility)
 */
async function syncGenerateStickers(
  supabase: ReturnType<typeof createClient>,
  params: {
    user: { id: string }
    courseId: string
    fileId: string
    file: { storage_key: string; page_count: number; content_hash?: string | null }
    page: number
    pdfType: 'Lecture' | 'Homework' | 'Exam' | 'Other'
    locale: string
    startTime: number
  }
) {
  const { user, courseId, fileId, file, page, pdfType, locale, startTime } = params

  // Download PDF from storage
  const { data: pdfData, error: downloadError } = await supabase.storage
    .from('course-files')
    .download(file.storage_key)

  if (downloadError || !pdfData) {
    console.error('Error downloading PDF:', downloadError)
    return errors.internalError()
  }

  // Extract page text
  const buffer = Buffer.from(await pdfData.arrayBuffer())
  const { text: pageText } = await extractPageText(buffer, page)

  if (!pageText || pageText.length < 50) {
    return errors.custom(
      'INSUFFICIENT_TEXT',
      'This page has insufficient text content for AI explanation',
      400
    )
  }

  // Build prompt
  const prompt = buildExplainPagePrompt({
    pageText,
    pageNumber: page,
    pdfType,
    totalPages: file.page_count,
  })

  // Call OpenAI
  const openai = getOpenAIClient()
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You are an expert educational AI tutor. You help students understand complex academic material by providing clear, thorough explanations.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 4000,
  })

  const responseContent = completion.choices[0]?.message?.content
  if (!responseContent) {
    return errors.custom('AI_ERROR', 'AI did not return a response', 500)
  }

  // Parse the response
  const parsed = parseExplainPageResponse(responseContent)

  // Create stickers in database
  const stickersToCreate = parsed.explanations.map((exp) => ({
    user_id: user.id,
    course_id: courseId,
    file_id: fileId,
    type: 'auto' as const,
    page,
    anchor_text: exp.anchorText,
    anchor_rect: null,
    parent_id: null,
    content_markdown: exp.explanation,
    folded: false,
    depth: 0,
  }))

  const { data: createdStickers, error: createError } = await supabase
    .from('stickers')
    .insert(stickersToCreate)
    .select()

  if (createError) {
    console.error('Error creating stickers:', createError)
    return errors.internalError()
  }

  // Deduct quota
  const deductResult = await deductQuota(supabase, user.id, 'autoExplain')

  // Record latency sample
  const latencyMs = Date.now() - startTime
  await recordLatencySample({
    pdfHash: file.content_hash || undefined,
    page,
    locale: locale as StickerLocale,
    latencyMs,
    cacheHit: false,
  })

  return successResponse({
    stickers: (createdStickers || []).map((s) => ({
      id: s.id,
      type: s.type,
      page: s.page,
      anchor: {
        textSnippet: s.anchor_text,
        rect: s.anchor_rect,
      },
      parentId: s.parent_id,
      contentMarkdown: s.content_markdown,
      folded: s.folded,
      depth: s.depth,
      createdAt: s.created_at,
    })),
    quota: {
      autoExplain: deductResult.quota,
    },
    cached: false,
    source: 'sync_generation',
  })
}

/**
 * Copy shared stickers to user's stickers table
 */
async function copySharedStickersToUser(
  supabase: ReturnType<typeof createClient>,
  sharedStickers: unknown[],
  userId: string,
  courseId: string,
  fileId: string,
  page: number
) {
  try {
    const stickersToCreate = (sharedStickers as Array<{
      anchorText?: string
      anchor_text?: string
      explanation?: string
      content_markdown?: string
    }>).map((s) => ({
      user_id: userId,
      course_id: courseId,
      file_id: fileId,
      type: 'auto' as const,
      page,
      anchor_text: s.anchorText || s.anchor_text || 'Explanation',
      anchor_rect: null,
      parent_id: null,
      content_markdown: s.explanation || s.content_markdown || '',
      folded: false,
      depth: 0,
    }))

    await supabase.from('stickers').insert(stickersToCreate)
  } catch (error) {
    console.error('Error copying shared stickers to user:', error)
    // Non-fatal - user can still see the stickers from the response
  }
}

/**
 * Format shared stickers for API response
 */
function formatStickers(stickers: unknown[]): Array<{
  id?: string
  type: string
  page?: number
  anchor: { textSnippet: string; rect: null }
  parentId: null
  contentMarkdown: string
  folded: boolean
  depth: number
  createdAt?: string
}> {
  return (stickers as Array<{
    id?: string
    anchorText?: string
    anchor_text?: string
    explanation?: string
    content_markdown?: string
    page?: number
    created_at?: string
  }>).map((s, index) => ({
    id: s.id || `shared-${index}`,
    type: 'auto',
    page: s.page,
    anchor: {
      textSnippet: s.anchorText || s.anchor_text || 'Explanation',
      rect: null,
    },
    parentId: null,
    contentMarkdown: s.explanation || s.content_markdown || '',
    folded: false,
    depth: 0,
    createdAt: s.created_at || new Date().toISOString(),
  }))
}
