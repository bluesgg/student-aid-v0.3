/**
 * Debug logging utility for PDF viewer components.
 *
 * Controlled by NEXT_PUBLIC_DEBUG_PDF_VIEWER environment variable.
 * When disabled (default), has zero runtime cost - early return prevents
 * string interpolation and function call overhead.
 *
 * Usage:
 *   import { debugLog } from '@/lib/debug'
 *   debugLog('[PdfViewer]', 'Loading page', pageNumber)
 */

const isDebugEnabled =
  typeof window !== 'undefined' &&
  process.env.NEXT_PUBLIC_DEBUG_PDF_VIEWER === 'true'

/**
 * Logs debug messages to console when NEXT_PUBLIC_DEBUG_PDF_VIEWER=true.
 * No-op in production or when env var is not set.
 *
 * @param args - Arguments to pass to console.log
 */
export function debugLog(...args: unknown[]): void {
  if (!isDebugEnabled) return
  console.log(...args)
}

/**
 * Creates a prefixed debug logger for a specific component/module.
 *
 * @param prefix - Prefix to add to all log messages (e.g., '[PdfViewer]')
 * @returns A debug log function with the prefix pre-applied
 *
 * Usage:
 *   const log = createDebugLogger('[PdfViewer]')
 *   log('Loading page', pageNumber) // logs: [PdfViewer] Loading page 1
 */
export function createDebugLogger(prefix: string) {
  return (...args: unknown[]): void => {
    if (!isDebugEnabled) return
    console.log(prefix, ...args)
  }
}
