/**
 * Prompts for auto-explain page feature.
 * Generates 2-6 stickers explaining key concepts on a page.
 * 
 * Supports two modes:
 * 1. Text-only/with-images: Analyzes entire page content
 * 2. With-selected-images: Analyzes user-selected image regions
 */

import type { ChatCompletionContentPart } from 'openai/resources/chat/completions'

export interface ExplainPageContext {
  pageText: string
  pageNumber: number
  pdfType: 'Lecture' | 'Homework' | 'Exam' | 'Other'
  totalPages: number
}

// ==================== Selected Images Mode Types ====================

export interface SelectedRegionInfo {
  page: number
  index: number
  base64: string  // JPEG image encoded as base64
}

export interface ExplainSelectedImagesContext {
  rootPage: number
  pdfType: 'Lecture' | 'Homework' | 'Exam' | 'Other'
  totalPages: number
  referenceContext: string
  selectedRegions: SelectedRegionInfo[]
  locale: 'en' | 'zh-Hans'
  textSelection?: {
    page: number
    textSnippet: string
  }
}

export function buildExplainPagePrompt(context: ExplainPageContext): string {
  const typeContext = {
    Lecture: 'lecture notes or slides',
    Homework: 'homework or assignment',
    Exam: 'exam or quiz',
    Other: 'educational document',
  }[context.pdfType]

  return `You are an expert educational AI tutor. Analyze the following page from ${typeContext} and identify 2-6 key concepts, terms, or ideas that a student might need explained.

For each concept, provide a clear, helpful explanation that:
1. Defines the concept in simple terms
2. Explains its significance or context
3. Uses examples where helpful
4. Includes relevant mathematical formulas in LaTeX when applicable

PAGE ${context.pageNumber} OF ${context.totalPages}:
---
${context.pageText}
---

Respond in JSON format with an array of explanations:
{
  "explanations": [
    {
      "anchorText": "the exact text phrase from the page being explained (max 100 chars)",
      "explanation": "your explanation in Markdown format with LaTeX math ($...$ for inline, $$...$$ for block)"
    }
  ]
}

Guidelines:
- Focus on concepts that are central to understanding the page
- Keep explanations concise but thorough (100-300 words each)
- Use proper Markdown formatting (headers, lists, bold/italic)
- Use LaTeX for all mathematical expressions
- If this is a homework/exam page, explain the problem-solving approach rather than giving answers
- Return between 2 and 6 explanations based on content density`
}

export interface ExplainPageResponse {
  explanations: Array<{
    anchorText: string
    explanation: string
  }>
}

export function parseExplainPageResponse(content: string): ExplainPageResponse {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in response')
    }

    const parsed = JSON.parse(jsonMatch[0])

    if (!Array.isArray(parsed.explanations)) {
      throw new Error('Invalid response format: explanations must be an array')
    }

    return {
      explanations: parsed.explanations.slice(0, 6).map((e: { anchorText?: string; explanation?: string }) => ({
        anchorText: String(e.anchorText || '').slice(0, 100),
        explanation: String(e.explanation || ''),
      })),
    }
  } catch (error) {
    console.error('Failed to parse explain-page response:', error)
    // Return a fallback response
    return {
      explanations: [{
        anchorText: 'Page content',
        explanation: content,
      }],
    }
  }
}

// ==================== Selected Images Mode ====================

/**
 * System prompt for selected images mode.
 * Instructs the AI to focus on user-selected image regions.
 */
const SELECTED_IMAGES_SYSTEM_PROMPT_EN = `You are an expert educational AI tutor specializing in explaining visual content from academic materials. The user has selected specific image regions from a document for explanation.

Your task:
1. Analyze the selected image(s) carefully
2. Use the provided reference context to understand how these visuals relate to the surrounding text
3. Provide clear, educational explanations for each selected region

Guidelines:
- Focus on what the image shows and its educational significance
- Connect the visual content to concepts mentioned in the reference text
- Use proper terminology from the academic context
- Include relevant mathematical formulas in LaTeX when applicable ($...$ for inline, $$...$$ for block)
- If the image shows a diagram, explain its components and relationships
- If the image shows a formula or equation, explain what it represents and how to use it
- If the image shows data (chart/graph), explain what the data reveals`

const SELECTED_IMAGES_SYSTEM_PROMPT_ZH = `你是一位专门解释学术资料中视觉内容的教育AI导师。用户已从文档中选择了特定的图像区域进行解释。

你的任务：
1. 仔细分析所选图像
2. 使用提供的参考上下文来理解这些视觉内容与周围文本的关系
3. 为每个选定区域提供清晰的教育性解释

指南：
- 重点解释图像展示的内容及其教育意义
- 将视觉内容与参考文本中提到的概念联系起来
- 使用学术语境中的正确术语
- 在适用时包含LaTeX格式的数学公式（行内公式用$...$，独立公式用$$...$$）
- 如果图像显示的是图表，解释其组成部分和关系
- 如果图像显示的是公式或方程，解释其含义和使用方法
- 如果图像显示的是数据（图表/曲线），解释数据揭示的信息`

