/**
 * PDF.js worker configuration for react-pdf.
 * This ensures the PDF.js worker is loaded correctly across different environments.
 */

import { pdfjs } from 'react-pdf'

// Configure the PDF.js worker
// Use local worker file from public folder for reliability
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'

export { pdfjs }
