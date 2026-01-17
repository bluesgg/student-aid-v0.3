/**
 * Auto-Explain Module
 * Intelligent auto-explanation with sliding window support.
 */

// Window manager
export {
  WindowManager,
  calculateWindow,
  isJump,
  getPagesToGenerate,
  getPagesToCancel,
  startSession,
  updateSessionWindow,
  getSessionState,
  updateSessionProgress,
  getActiveSession,
  cancelSession,
  completeSession,
} from './window-manager'

export type { WindowState } from './window-manager'

// PDF type-specific generators
export {
  generatePptPageSticker,
  generatePptPdfStickers,
  saveStickersToDatabase as savePptStickers,
  type GeneratedSticker as PptSticker,
  type PageGenerationResult,
} from './ppt-pdf-generator'

export {
  generateTextPdfStickers,
  saveTextStickersToDatabase as saveTextStickers,
  type TextPdfSticker,
  type PageRange,
} from './text-pdf-generator'
