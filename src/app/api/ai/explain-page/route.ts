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
  type EffectiveMode,
} from '@/lib/stickers/shared-cache'
import { determineEffectiveMode } from '@/lib/pdf/page-metadata'
import { computeSelectionHash, isValidNormalizedRect, type SelectedImageRegion, type NormalizedRect } from '@/lib/stickers/selection-hash'
import {
  retrieveContextForPage,
  buildContextHint,
  getContextSummary,
} from '@/lib/context'
import {
  startSession,
  getPagesToGenerate,
  updateSessionProgress,
  completeSession,
  type WindowState,
} from '@/lib/auto-explain'
import {
  generatePptPdfStickers,
  generateTextPdfStickers,
} from '@/lib/auto-explain'
import { getOrDetectPdfType, type PdfType } from '@/lib/pdf/type-detector'
import { isFeatureEnabled } from '@/lib/feature-flags'
import { z } from 'zod'
import { getLocalizedSystemPrompt, type Locale } from '@/lib/user-preferences'

// Required for multipart form data parsing with File handling
export const runtime = 'nodejs'

/**
 * Normalize locale to StickerLocale format.
 * Converts 'zh' to 'zh-Hans' for compatibility with shared cache.
 */
function normalizeToStickerLocale(locale: 'en' | 'zh' | 'zh-Hans'): StickerLocale {
  return locale === 'zh' ? 'zh-Hans' : locale as StickerLocale
}

/**
 * Normalize locale to user preferences format.
 * Converts 'zh-Hans' to 'zh' for compatibility with getLocalizedSystemPrompt.
 */
function normalizeToUserLocale(locale: 'en' | 'zh' | 'zh-Hans'): Locale {
  return locale === 'zh-Hans' ? 'zh' : locale as Locale
}

// ==================== Zod Schemas ====================

/** Normalized rect schema (0..1 coordinates) */
const normalizedRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
}).refine(
  (rect) => rect.x + rect.width <= 1.0001 && rect.y + rect.height <= 1.0001,
  { message: 'Rect coordinates out of bounds (x+width or y+height > 1)' }
)

/** Selected image region schema */
const selectedImageRegionSchema = z.object({
  page: z.number().int().positive(),
  rect: normalizedRectSchema,
})

/** Optional text selection schema */
const textSelectionSchema = z.object({
  page: z.number().int().positive(),
  textSnippet: z.string().min(1).max(1000),
  rect: normalizedRectSchema.nullable().optional(),
}).optional()

/** Legacy JSON request schema (single page mode) */
const requestSchema = z.object({
  courseId: z.string().uuid(),
  fileId: z.string().uuid(),
  page: z.number().int().positive(),
  pdfType: z.enum(['Lecture', 'Homework', 'Exam', 'Other']),
  locale: z.enum(['en', 'zh', 'zh-Hans']).optional().default('en'),
  mode: z.enum(['single', 'window']).optional().default('single'),
})

/** Multipart payload schema for with_selected_images mode */
const multipartPayloadSchema = z.object({
  courseId: z.string().uuid(),
  fileId: z.string().uuid(),
  page: z.number().int().positive(), // This is the root page (session root)
  pdfType: z.enum(['Lecture', 'Homework', 'Exam', 'Other']),
  locale: z.enum(['en', 'zh', 'zh-Hans']).optional().default('en'),
  effectiveMode: z.literal('with_selected_images'),
  selectedImageRegions: z.array(selectedImageRegionSchema)
    .min(1, 'At least 1 region required')
    .max(8, 'Maximum 8 regions allowed'),
  textSelection: textSelectionSchema,
})

/** Maximum total upload size for multipart (8 regions * 500KB + overhead) */
const MAX_MULTIPART_SIZE_BYTES = 5 * 1024 * 1024 // 5MB

// ==================== Types ====================

interface MultipartPayload {
  courseId: string
  fileId: string
  page: number
  pdfType: 'Lecture' | 'Homework' | 'Exam' | 'Other'
  locale: 'en' | 'zh' | 'zh-Hans'
  effectiveMode: 'with_selected_images'
  selectedImageRegions: SelectedImageRegion[]
  textSelection?: {
    page: number
    textSnippet: string
    rect?: NormalizedRect | null
  }
}

interface ParsedMultipartRequest {
  payload: MultipartPayload
  images: Buffer[]
}