/**
 * Build multimodal messages for selected images explanation.
 * Creates a message array with text and image content parts.
 * 
 * @param context - Context including reference text and selected images
 * @returns Array of chat completion messages
 */
export function buildSelectedImagesMessages(
  context: ExplainSelectedImagesContext
): Array<{ role: 'system' | 'user'; content: string | ChatCompletionContentPart[] }> {
  const systemPrompt = context.locale === 'zh-Hans'
    ? SELECTED_IMAGES_SYSTEM_PROMPT_ZH
    : SELECTED_IMAGES_SYSTEM_PROMPT_EN

  // Build user message with text and images
  const userContentParts: ChatCompletionContentPart[] = []

  // Add text instruction
  const textInstruction = context.locale === 'zh-Hans'
    ? buildSelectedImagesUserPromptZh(context)
    : buildSelectedImagesUserPromptEn(context)
  
  userContentParts.push({
    type: 'text',
    text: textInstruction,
  })

  // Add each selected image
  for (const region of context.selectedRegions) {
    userContentParts.push({
      type: 'image_url',
      image_url: {
        url: `data:image/jpeg;base64,${region.base64}`,
        detail: 'high',  // Use high detail for academic content
      },
    })
  }

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContentParts },
  ]
}

function buildSelectedImagesUserPromptEn(context: ExplainSelectedImagesContext): string {
  const typeContext = {
    Lecture: 'lecture notes or slides',
    Homework: 'homework or assignment',
    Exam: 'exam or quiz',
    Other: 'educational document',
  }[context.pdfType]

  let prompt = `I'm studying ${typeContext} (page ${context.rootPage} of ${context.totalPages}).`

  if (context.textSelection) {
    prompt += `\n\nI've also selected this text: "${context.textSelection.textSnippet}"`
  }

  prompt += `\n\nReference context from the document:
---
${context.referenceContext}
---

I've selected ${context.selectedRegions.length} image region(s) that I need explained. Please analyze each selected region and provide educational explanations.`

  prompt += `\n\nRespond in JSON format:
{
  "explanations": [
    {
      "anchorText": "brief description of what this image shows (max 100 chars)",
      "explanation": "your detailed explanation in Markdown format with LaTeX math"
    }
  ]
}

Note: Provide one explanation per selected image region, in the same order as the images appear.`

  return prompt
}

function buildSelectedImagesUserPromptZh(context: ExplainSelectedImagesContext): string {
  const typeContext = {
    Lecture: '讲义或课件',
    Homework: '作业或练习',
    Exam: '考试或测验',
    Other: '学习材料',
  }[context.pdfType]

  let prompt = `我正在学习${typeContext}（第${context.rootPage}页，共${context.totalPages}页）。`

  if (context.textSelection) {
    prompt += `\n\n我还选中了这段文字："${context.textSelection.textSnippet}"`
  }

  prompt += `\n\n文档中的参考上下文：
---
${context.referenceContext}
---

我选择了${context.selectedRegions.length}个需要解释的图像区域。请分析每个选定区域并提供教育性解释。`

  prompt += `\n\n请以JSON格式回复：
{
  "explanations": [
    {
      "anchorText": "简要描述此图像显示的内容（最多100字符）",
      "explanation": "使用Markdown格式和LaTeX数学公式的详细解释"
    }
  ]
}

注意：请为每个选定的图像区域提供一个解释，顺序与图像出现顺序一致。`

  return prompt
}

/**
 * Response type for selected images explanation.
 */
export interface ExplainSelectedImagesResponse {
  explanations: Array<{
    anchorText: string
    explanation: string
    regionIndex: number  // Index of the corresponding selected region
  }>
}

/**
 * Parse response from selected images explanation.
 * Ensures each explanation maps back to a region.
 * 
 * @param content - Raw response content from AI
 * @param regionCount - Expected number of regions
 * @returns Parsed response with region mappings
 */
export function parseSelectedImagesResponse(
  content: string,
  regionCount: number
): ExplainSelectedImagesResponse {
  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('No JSON found in response')
    }

    const parsed = JSON.parse(jsonMatch[0])

    if (!Array.isArray(parsed.explanations)) {
      throw new Error('Invalid response format: explanations must be an array')
    }

    // Map explanations to regions (by order)
    const explanations = parsed.explanations.slice(0, regionCount).map(
      (e: { anchorText?: string; explanation?: string }, index: number) => ({
        anchorText: String(e.anchorText || '').slice(0, 100),
        explanation: String(e.explanation || ''),
        regionIndex: index,
      })
    )

    // If fewer explanations than regions, fill with defaults
    while (explanations.length < regionCount) {
      explanations.push({
        anchorText: `Selected region ${explanations.length + 1}`,
        explanation: 'Unable to generate explanation for this region.',
        regionIndex: explanations.length,
      })
    }

    return { explanations }
  } catch (error) {
    console.error('Failed to parse selected-images response:', error)
    // Return a fallback response for each region
    return {
      explanations: Array.from({ length: regionCount }, (_, i) => ({
        anchorText: `Selected region ${i + 1}`,
        explanation: content || 'Unable to generate explanation.',
        regionIndex: i,
      })),
    }
  }
}
