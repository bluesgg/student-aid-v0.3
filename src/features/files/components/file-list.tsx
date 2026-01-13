'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { useFiles, useDeleteFile } from '../hooks/use-files'
import { useExtractionStatuses, type ExtractionStatusData } from '../hooks/use-extraction-status'
import { ExtractionStatusBadge } from './extraction-status-badge'
import type { CourseFile, FileType } from '../api'

interface FileListProps {
  courseId: string
}

interface FileGroupProps {
  title: string
  files: CourseFile[]
  courseId: string
  onDelete: (file: CourseFile) => void
  getStatus: (fileId: string) => ExtractionStatusData | undefined
}

function FileGroup({ title, files, courseId, onDelete, getStatus }: FileGroupProps) {
  if (files.length === 0) return null

  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-secondary-500 uppercase tracking-wider mb-3">
        {title}
      </h3>
      <div className="space-y-2">
        {files.map((file) => (
          <FileRow
            key={file.id}
            file={file}
            courseId={courseId}
            onDelete={() => onDelete(file)}
            extractionStatus={getStatus(file.id)}
          />
        ))}
      </div>
    </div>
  )
}

interface FileRowProps {
  file: CourseFile
  courseId: string
  onDelete: () => void
  extractionStatus: ExtractionStatusData | undefined
}

function FileRow({ file, courseId, onDelete, extractionStatus }: FileRowProps) {
  return (
    <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-secondary-200 hover:border-primary-300 transition-colors group">
      <Link
        href={`/courses/${courseId}/files/${file.id}`}
        className="flex-1 flex items-center gap-3"
      >
        <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
          <svg
            className="w-5 h-5 text-red-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-secondary-900 truncate">
            {file.name}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs text-secondary-500">
              {file.pageCount} {file.pageCount === 1 ? 'page' : 'pages'}
              {file.isScanned && (
                <span className="ml-2 text-amber-600" title="Scanned PDF - AI features may be limited">
                  Scanned
                </span>
              )}
            </p>
            <ExtractionStatusBadge status={extractionStatus} />
          </div>
        </div>
      </Link>
      <button
        onClick={(e) => {
          e.preventDefault()
          onDelete()
        }}
        className="p-2 text-secondary-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Delete file"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </div>
  )
}

const FILE_TYPE_TITLES: Record<FileType, string> = {
  Lecture: 'Lecture Notes',
  Homework: 'Homework',
  Exam: 'Exams',
  Other: 'Other Materials',
}

export function FileList({ courseId }: FileListProps) {
  const { data, isLoading, error } = useFiles(courseId)
  const deleteFile = useDeleteFile()

  // Get all file IDs for extraction status tracking
  const fileIds = useMemo(() => {
    if (!data?.items) return []
    return data.items.map((f) => f.id)
  }, [data?.items])

  // Build file name map for toast notifications
  const fileNames = useMemo(() => {
    if (!data?.items) return {}
    return data.items.reduce(
      (acc, f) => {
        acc[f.id] = f.name
        return acc
      },
      {} as Record<string, string>
    )
  }, [data?.items])

  // Fetch and subscribe to extraction statuses
  const { getStatus } = useExtractionStatuses(fileIds, { fileNames })

  const handleDelete = (file: CourseFile) => {
    if (confirm(`Delete "${file.name}"? This will also delete all AI-generated content for this file.`)) {
      deleteFile.mutate({ courseId, fileId: file.id })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600">Failed to load files. Please try again.</p>
      </div>
    )
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-secondary-500">No files yet. Upload your first PDF!</p>
      </div>
    )
  }

  return (
    <div>
      {(Object.keys(FILE_TYPE_TITLES) as FileType[]).map((type) => (
        <FileGroup
          key={type}
          title={FILE_TYPE_TITLES[type]}
          files={data.grouped[type]}
          courseId={courseId}
          onDelete={handleDelete}
          getStatus={getStatus}
        />
      ))}
    </div>
  )
}
