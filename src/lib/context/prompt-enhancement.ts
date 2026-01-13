/**
 * Prompt enhancement utilities for injecting context into AI prompts.
 * Formats context entries as structured JSON for optimal AI comprehension.
 */

import type { ContextEntry, ContextRetrievalResult } from './types'

/**
 * Format a single context entry for injection
 */
interface FormattedEntry {
  type: string
  title: string
  content: string
  source: string
}

/**
 * Format context entries for prompt injection.
 * Converts entries to a structured format with source citations.
 */
function formatEntriesForPrompt(entries: ContextEntry[]): FormattedEntry[] {
  return entries.map((entry) => ({
    type: entry.type,
    title: entry.title,
    content: entry.content,
    source: `Page ${entry.sourcePage}`,
  }))
}

/**
 * Build context section for prompt injection.
 * Returns empty string if no context available.
 */
export function buildContextSection(entries: ContextEntry[]): string {
  if (!entries || entries.length === 0) {
    return ''
  }

  const formatted = formatEntriesForPrompt(entries)
  const contextJson = JSON.stringify(formatted, null, 2)

  return `
<knowledge-base>
You have access to the following knowledge entries extracted from this course's documents. Use them to provide accurate definitions and context when explaining concepts.

${contextJson}

When referencing entries from the knowledge base, cite the source (e.g., "As defined on Page X...").
</knowledge-base>`
}

/**
 * Build an enhanced prompt that includes context.
 * Used for explain-selection and Q&A endpoints.
 *
 * @param basePrompt - The original prompt without context
 * @param contextResult - Result from retrieveContext()
 * @returns Enhanced prompt with context section prepended
 */
export function buildEnhancedPrompt(
  basePrompt: string,
  contextResult: ContextRetrievalResult
): string {
  const contextSection = buildContextSection(contextResult.entries)

  if (!contextSection) {
    return basePrompt
  }

  // Prepend context section to the base prompt
  return `${contextSection}

${basePrompt}`
}

/**
 * Build an enhanced system message that includes context.
 * Alternative approach: inject context into system message instead of user prompt.
 */
export function buildEnhancedSystemMessage(
  baseSystemMessage: string,
  contextResult: ContextRetrievalResult
): string {
  const contextSection = buildContextSection(contextResult.entries)

  if (!contextSection) {
    return baseSystemMessage
  }

  return `${baseSystemMessage}

${contextSection}

When answering, prioritize using definitions and concepts from the knowledge base to ensure accuracy. Always cite page numbers when referencing knowledge base entries.`
}

/**
 * Build a minimal context hint for explain-page.
 * For explain-page, we use a lighter context injection to avoid
 * biasing the sticker generation too much.
 */
export function buildContextHint(entries: ContextEntry[]): string {
  if (!entries || entries.length === 0) {
    return ''
  }

  // Only include definitions and formulas for explain-page
  const relevantEntries = entries.filter(
    (e) => e.type === 'definition' || e.type === 'formula'
  )

  if (relevantEntries.length === 0) {
    return ''
  }

  const hints = relevantEntries
    .slice(0, 5) // Limit to 5 hints
    .map((e) => `- ${e.title}: ${e.content.slice(0, 150)}...`)
    .join('\n')

  return `
Note: The following definitions/formulas from earlier in this document may be relevant:
${hints}

Use these definitions when explaining concepts that reference them.`
}

/**
 * Create context-aware messages array for OpenAI API.
 * Handles both system and user message enhancement.
 */
export function createContextAwareMessages(params: {
  systemMessage: string
  userPrompt: string
  contextResult: ContextRetrievalResult
  mode: 'system' | 'user' | 'both'
}): Array<{ role: 'system' | 'user'; content: string }> {
  const { systemMessage, userPrompt, contextResult, mode } = params

  const messages: Array<{ role: 'system' | 'user'; content: string }> = []

  if (mode === 'system' || mode === 'both') {
    messages.push({
      role: 'system',
      content: buildEnhancedSystemMessage(systemMessage, contextResult),
    })
    messages.push({
      role: 'user',
      content: userPrompt,
    })
  } else if (mode === 'user') {
    messages.push({
      role: 'system',
      content: systemMessage,
    })
    messages.push({
      role: 'user',
      content: buildEnhancedPrompt(userPrompt, contextResult),
    })
  }

  return messages
}

/**
 * Check if context retrieval was successful and has entries.
 */
export function hasContextEntries(result: ContextRetrievalResult): boolean {
  return result.entries && result.entries.length > 0
}

/**
 * Get context summary for logging/monitoring.
 */
export function getContextSummary(result: ContextRetrievalResult): {
  count: number
  types: Record<string, number>
  totalTokens: number
  retrievalTimeMs: number
} {
  const types: Record<string, number> = {}
  for (const entry of result.entries) {
    types[entry.type] = (types[entry.type] || 0) + 1
  }

  return {
    count: result.entries.length,
    types,
    totalTokens: result.totalTokens,
    retrievalTimeMs: result.retrievalTimeMs,
  }
}