/**
 * POST /api/ai/explain-page - Generate auto-stickers for a page
 * 
 * Supports two request formats:
 * 1. JSON (legacy): Standard page explanation
 * 2. Multipart/form-data: User-selected image regions with JPEG crops
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

    // Detect request format based on Content-Type
    const contentType = request.headers.get('content-type') || ''
    const isMultipart = contentType.includes('multipart/form-data')

    let courseId: string
    let fileId: string
    let page: number
    let pdfType: 'Lecture' | 'Homework' | 'Exam' | 'Other'
    let locale: 'en' | 'zh' | 'zh-Hans'
    let isSelectedImagesMode = false
    let multipartData: ParsedMultipartRequest | null = null

    if (isMultipart) {
      // Parse multipart request for with_selected_images mode
      const parseResult = await parseMultipartRequest(request)
      if ('error' in parseResult) {
        return parseResult.error
      }
      multipartData = parseResult
      courseId = multipartData.payload.courseId
      fileId = multipartData.payload.fileId
      page = multipartData.payload.page
      pdfType = multipartData.payload.pdfType
      locale = multipartData.payload.locale
      isSelectedImagesMode = true
    } else {
      // Parse legacy JSON request
      const body = await request.json()
      const parseResult = requestSchema.safeParse(body)

      if (!parseResult.success) {
        return errors.invalidInput(parseResult.error.errors[0].message)
      }

      courseId = parseResult.data.courseId
      fileId = parseResult.data.fileId
      page = parseResult.data.page
      pdfType = parseResult.data.pdfType
      locale = parseResult.data.locale as 'en' | 'zh-Hans'

      // Check for window mode (sliding window auto-explain)
      if (parseResult.data.mode === 'window') {
        // Check feature flag
        if (!isFeatureEnabled('AUTO_EXPLAIN_WINDOW')) {
          return errors.custom(
            'FEATURE_DISABLED',
            'Window mode is not enabled. Please use single page mode.',
            400
          )
        }
        return await handleWindowMode(supabase, {
          user,
          courseId,
          fileId,
          page,
          pdfType,
          locale,
        })
      }
    }

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
      // For selected images mode, log telemetry about rejected upload
      if (isSelectedImagesMode && multipartData) {
        const totalUploadBytes = request.headers.get('content-length')
        console.warn('scanned_pdf_rejected_after_upload', {
          fileId,
          total_upload_bytes: totalUploadBytes,
          regions_count: multipartData.payload.selectedImageRegions.length,
        })
      }
      return errors.custom(
        'FILE_IS_SCANNED',
        isSelectedImagesMode
          ? 'Scanned PDFs do not support image region selection'
          : 'Scanned PDFs do not support AI explain',
        400
      )
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
        locale: normalizeToStickerLocale(locale),
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
        stickers: existingStickers.map((s) => {
          // anchor_rect may contain { rect, isFullPage } structure or just the rect
          const anchorRect = s.anchor_rect as { rect?: { x: number; y: number; width: number; height: number }; isFullPage?: boolean } | null
          return {
            id: s.id,
            type: s.type,
            page: s.page,
            anchor: {
              textSnippet: s.anchor_text,
              rect: anchorRect?.rect || anchorRect,
              isFullPage: anchorRect?.isFullPage,
            },
            parentId: s.parent_id,
            contentMarkdown: s.content_markdown,
            folded: s.folded,
            depth: s.depth,
            createdAt: s.created_at,
          }
        }),
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
        // Determine effective mode and selection hash
        let effectiveMode: EffectiveMode = 'text_only'
        let selectionHash: string | null = null

        if (isSelectedImagesMode && multipartData) {
          // For selected images mode, use the mode from request and compute selection hash
          effectiveMode = 'with_selected_images'
          selectionHash = computeSelectionHash({
            rootPage: page,
            effectiveMode,
            locale: normalizeToStickerLocale(locale),
            regions: multipartData.payload.selectedImageRegions,
          })
        } else {
          // For non-selection modes, determine effective mode from page metadata
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
        }

        // Check shared cache
        const cacheResult = await checkSharedCache(
          contentHash,
          page,
          normalizeToStickerLocale(locale),
          effectiveMode,
          selectionHash
        )

        if (cacheResult.status === 'ready' && cacheResult.stickers) {
          // Shared cache hit! Deduct quota and return stickers
          // NOTE: For with_selected_images mode, quota is deducted even on cache hit (product decision)
          const deductResult = await deductQuota(supabase, user.id, 'autoExplain')
          const latencyMs = Date.now() - startTime

          // Record latency sample
          await recordLatencySample({
            pdfHash: contentHash,
            page,
            locale: normalizeToStickerLocale(locale),
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
            page,
            cacheResult.selectedImageRegions
          )

          return successResponse({
            stickers: formatStickers(cacheResult.stickers, cacheResult.selectedImageRegions),
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
          return successResponse(
            {
              status: 'generating',
              generationId: cacheResult.generationId,
              message: 'Sticker generation in progress. Poll /api/ai/explain-page/status/:generationId for updates.',
              pollInterval: 2000,
            },
            202
          )
        }

        // Not found - try to start generation
        try {
          const startResult = await tryStartGeneration({
            pdfHash: contentHash,
            page,
            locale: normalizeToStickerLocale(locale),
            effectiveMode,
            userId: user.id,
            quotaUnits: 1,
            imagesCount: isSelectedImagesMode ? multipartData?.payload.selectedImageRegions.length : 0,
            selectionHash,
            // Store selectedImageRegions for later retrieval when formatting stickers
            selectedImageRegions: isSelectedImagesMode ? multipartData?.payload.selectedImageRegions : undefined,
          })

          if (startResult.started || startResult.alreadyExists) {
            // Return 202 with generationId
            return successResponse(
              {
                status: 'generating',
                generationId: startResult.generationId,
                message: startResult.started
                  ? 'Sticker generation started. Poll /api/ai/explain-page/status/:generationId for updates.'
                  : 'Sticker generation already in progress. Poll for updates.',
                pollInterval: 2000,
              },
              202
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

  // Retrieve context from shared context library (graceful degradation on failure)
  let contextHint = ''
  try {
    const contextResult = await retrieveContextForPage({
      userId: user.id,
      courseId,
      fileId,
      currentPage: page,
      pageText,
    })
    if (contextResult.entries.length > 0) {
      console.log('Context retrieved for explain-page:', getContextSummary(contextResult))
      contextHint = buildContextHint(contextResult.entries)
    }
  } catch (contextError) {
    // Silent degradation - continue without context
    console.error('Context retrieval failed, proceeding without context:', contextError)
  }

  // Build prompt
  const prompt = buildExplainPagePrompt({
    pageText,
    pageNumber: page,
    pdfType,
    totalPages: file.page_count,
  })

  // Build system message with optional context hint and locale
  const baseSystemMessage =
    'You are an expert educational AI tutor. You help students understand complex academic material by providing clear, thorough explanations.'
  const localizedBaseMessage = getLocalizedSystemPrompt(baseSystemMessage, normalizeToUserLocale(locale as 'en' | 'zh' | 'zh-Hans'))
  const systemMessage = contextHint
    ? `${localizedBaseMessage}\n${contextHint}`
    : localizedBaseMessage

  // Call OpenAI
  const openai = getOpenAIClient()
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      {
        role: 'system',
        content: systemMessage,
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
    locale: normalizeToStickerLocale(locale as 'en' | 'zh' | 'zh-Hans'),
    latencyMs,
    cacheHit: false,
  })

  return successResponse({
    stickers: (createdStickers || []).map((s) => {
      // anchor_rect may contain { rect, isFullPage } structure or just the rect
      const anchorRect = s.anchor_rect as { rect?: { x: number; y: number; width: number; height: number }; isFullPage?: boolean } | null
      return {
        id: s.id,
        type: s.type,
        page: s.page,
        anchor: {
          textSnippet: s.anchor_text,
          rect: anchorRect?.rect || anchorRect,
          isFullPage: anchorRect?.isFullPage,
        },
        parentId: s.parent_id,
        contentMarkdown: s.content_markdown,
        folded: s.folded,
        depth: s.depth,
        createdAt: s.created_at,
      }
    }),
    quota: {
      autoExplain: deductResult.quota,
    },
    cached: false,
    source: 'sync_generation',
  })
}

/**
 * Copy shared stickers to user's stickers table.
 * If selectedImageRegions is provided, stores anchors array in anchor_rect for persistence.
 */
