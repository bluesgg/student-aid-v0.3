/**
 * OpenAI client configuration for server-side use only.
 * This file must never be imported from client components.
 */

import OpenAI from 'openai'

// Singleton instance
let openaiClient: OpenAI | null = null

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }

    openaiClient = new OpenAI({
      apiKey,
      organization: process.env.OPENAI_ORG_ID,
    })
  }

  return openaiClient
}

// Default model for AI operations
export const DEFAULT_MODEL = 'gpt-4-turbo-preview'

// Token pricing for cost tracking (per 1000 tokens)
export const TOKEN_PRICING = {
  'gpt-4-turbo-preview': { input: 0.01, output: 0.03 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
} as const

// Calculate estimated cost
export function calculateCost(
  model: keyof typeof TOKEN_PRICING,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = TOKEN_PRICING[model]
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1000
}
