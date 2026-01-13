/**
 * Context Library - Shared context extraction and retrieval for AI enhancement.
 *
 * This module provides:
 * - Automatic context extraction from PDFs (definitions, formulas, theorems, etc.)
 * - Cross-user content sharing via pdf_hash
 * - Context retrieval and injection for AI features
 * - Storage and usage quota management
 */

// Types and constants
export * from './types'

// Utility functions
export * from './utils'

// Keyword extraction (LLM-based)
export {
  extractKeywords,
  clearKeywordCache,
  getKeywordCacheStats,
  resetCacheStats,
  logCacheStats,
  type KeywordCacheStatsResult,
} from './keyword-extraction'

// Context retrieval
export {
  retrieveContext,
  retrieveContextForPage,
} from './context-retrieval'

// Prompt enhancement
export {
  buildContextSection,
  buildEnhancedPrompt,
  buildEnhancedSystemMessage,
  buildContextHint,
  createContextAwareMessages,
  hasContextEntries,
  getContextSummary,
} from './prompt-enhancement'

// Metrics tracking
export {
  recordMetric,
  recordAverageQualityScore,
  recordRetrievalLatency,
  getMetricsSummary,
  type MetricField,
} from './metrics'
