'use client'

import { ReactNode } from 'react'
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels'
import { useLayoutPreferences, PANEL_CONSTRAINTS } from '../hooks/use-layout-preferences'

interface ResizableLayoutProps {
  pdfPanel: ReactNode
  stickerPanel: ReactNode
  qaPanel: ReactNode
}

export function ResizableLayout({
  pdfPanel,
  stickerPanel,
  qaPanel,
}: ResizableLayoutProps) {
  const { preferences, isLoaded, updatePanelSizes } = useLayoutPreferences()

  // Handle layout changes (triggered when user finishes resizing)
  const handleLayoutChange = (sizes: number[]) => {
    updatePanelSizes(sizes)
  }

  // Don't render until preferences are loaded to avoid flash
  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <PanelGroup
      direction="horizontal"
      className="h-full"
      onLayout={handleLayoutChange}
    >
      {/* PDF Viewer Panel (Left) */}
      <Panel
        id="pdf-panel"
        order={1}
        defaultSize={preferences.pdfPanelSize}
        minSize={PANEL_CONSTRAINTS.minSize}
        maxSize={PANEL_CONSTRAINTS.maxSize}
        className="bg-gray-100"
      >
        {pdfPanel}
      </Panel>

      {/* Resize Handle */}
      <PanelResizeHandle className="group relative w-1 bg-gray-200 transition-colors hover:bg-blue-400 active:bg-blue-500">
        <div className="absolute inset-y-0 -left-1 -right-1 z-10" />
        <div className="absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded bg-gray-400 opacity-0 transition-opacity group-hover:opacity-100" />
      </PanelResizeHandle>

      {/* Sticker Panel (Middle) */}
      <Panel
        id="sticker-panel"
        order={2}
        defaultSize={preferences.stickerPanelSize}
        minSize={PANEL_CONSTRAINTS.minSize}
        maxSize={PANEL_CONSTRAINTS.maxSize}
        className="bg-white"
      >
        {stickerPanel}
      </Panel>

      {/* Resize Handle */}
      <PanelResizeHandle className="group relative w-1 bg-gray-200 transition-colors hover:bg-blue-400 active:bg-blue-500">
        <div className="absolute inset-y-0 -left-1 -right-1 z-10" />
        <div className="absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded bg-gray-400 opacity-0 transition-opacity group-hover:opacity-100" />
      </PanelResizeHandle>

      {/* Q&A Panel (Right) */}
      <Panel
        id="qa-panel"
        order={3}
        defaultSize={preferences.qaPanelSize}
        minSize={PANEL_CONSTRAINTS.minSize}
        maxSize={PANEL_CONSTRAINTS.maxSize}
        className="bg-white"
      >
        {qaPanel}
      </Panel>
    </PanelGroup>
  )
}
