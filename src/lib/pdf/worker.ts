/**
 * PDF.js worker configuration for react-pdf.
 * This ensures the PDF.js worker is loaded correctly across different environments.
 */

import { pdfjs } from 'react-pdf'

// Configure the PDF.js worker
// Using the CDN for simplicity and cross-browser compatibility
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

export { pdfjs }
