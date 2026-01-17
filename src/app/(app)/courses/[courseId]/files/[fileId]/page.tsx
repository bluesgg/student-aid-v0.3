'use client'

import { useCallback, useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCourse } from '@/features/courses/hooks/use-courses'
import { useCachedFile } from '@/features/files/hooks/use-cached-file'
import { ResizableLayout } from '@/features/layout/components/resizable-layout'
import { PdfViewer } from '@/features/reader/components/pdf-viewer'
import { StickerPanel } from '@/features/stickers/components/sticker-panel'
import { QAPanel } from '@/features/qa/components/qa-panel'
import { useExplainSelection } from '@/features/stickers/hooks/use-explain-selection'
import { useAutoExplainSession } from '@/features/reader/hooks/use-auto-explain-session'
import { ImageExtractionToast } from '@/features/reader/components/image-extraction-toast'
import { HoverHighlightProvider } from '@/features/stickers/context'
import type { PdfType } from '@/features/stickers/api'
import { debugLog } from '@/lib/debug'
import { useExplainLocale } from '@/features/user/hooks/use-user-preferences'

export default function StudyPage() {
  const params = useParams()
  const router = useRouter()
  const courseId = params.courseId as string
  const fileId = params.fileId as string

  const { data: course, isLoading: courseLoading } = useCourse(courseId)
  const {
    file,
    isLoading: fileLoading,
    error: fileError,
    pdfSource,
    isCached,
    cacheStatus,
  } = useCachedFile(courseId, fileId)
  const explainLocale = useExplainLocale()

  const isLoading = courseLoading || fileLoading

  // ==================== DEBUG: StudyPage Lifecycle ====================
  useEffect(() => {
    debugLog('[StudyPage DEBUG] Component MOUNTED', {
      courseId,
      fileId,
    })
    return () => {
      debugLog('[StudyPage DEBUG] Component UNMOUNTING', {
        courseId,
        fileId,
        hasSelectedRegions,
        selectedRegionCount,
      })
    }
  }, []) // Empty deps = mount/unmount only

  // DEBUG: Track file data changes
  useEffect(() => {
    debugLog('[StudyPage DEBUG] file data changed', {
      fileId,
      hasFile: !!file,
      downloadUrl: file?.downloadUrl ? 'exists' : 'missing',
      isLoading: fileLoading,
      cacheStatus,
      isCached,
    })
  }, [file, fileId, fileLoading, cacheStatus, isCached])

  // Track current page for sticker panel
  const [currentPage, setCurrentPage] = useState(1)

  // Auto-explain session state (lifted from PdfViewer)
  const {
    session: autoExplainSession,
    isActive: isAutoExplainActive,
    isStarting: isAutoExplainStarting,
    error: autoExplainError,
    startSession: startAutoExplainSession,
    updateWindow: updateAutoExplainWindow,
    cancelSession: cancelAutoExplainSession,
  } = useAutoExplainSession(fileId)

  // Track selected image regions
  const [hasSelectedRegions, setHasSelectedRegions] = useState(false)
  const [selectedRegionCount, setSelectedRegionCount] = useState(0)
  const [triggerImageExplanation, setTriggerImageExplanation] = useState(false)

  // Explain selection hook for PDF text selection
  const { explain: explainSelection } = useExplainSelection()

  // Handle page change from PDF viewer
  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page)
  }, [])

  // Handle selected regions change
  const handleSelectedRegionsChange = useCallback((hasRegions: boolean, regionCount: number) => {
    setHasSelectedRegions(hasRegions)
    setSelectedRegionCount(regionCount)
  }, [])

  // Handle text selection for AI explain
  const handleSelectionExplain = useCallback(
    (text: string, page: number, _rect: DOMRect | null) => {
      if (!file) return

      explainSelection({
        courseId,
        fileId,
        page,
        selectedText: text,
        parentId: null,
        pdfType: file.type as PdfType,
        locale: explainLocale,
      })
    },
    [courseId, fileId, file, explainSelection, explainLocale]
  )

  // Handle start auto-explain session
  const handleStartAutoExplain = useCallback(async () => {
    // If there are selected image regions, trigger image explanation instead
    if (hasSelectedRegions) {
      setTriggerImageExplanation(true)
      // Reset trigger after a short delay
      setTimeout(() => setTriggerImageExplanation(false), 100)
      return
    }

    // Otherwise, start window mode auto-explain session
    // Prevent duplicate session start
    if (isAutoExplainActive || isAutoExplainStarting) {
      console.warn('Auto-explain session already active or starting')
      return
    }

    if (!file) return

    await startAutoExplainSession({
      courseId,
      fileId,
      page: currentPage,
      pdfType: file.type as PdfType,
      locale: explainLocale,
    })
  }, [hasSelectedRegions, startAutoExplainSession, courseId, fileId, currentPage, file, isAutoExplainActive, isAutoExplainStarting, explainLocale])

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <span className="text-gray-500">Loading...</span>
        </div>
      </div>
    )
  }

  // Error state
  if (fileError || !file || !course) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-gray-50">
        <div className="text-center">
          <svg
            className="mx-auto h-12 w-12 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h2 className="mt-4 text-lg font-semibold text-gray-900">
            File not found
          </h2>
          <p className="mt-2 text-gray-600">
            The file you&apos;re looking for doesn&apos;t exist or has been deleted.
          </p>
          <button
            onClick={() => router.back()}
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Go back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-white">
      {/* Image extraction progress toast */}
      <ImageExtractionToast
        courseId={courseId}
        fileId={fileId}
        totalPages={file.pageCount}
        initialStatus={file.imageExtractionStatus}
        initialProgress={file.imageExtractionProgress}
      />

      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-4">
          <Link
            href={`/courses/${courseId}`}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="Back to course"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
          </Link>
          <div>
            <nav className="flex items-center gap-1 text-sm text-gray-500">
              <Link href="/courses" className="hover:text-gray-700">
                Courses
              </Link>
              <span>/</span>
              <Link
                href={`/courses/${courseId}`}
                className="hover:text-gray-700"
              >
                {course.name}
              </Link>
              <span>/</span>
              <span className="text-gray-900">{file.name}</span>
            </nav>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>
                {file.pageCount} {file.pageCount === 1 ? 'page' : 'pages'}
              </span>
              {file.isScanned && (
                <>
                  <span>&middot;</span>
                  <span className="text-yellow-600">Scanned PDF</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Future: Add more header actions here */}
        </div>
      </header>

      {/* Main Content - 3 Column Layout */}
      <main className="flex-1 overflow-hidden">
        <HoverHighlightProvider>
          <ResizableLayout
            pdfPanel={
              file.downloadUrl ? (
                <PdfViewer
                  fileUrl={file.downloadUrl}
                  courseId={courseId}
                  fileId={fileId}
                  initialPage={file.lastReadPage}
                  totalPages={file.pageCount}
                  isScanned={file.isScanned}
                  onSelectionExplain={handleSelectionExplain}
                  onPageChange={handlePageChange}
                  autoExplainSession={autoExplainSession}
                  isAutoExplainActive={isAutoExplainActive}
                  updateAutoExplainWindow={updateAutoExplainWindow}
                  cancelAutoExplainSession={cancelAutoExplainSession}
                  onSelectedRegionsChange={handleSelectedRegionsChange}
                  triggerImageExplanation={triggerImageExplanation}
                  pdfSource={pdfSource}
                  isCached={isCached}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-500">
                  PDF not available
                </div>
              )
            }
            stickerPanel={
              <StickerPanel
                courseId={courseId}
                fileId={fileId}
                currentPage={currentPage}
                pdfType={file.type as PdfType}
                isScanned={file.isScanned}
                totalPages={file.pageCount}
                onStartAutoExplain={handleStartAutoExplain}
                isAutoExplainActive={isAutoExplainActive}
                isAutoExplainStarting={isAutoExplainStarting}
                autoExplainProgress={autoExplainSession?.progress}
                autoExplainWindowRange={autoExplainSession?.windowRange}
                autoExplainError={autoExplainError}
                isCurrentPageProcessing={autoExplainSession?.pagesInProgress?.includes(currentPage) ?? false}
              />
            }
            qaPanel={
              <QAPanel
                courseId={courseId}
                fileId={fileId}
                pdfType={file.type as PdfType}
                isScanned={file.isScanned}
                totalPages={file.pageCount}
                currentPage={currentPage}
              />
            }
          />
        </HoverHighlightProvider>
      </main>
    </div>
  )
}
