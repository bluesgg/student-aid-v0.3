'use client'

/**
 * PDF Region Overlay Component
 * Renders selection rectangles on top of PDF pages with interactive controls.
 */

import { type NormalizedRect } from '@/lib/stickers/selection-hash'

// ==================== Types ====================

export interface Region {
  id: string
  page: number
  rect: NormalizedRect
  status: 'draft' | 'persisted'
}

export interface PdfRegionOverlayProps {
  /** Regions to render */
  regions: Region[]
  /** Current page number */
  currentPage: number
  /** Page width in pixels */
  pageWidth: number
  /** Page height in pixels */
  pageHeight: number
  /** Region IDs to highlight (for sticker hover) */
  highlightedRegionIds: string[]
  /** Callback when a region is deleted */
  onDeleteRegion: (id: string) => void
  /** Whether selection mode is active */
  isSelectionMode: boolean
  /** Currently drawing rect (for preview) */
  drawingRect?: NormalizedRect | null
}

// ==================== Styles ====================

const REGION_COLORS = {
  default: {
    border: 'border-blue-500',
    bg: 'bg-blue-500/[.18]',
  },
  highlighted: {
    border: 'border-blue-600',
    bg: 'bg-blue-500/30',
  },
  drawing: {
    border: 'border-blue-400 border-dashed',
    bg: 'bg-blue-400/10',
  },
}

// ==================== Component ====================

export function PdfRegionOverlay({
  regions,
  currentPage,
  pageWidth,
  pageHeight,
  highlightedRegionIds,
  onDeleteRegion,
  isSelectionMode,
  drawingRect,
}: PdfRegionOverlayProps) {
  // Filter regions for current page
  const pageRegions = regions.filter((r) => r.page === currentPage)

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-visible"
      style={{ width: pageWidth, height: pageHeight }}
    >
      {/* Render existing regions */}
      {pageRegions.map((region) => {
        const isHighlighted = highlightedRegionIds.includes(region.id)
        const colors = isHighlighted ? REGION_COLORS.highlighted : REGION_COLORS.default

        // Convert normalized rect to pixel coordinates
        const style = {
          left: `${region.rect.x * 100}%`,
          top: `${region.rect.y * 100}%`,
          width: `${region.rect.width * 100}%`,
          height: `${region.rect.height * 100}%`,
        }

        return (
          <div
            key={region.id}
            className={`pointer-events-auto absolute border-2 transition-all duration-150 ${colors.border} ${colors.bg} ${isHighlighted ? 'border-[3px]' : ''
              }`}
            style={style}
            data-region-id={region.id}
          >
            {/* Delete button - only show in selection mode */}
            {isSelectionMode && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  onDeleteRegion(region.id)
                }}
                className="absolute flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition-transform hover:scale-110 hover:bg-red-600 z-50"
                style={{ right: '-12px', top: '-12px' }}
                title="Delete region"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}

            {/* Region indicator (bottom-left corner) */}
            <div className="absolute -bottom-1 -left-1 rounded bg-blue-600 px-1 py-0.5 text-[10px] font-medium text-white shadow">
              P{region.page}
            </div>
          </div>
        )
      })}

      {/* Drawing preview rect */}
      {drawingRect && (
        <div
          className={`absolute border-2 ${REGION_COLORS.drawing.border} ${REGION_COLORS.drawing.bg}`}
          style={{
            left: `${drawingRect.x * 100}%`,
            top: `${drawingRect.y * 100}%`,
            width: `${drawingRect.width * 100}%`,
            height: `${drawingRect.height * 100}%`,
          }}
        />
      )}
    </div>
  )
}

// ==================== Helper Component: Region List Summary ====================

interface RegionListSummaryProps {
  regions: Region[]
  onDeleteRegion: (id: string) => void
  highlightedRegionIds: string[]
  onHoverRegion: (id: string | null) => void
}

/**
 * Displays a summary list of all selected regions.
 * Useful for showing regions across multiple pages.
 */
export function RegionListSummary({
  regions,
  onDeleteRegion,
  highlightedRegionIds,
  onHoverRegion,
}: RegionListSummaryProps) {
  if (regions.length === 0) {
    return (
      <div className="py-4 text-center text-sm text-gray-500">
        No regions selected. Draw rectangles on the PDF to select image regions.
      </div>
    )
  }

  // Group regions by page
  const regionsByPage = regions.reduce(
    (acc, region) => {
      const page = region.page
      if (!acc[page]) acc[page] = []
      acc[page].push(region)
      return acc
    },
    {} as Record<number, Region[]>
  )

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-gray-500">
        {regions.length} region{regions.length !== 1 ? 's' : ''} selected
      </div>
      {Object.entries(regionsByPage)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([page, pageRegions]) => (
          <div key={page} className="space-y-1">
            <div className="text-xs font-medium text-gray-600">Page {page}</div>
            {pageRegions.map((region, index) => (
              <div
                key={region.id}
                className={`flex items-center justify-between rounded px-2 py-1 text-xs transition-colors ${highlightedRegionIds.includes(region.id)
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                  }`}
                onMouseEnter={() => onHoverRegion(region.id)}
                onMouseLeave={() => onHoverRegion(null)}
              >
                <span>
                  Region {index + 1}: ({Math.round(region.rect.width * 100)}% ×{' '}
                  {Math.round(region.rect.height * 100)}%)
                </span>
                <button
                  onClick={() => onDeleteRegion(region.id)}
                  className="ml-2 text-red-500 hover:text-red-700"
                  title="Delete"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ))}
    </div>
  )
}
