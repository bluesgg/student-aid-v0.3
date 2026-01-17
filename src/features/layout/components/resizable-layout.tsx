'use client'

import { Fragment, ReactNode } from 'react'
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

function ResizeHandle() {
  return (
    <PanelResizeHandle className="group relative w-1 bg-gray-200 transition-colors hover:bg-blue-400 active:bg-blue-500">
      <div className="absolute inset-y-0 -left-1 -right-1 z-10" />
      <div className="absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded bg-gray-400 opacity-0 transition-opacity group-hover:opacity-100" />
    </PanelResizeHandle>
  )
}

interface PanelConfig {
  id: string
  order: number
  defaultSize: number
  className: string
  content: ReactNode
}

export function ResizableLayout({
  pdfPanel,
  stickerPanel,
  qaPanel,
}: ResizableLayoutProps) {
  const { preferences, isLoaded, updatePanelSizes } = useLayoutPreferences()

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  const panels: PanelConfig[] = [
    { id: 'pdf-panel', order: 1, defaultSize: preferences.pdfPanelSize, className: 'bg-gray-100', content: pdfPanel },
    { id: 'sticker-panel', order: 2, defaultSize: preferences.stickerPanelSize, className: 'bg-white', content: stickerPanel },
    { id: 'qa-panel', order: 3, defaultSize: preferences.qaPanelSize, className: 'bg-white', content: qaPanel },
  ]

  return (
    <PanelGroup direction="horizontal" className="h-full" onLayout={updatePanelSizes}>
      {panels.map((panel, index) => (
        <Fragment key={panel.id}>
          {index > 0 && <ResizeHandle />}
          <Panel
            id={panel.id}
            order={panel.order}
            defaultSize={panel.defaultSize}
            minSize={PANEL_CONSTRAINTS.minSize}
            maxSize={PANEL_CONSTRAINTS.maxSize}
            className={panel.className}
          >
            {panel.content}
          </Panel>
        </Fragment>
      ))}
    </PanelGroup>
  )
}
