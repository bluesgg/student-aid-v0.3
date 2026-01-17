import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import { createVersion, getStickerWithVersions } from '@/lib/stickers/version-manager'
import { extractPageText, extractPagesText } from '@/lib/pdf/extract'
import { getOpenAIClient, DEFAULT_MODEL } from '@/lib/openai/client'
import { retrieveContextForPage, buildContextHint } from '@/lib/context'

// Debounce map: stickerId -> last refresh timestamp
const lastRefreshMap = new Map<string, number>()
const DEBOUNCE_MS = 3000

/**
 * POST /api/ai/explain-page/sticker/[stickerId]/refresh
 * Regenerate sticker explanation and create new version
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { stickerId: string } }
) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    // Check debounce
    const lastRefresh = lastRefreshMap.get(params.stickerId)
    if (lastRefresh && Date.now() - lastRefresh < DEBOUNCE_MS) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'DEBOUNCE',
            message: 'Please wait a few seconds before refreshing again',
          },
        },
        { status: 429 }
      )
    }

    // Get sticker
    const { data: sticker, error: stickerError } = await supabase
      .from('stickers')
      .select('*, files(*)')
      .eq('id', params.stickerId)
      .single()

    if (stickerError || !sticker) {
      return errors.notFound('Sticker')
    }

    // Verify ownership
    if (sticker.user_id !== user.id) {
      return errors.notFound('Sticker')
    }

    // Can only refresh auto stickers
    if (sticker.type !== 'auto') {
      return errors.custom('INVALID_TYPE', 'Can only refresh auto stickers', 400)
    }

    // Update debounce
    lastRefreshMap.set(params.stickerId, Date.now())

    const file = sticker.files
    if (!file) {
      return errors.custom('FILE_NOT_FOUND', 'Associated file not found', 400)
    }

    // Download PDF
    const { data: pdfData, error: downloadError } = await supabase.storage
      .from('course-files')
      .download(file.storage_key)

    if (downloadError || !pdfData) {
      return errors.custom('DOWNLOAD_ERROR', 'Failed to download PDF', 500)
    }

    const buffer = Buffer.from(await pdfData.arrayBuffer())

    // Extract text based on page_range
    let pageText: string
    let pageInfo: string

    if (sticker.page_range) {
      // Cross-page sticker - extract from range
      const range = sticker.page_range as {
        start: { page: number }
        end: { page: number }
      }
      pageText = await extractPagesText(buffer, range.start.page, range.end.page)
      pageInfo = `pages ${range.start.page}-${range.end.page}`
    } else {
      // Single page sticker
      const { text } = await extractPageText(buffer, sticker.page)
      pageText = text
      pageInfo = `page ${sticker.page}`
    }

    if (!pageText || pageText.trim().length < 20) {
      return errors.custom('INSUFFICIENT_TEXT', 'Insufficient text for regeneration', 400)
    }

    // Retrieve context (optional)
    let contextHint = ''
    try {
      const contextResult = await retrieveContextForPage({
        userId: user.id,
        courseId: sticker.course_id,
        fileId: sticker.file_id,
        currentPage: sticker.page,
        pageText,
      })
      if (contextResult.entries.length > 0) {
        contextHint = buildContextHint(contextResult.entries)
      }
    } catch {
      // Silent degradation
    }

    // Build prompt for regeneration
    const prompt = `Please provide a fresh, alternative explanation for the following content from ${pageInfo}.

This is a regeneration request - the user wants a different perspective or clearer explanation than before.

Focus on:
1. Explaining the main concept in a different way
2. Using different examples or analogies if applicable
3. Providing additional clarity where the original explanation might have been unclear

Content:
${pageText}

Anchor text (the specific part being explained):
${sticker.anchor_text}

Provide your explanation in markdown format. Make it thorough but concise.`

    const baseSystemMessage =
      'You are an expert educational AI tutor. You help students understand complex academic material by providing clear, thorough explanations. This is a regeneration request - provide a fresh perspective.'
    const systemMessage = contextHint
      ? `${baseSystemMessage}\n${contextHint}`
      : baseSystemMessage

    // Call OpenAI
    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8, // Slightly higher for variety
      max_tokens: 2000,
    })

    const newContent = completion.choices[0]?.message?.content
    if (!newContent) {
      return errors.custom('AI_ERROR', 'AI did not return a response', 500)
    }

    // Create new version
    const versionResult = await createVersion(params.stickerId, newContent)

    if (!versionResult.success) {
      return errors.custom('VERSION_ERROR', versionResult.error, 500)
    }

    return successResponse({
      ok: true,
      sticker: {
        id: versionResult.sticker.id,
        currentVersion: versionResult.sticker.currentVersion,
        contentMarkdown: versionResult.sticker.contentMarkdown,
        versions: versionResult.sticker.versions.map((v) => ({
          version: v.versionNumber,
          contentMarkdown: v.contentMarkdown,
          createdAt: v.createdAt,
        })),
        page: versionResult.sticker.page,
        anchorText: versionResult.sticker.anchorText,
        pageRange: versionResult.sticker.pageRange,
      },
    })
  } catch (error) {
    console.error('Error refreshing sticker:', error)
    return errors.internalError()
  }
}
