'use client'

import { useState, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
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

type FileTypeKey = 'Lecture' | 'Homework' | 'Exam' | 'Other'

const FILE_TYPE_KEYS: FileTypeKey[] = ['Lecture', 'Homework', 'Exam', 'Other']

// PPT MIME types and extensions
const PPT_MIME_TYPES = [
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]
const PPT_EXTENSIONS = ['.ppt', '.pptx']

function isPptFile(file: File): boolean {
  if (PPT_MIME_TYPES.includes(file.type)) return true
  const fileName = file.name.toLowerCase()
  return PPT_EXTENSIONS.some((ext) => fileName.endsWith(ext))
}

export function FileUpload({ courseId }: FileUploadProps) {
  const t = useTranslations('files')
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [pptWarning, setPptWarning] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadFile = useUploadFile()

  const addFiles = useCallback((files: FileList) => {
    const newFiles: PendingFile[] = []
    let hasPptFile = false

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.type === 'application/pdf') {
        newFiles.push({
          file,
          name: file.name.replace(/\.pdf$/i, ''),
          type: 'Lecture',
        })
      } else if (isPptFile(file)) {
        hasPptFile = true
      }
    }

    if (hasPptFile) {
      setPptWarning(true)
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
          {t('dragAndDropOr')}{' '}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            {t('browse')}
          </button>
        </p>
        <p className="text-xs text-secondary-400">{t('pdfOnly')}</p>
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
                  placeholder={t('fileName')}
                />
              </div>
              <select
                value={pending.type}
                onChange={(e) =>
                  updatePendingFile(index, { type: e.target.value as FileType })
                }
                className="input text-sm w-40"
              >
                {FILE_TYPE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {t(`types.${key}`)}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleUpload(pending, index)}
                disabled={uploadFile.isPending}
                className="btn-primary text-sm py-1.5"
              >
                {t('upload')}
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
              {t('uploadAll', { count: pendingFiles.length })}
            </button>
          )}
        </div>
      )}

      {pptWarning && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm flex items-start gap-2">
          <svg
            className="w-5 h-5 flex-shrink-0 mt-0.5"
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
          <span>{t('pptNotSupported')}</span>
          <button
            onClick={() => setPptWarning(false)}
            className="ml-auto p-0.5 text-amber-500 hover:text-amber-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
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