async function copySharedStickersToUser(
  supabase: ReturnType<typeof createClient>,
  sharedStickers: unknown[],
  userId: string,
  courseId: string,
  fileId: string,
  page: number,
  selectedImageRegions?: Array<{ page: number; rect: { x: number; y: number; width: number; height: number } }>
) {
  try {
    // Build ImageAnchor array from selectedImageRegions
    const imageAnchors = selectedImageRegions?.map(region => {
      const id = `${region.page}-${region.rect.x.toFixed(4)}-${region.rect.y.toFixed(4)}-${region.rect.width.toFixed(4)}-${region.rect.height.toFixed(4)}`
      return {
        kind: 'image' as const,
        id,
        page: region.page,
        rect: region.rect,
        mime: 'image/jpeg' as const,
      }
    }) || []

    const stickersToCreate = (sharedStickers as Array<{
      anchorText?: string
      anchor_text?: string
      explanation?: string
      content_markdown?: string
      page?: number
    }>).map((s) => {
      const textSnippet = s.anchorText || s.anchor_text || 'Explanation'
      const stickerPage = s.page || page

      // Build anchors array if we have image regions
      let anchorRect = null
      if (imageAnchors.length > 0) {
        const anchors = [
          {
            kind: 'text' as const,
            page: stickerPage,
            textSnippet,
            rect: null,
          },
          ...imageAnchors,
        ]
        // Store extended anchor structure in anchor_rect JSONB field
        anchorRect = { anchors }
      }

      return {
        user_id: userId,
        course_id: courseId,
        file_id: fileId,
        type: 'auto' as const,
        page: stickerPage,
        anchor_text: textSnippet,
        anchor_rect: anchorRect,
        parent_id: null,
        content_markdown: s.explanation || s.content_markdown || '',
        folded: false,
        depth: 0,
      }
    })

    await supabase.from('stickers').insert(stickersToCreate)
  } catch (error) {
    console.error('Error copying shared stickers to user:', error)
    // Non-fatal - user can still see the stickers from the response
  }
}

