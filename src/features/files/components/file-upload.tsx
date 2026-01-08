'use client'

import { useState, useRef, useCallback } from 'react'
import { useUploadFile } from '../hooks/use-files'
import type { FileType } from '../api'

interface FileUploadProps {
  courseId: string
}

interface PendingFile {
  file: File
  name: string
  type: FileType
}

const FILE_TYPES: { value: FileType; label: string }[] = [
  { value: 'Lecture', label: 'Lecture Notes' },
  { value: 'Homework', label: 'Homework' },
  { value: 'Exam', label: 'Exam' },
  { value: 'Other', label: 'Other' },
]

export function FileUpload({ courseId }: FileUploadProps) {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadFile = useUploadFile()

  const addFiles = useCallback((files: FileList) => {
    const newFiles: PendingFile[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.type === 'application/pdf') {
        newFiles.push({
          file,
          name: file.name.replace(/\.pdf$/i, ''),
          type: 'Lecture',
        })
      }
    }
    setPendingFiles((prev) => [...prev, ...newFiles])
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      if (e.dataTransfer.files) {
        addFiles(e.dataTransfer.files)
      }
    },
    [addFiles]
  )

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files)
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const updatePendingFile = (index: number, updates: Partial<PendingFile>) => {
    setPendingFiles((prev) =>
      prev.map((pf, i) => (i === index ? { ...pf, ...updates } : pf))
    )
  }

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUpload = async (pending: PendingFile, index: number) => {
    uploadFile.mutate(
      {
        courseId,
        file: pending.file,
        name: pending.name,
        type: pending.type,
      },
      {
        onSuccess: () => {
          removePendingFile(index)
        },
      }
    )
  }

  const handleUploadAll = async () => {
    for (let i = 0; i < pendingFiles.length; i++) {
      await handleUpload(pendingFiles[i], i)
    }
  }

  return (
    <div className="mb-6">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          isDragging
            ? 'border-primary-400 bg-primary-50'
            : 'border-secondary-300 hover:border-secondary-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-secondary-100 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-secondary-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
        </div>
        <p className="text-secondary-600 mb-2">
          Drag and drop PDF files here, or{' '}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            browse
          </button>
        </p>
        <p className="text-xs text-secondary-400">PDF files only</p>
      </div>

      {pendingFiles.length > 0 && (
        <div className="mt-4 space-y-3">
          {pendingFiles.map((pending, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 bg-secondary-50 rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={pending.name}
                  onChange={(e) =>
                    updatePendingFile(index, { name: e.target.value })
                  }
                  className="input text-sm"
                  placeholder="File name"
                />
              </div>
              <select
                value={pending.type}
                onChange={(e) =>
                  updatePendingFile(index, { type: e.target.value as FileType })
                }
                className="input text-sm w-40"
              >
                {FILE_TYPES.map((ft) => (
                  <option key={ft.value} value={ft.value}>
                    {ft.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleUpload(pending, index)}
                disabled={uploadFile.isPending}
                className="btn-primary text-sm py-1.5"
              >
                Upload
              </button>
              <button
                onClick={() => removePendingFile(index)}
                className="p-1.5 text-secondary-400 hover:text-red-500"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}
          {pendingFiles.length > 1 && (
            <button
              onClick={handleUploadAll}
              disabled={uploadFile.isPending}
              className="btn-primary w-full"
            >
              Upload all ({pendingFiles.length} files)
            </button>
          )}
        </div>
      )}

      {uploadFile.error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {uploadFile.error.message}
        </div>
      )}
    </div>
  )
}
