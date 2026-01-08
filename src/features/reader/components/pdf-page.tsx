'use client'

import { memo, useState } from 'react'
import { Page } from 'react-pdf'

interface PdfPageProps {
  pageNumber: number
  scale: number
  width?: number
  onLoadSuccess?: () => void
}

function PdfPageComponent({ pageNumber, scale, width, onLoadSuccess }: PdfPageProps) {
  const [isLoading, setIsLoading] = useState(true)

  const handleRenderSuccess = () => {
    setIsLoading(false)
    onLoadSuccess?.()
  }

  return (
    <div className="relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      )}
      <Page
        pageNumber={pageNumber}
        scale={scale}
        width={width}
        renderTextLayer={true}
        renderAnnotationLayer={true}
        onRenderSuccess={handleRenderSuccess}
        loading={null}
        className="shadow-lg"
      />
    </div>
  )
}

// Memoize to prevent unnecessary re-renders
export const PdfPage = memo(PdfPageComponent)