/**
 * Format shared stickers for API response.
 * If selectedImageRegions is provided (for with_selected_images mode),
 * attaches them as ImageAnchor items to each sticker's anchor.anchors array.
 */
function formatStickers(
  stickers: unknown[],
  selectedImageRegions?: Array<{ page: number; rect: { x: number; y: number; width: number; height: number } }>
): Array<{
  id?: string
  type: string
  page?: number
  anchor: {
    textSnippet: string
    rect: { x: number; y: number; width: number; height: number } | null
    isFullPage?: boolean
    anchors?: Array<{
      kind: 'text' | 'image'
      page: number
      textSnippet?: string
      rect?: { x: number; y: number; width: number; height: number } | null
      id?: string
      mime?: 'image/jpeg'
    }>
  }
  parentId: null
  contentMarkdown: string
  folded: boolean
  depth: number
  createdAt?: string
}> {
  // Build ImageAnchor array from selectedImageRegions
  const imageAnchors = selectedImageRegions?.map(region => {
    // Generate deterministic region ID (same format as frontend)
    const id = `${region.page}-${region.rect.x.toFixed(4)}-${region.rect.y.toFixed(4)}-${region.rect.width.toFixed(4)}-${region.rect.height.toFixed(4)}`
    return {
      kind: 'image' as const,
      id,
      page: region.page,
      rect: region.rect,
      mime: 'image/jpeg' as const,
    }
  }) || []

  return (stickers as Array<{
    id?: string
    anchorText?: string
    anchor_text?: string
    explanation?: string
    content_markdown?: string
    page?: number
    created_at?: string
    anchor_rect?: { rect?: { x: number; y: number; width: number; height: number }; isFullPage?: boolean } | null
  }>).map((s, index) => {
    const textSnippet = s.anchorText || s.anchor_text || 'Explanation'
    const stickerPage = s.page || 1

    // Extract rect and isFullPage from anchor_rect
    const anchorRect = s.anchor_rect
    const rect = anchorRect?.rect || null
    const isFullPage = anchorRect?.isFullPage

    // Build anchors array: text anchor + image anchors
    const anchors: Array<{
      kind: 'text' | 'image'
      page: number
      textSnippet?: string
      rect?: { x: number; y: number; width: number; height: number } | null
      id?: string
      mime?: 'image/jpeg'
    }> = [
      {
        kind: 'text',
        page: stickerPage,
        textSnippet,
        rect: null,
      },
      ...imageAnchors,
    ]

    return {
      id: s.id || `shared-${index}`,
      type: 'auto',
      page: stickerPage,
      anchor: {
        textSnippet,
        rect,
        isFullPage,
        anchors: imageAnchors.length > 0 ? anchors : undefined,
      },
      parentId: null,
      contentMarkdown: s.explanation || s.content_markdown || '',
      folded: false,
      depth: 0,
      createdAt: s.created_at || new Date().toISOString(),
    }
  })
}

