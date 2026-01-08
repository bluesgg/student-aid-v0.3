import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { successResponse, errors } from '@/lib/api-response'
import { extractPdfInfo } from '@/lib/pdf/extract'
import { isScannedPdf } from '@/lib/pdf/detect-scanned'
import { generateContentHash } from '@/lib/pdf/hash'
import { generateStorageKey, uploadFile } from '@/lib/storage'
import { fileTypeSchema } from '@/lib/validations/course'

interface RouteParams {
  params: { courseId: string }
}

/**
 * GET /api/courses/:courseId/files - List all files for a course
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    // Verify course belongs to user
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id')
      .eq('id', params.courseId)
      .eq('user_id', user.id)
      .single()

    if (courseError || !course) {
      return errors.notFound('Course')
    }

    const { data: files, error } = await supabase
      .from('files')
      .select('*')
      .eq('course_id', params.courseId)
      .order('uploaded_at', { ascending: false })

    if (error) {
      console.error('Error fetching files:', error)
      return errors.internalError()
    }

    // Transform and group by type
    const items = files.map((file) => ({
      id: file.id,
      name: file.name,
      type: file.type,
      pageCount: file.page_count,
      isScanned: file.is_scanned,
      lastReadPage: file.last_read_page,
      uploadedAt: file.uploaded_at,
    }))

    // Group by type
    const grouped = {
      Lecture: items.filter((f) => f.type === 'Lecture'),
      Homework: items.filter((f) => f.type === 'Homework'),
      Exam: items.filter((f) => f.type === 'Exam'),
      Other: items.filter((f) => f.type === 'Other'),
    }

    return successResponse({ items, grouped })
  } catch {
    return errors.internalError()
  }
}

/**
 * POST /api/courses/:courseId/files - Upload a new file
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errors.unauthorized()
    }

    // Verify course belongs to user
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('id')
      .eq('id', params.courseId)
      .eq('user_id', user.id)
      .single()

    if (courseError || !course) {
      return errors.notFound('Course')
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const name = formData.get('name') as string | null
    const type = formData.get('type') as string | null

    if (!file || !name || !type) {
      return errors.invalidInput('File, name, and type are required')
    }

    // Validate file type enum
    const typeResult = fileTypeSchema.safeParse(type)
    if (!typeResult.success) {
      return errors.invalidInput('Invalid file type')
    }

    // Check if file is a PDF
    if (file.type !== 'application/pdf') {
      return errors.invalidInput('Only PDF files are allowed')
    }

    // Convert to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Extract PDF info
    let pdfInfo
    try {
      pdfInfo = await extractPdfInfo(buffer)
    } catch {
      return errors.invalidInput('Failed to process PDF file. The file may be corrupted.')
    }

    // Check if file is scanned
    const isScanned = isScannedPdf(pdfInfo.textContent, pdfInfo.pageCount)

    // Generate content hash
    const contentHash = generateContentHash(pdfInfo.textContent)

    // Check for existing file with same name
    const { data: existing } = await supabase
      .from('files')
      .select('id, name')
      .eq('course_id', params.courseId)
      .eq('name', name)
      .single()

    if (existing) {
      return errors.invalidInput('A file with this name already exists in this course', {
        existingFileId: existing.id,
        conflict: true,
      })
    }

    // Generate storage key and upload
    const storageKey = generateStorageKey(user.id, params.courseId, name)
    const uploadResult = await uploadFile(supabase, storageKey, buffer)

    if (!uploadResult) {
      return errors.internalError('Failed to upload file to storage')
    }

    // Create file record
    const { data: fileRecord, error: insertError } = await supabase
      .from('files')
      .insert({
        course_id: params.courseId,
        user_id: user.id,
        name,
        type: typeResult.data,
        page_count: pdfInfo.pageCount,
        is_scanned: isScanned,
        pdf_content_hash: contentHash,
        storage_key: storageKey,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating file record:', insertError)
      return errors.internalError()
    }

    return successResponse(
      {
        id: fileRecord.id,
        name: fileRecord.name,
        type: fileRecord.type,
        pageCount: fileRecord.page_count,
        isScanned: fileRecord.is_scanned,
        lastReadPage: fileRecord.last_read_page,
        uploadedAt: fileRecord.uploaded_at,
      },
      201
    )
  } catch {
    return errors.internalError()
  }
}