// ==================== Multipart Request Parsing ====================

/**
 * Parse multipart/form-data request for with_selected_images mode.
 * 
 * Expected format:
 * - `payload`: JSON string with MultipartPayload
 * - `image_0`, `image_1`, ...: JPEG image files (matching selectedImageRegions order)
 * 
 * @param request - NextRequest with multipart content
 * @returns ParsedMultipartRequest or error response
 */
async function parseMultipartRequest(
  request: NextRequest
): Promise<ParsedMultipartRequest | { error: NextResponse }> {
  try {
    // Parse form data
    const formData = await request.formData()

    // Extract and parse JSON payload
    const payloadString = formData.get('payload')
    if (typeof payloadString !== 'string') {
      return {
        error: errors.invalidInput('Missing or invalid "payload" field in multipart request'),
      }
    }

    let payloadJson: unknown
    try {
      payloadJson = JSON.parse(payloadString)
    } catch {
      return {
        error: errors.invalidInput('Invalid JSON in "payload" field'),
      }
    }

    // Validate payload against schema
    const parseResult = multipartPayloadSchema.safeParse(payloadJson)
    if (!parseResult.success) {
      const errorMessage = parseResult.error.errors[0]?.message || 'Invalid payload'
      return {
        error: errors.invalidInput(errorMessage),
      }
    }

    const payload = parseResult.data as MultipartPayload

    // Validate each region's rect bounds
    for (let i = 0; i < payload.selectedImageRegions.length; i++) {
      const region = payload.selectedImageRegions[i]
      if (!isValidNormalizedRect(region.rect)) {
        return {
          error: errors.invalidInput(
            `Invalid coordinates for region ${i}: rect must be within 0..1 bounds with positive size`
          ),
        }
      }
    }

    // Extract image files
    const images: Buffer[] = []
    let imageIndex = 0
    while (true) {
      const file = formData.get(`image_${imageIndex}`)
      if (!file) break

      if (!(file instanceof File)) {
        return {
          error: errors.invalidInput(`image_${imageIndex} is not a valid file`),
        }
      }

      // Validate MIME type
      if (!file.type.startsWith('image/jpeg') && file.type !== 'image/jpg') {
        return {
          error: errors.invalidInput(
            `image_${imageIndex} must be JPEG format (got ${file.type})`
          ),
        }
      }

      // Convert File to Buffer
      const arrayBuffer = await file.arrayBuffer()
      images.push(Buffer.from(arrayBuffer))
      imageIndex++
    }

    // Validate image count matches region count
    const expectedCount = payload.selectedImageRegions.length
    if (images.length !== expectedCount) {
      return {
        error: errors.invalidInput(
          `Image count mismatch: expected ${expectedCount} images, got ${images.length}`
        ),
      }
    }

    return {
      payload,
      images,
    }
  } catch (error) {
    console.error('Error parsing multipart request:', error)
    return {
      error: errors.invalidInput('Failed to parse multipart request'),
    }
  }
}

// ==================== Window Mode Handler ====================

/**
 * Handle window mode (sliding window auto-explain)
 *
 * Creates a session and starts background generation for pages in the window.
 * Returns 202 with sessionId and window info.
 */
async function handleWindowMode(
  supabase: ReturnType<typeof createClient>,
  params: {
    user: { id: string }
    courseId: string
    fileId: string
    page: number
    pdfType: 'Lecture' | 'Homework' | 'Exam' | 'Other'
    locale: 'en' | 'zh' | 'zh-Hans'
  }
): Promise<NextResponse> {
  const { user, courseId, fileId, page, pdfType, locale } = params

  try {
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
      return errors.custom(
        'FILE_IS_SCANNED',
        'Scanned PDFs do not support auto-explain window mode',
        400
      )
    }

    // Check if page is valid
    if (page > file.page_count) {
      return errors.invalidInput(`Page ${page} does not exist (file has ${file.page_count} pages)`)
    }

    // Check quota
    const quotaCheck = await checkQuota(supabase, user.id, 'autoExplain')
    if (!quotaCheck.allowed) {
      return errors.custom('QUOTA_EXCEEDED', 'Auto explain quota exceeded', 429, {
        bucket: 'autoExplain',
        used: quotaCheck.quota.used,
        limit: quotaCheck.quota.limit,
        resetAt: quotaCheck.quota.resetAt,
      })
    }

    // Download PDF to detect type
    const { data: pdfData, error: downloadError } = await supabase.storage
      .from('course-files')
      .download(file.storage_key)

    if (downloadError || !pdfData) {
      console.error('Error downloading PDF for window mode:', downloadError)
      return errors.internalError()
    }

    const buffer = Buffer.from(await pdfData.arrayBuffer())

    // Detect PDF type (with caching)
    const detectedPdfType = await getOrDetectPdfType(fileId, buffer)

    // Start session
    const sessionResult = await startSession(user.id, fileId, page, detectedPdfType)

    if (!sessionResult.success) {
      if (sessionResult.error === 'SESSION_EXISTS') {
        return errors.custom(
          'SESSION_EXISTS',
          'An active auto-explain session already exists for this file',
          409
        )
      }
      return errors.custom('SESSION_ERROR', sessionResult.error, 500)
    }

    const session = sessionResult.session

    // Start background generation (non-blocking)
    // Use setImmediate to avoid blocking the response
    setImmediate(() => {
      runWindowGeneration({
        session,
        pdfBuffer: buffer,
        pdfType: detectedPdfType,
        userPdfType: pdfType,
        courseId,
        totalPages: file.page_count,
        locale: normalizeToUserLocale(locale),
      }).catch((err) => {
        console.error('Background window generation error:', err)
      })
    })

    // Return 202 with session info
    return successResponse(
      {
        sessionId: session.sessionId,
        windowRange: {
          start: session.windowStart,
          end: session.windowEnd,
        },
        pdfType: detectedPdfType,
        message: 'Auto-explain session started. Poll /api/ai/explain-page/session/:sessionId for updates.',
      },
      202
    )
  } catch (error) {
    console.error('Error in window mode handler:', error)
    return errors.internalError()
  }
}

/**
 * Run window generation in the background
 * Uses saveImmediately option to enable progressive display
 */
async function runWindowGeneration(params: {
  session: WindowState
  pdfBuffer: Buffer
  pdfType: PdfType
  userPdfType: 'Lecture' | 'Homework' | 'Exam' | 'Other'
  courseId: string
  totalPages: number
  locale: Locale
}) {
  const { session, pdfBuffer, pdfType, userPdfType, courseId, totalPages, locale } = params

  try {
    // Get pages to generate in priority order (current, +1, -1, +2, +3, -2, +4, +5)
    const pagesToGenerate = getPagesToGenerate(
      session.windowStart,
      session.windowEnd,
      session.pagesCompleted,
      session.pagesInProgress,
      session.currentPage
    )

    if (pagesToGenerate.length === 0) {
      await completeSession(session.sessionId)
      return
    }

    // Generate stickers based on PDF type
    // saveImmediately=true enables progressive display (stickers saved right after generation)
    if (pdfType === 'ppt') {
      await generatePptPdfStickers(pdfBuffer, pagesToGenerate, {
        userId: session.userId,
        courseId,
        fileId: session.fileId,
        pdfType: userPdfType,
        totalPages,
        sessionId: session.sessionId,
        saveImmediately: true, // Save each sticker immediately for progressive display
        locale,
        onPageComplete: (result) => {
          console.log(`PPT page ${result.page} completed:`, result.success)
        },
      })
    } else {
      // Text PDF - use paragraph accumulation
      await generateTextPdfStickers(pdfBuffer, pagesToGenerate, {
        userId: session.userId,
        courseId,
        fileId: session.fileId,
        sessionId: session.sessionId,
        saveImmediately: true, // Save each sticker immediately for progressive display
        locale,
        onPageComplete: (page, stickerCount) => {
          console.log(`Text page ${page} completed with ${stickerCount} stickers`)
        },
      })
    }

    // Mark session as completed
    await completeSession(session.sessionId)
    console.log(`Window generation completed for session ${session.sessionId}`)
  } catch (error) {
    console.error(`Window generation failed for session ${session.sessionId}:`, error)
  }
}
