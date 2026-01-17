/**
 * Course outline prompt engineering for generating study outlines from multiple PDFs.
 */

export interface OutlinePromptParams {
  courseName: string
  school: string
  term: string
  files: Array<{
    name: string
    type: 'Lecture' | 'Homework' | 'Exam' | 'Other'
    pageCount: number
    textContent: string
  }>
}

export interface OutlineNode {
  id: string
  title: string
  description?: string
  type: 'chapter' | 'section' | 'concept'
  children?: OutlineNode[]
  references?: Array<{
    fileId: string
    fileName: string
    page: number
  }>
}

/**
 * Build a prompt for generating a course outline from all course materials.
 */
export function buildOutlinePrompt(params: OutlinePromptParams): string {
  const { courseName, school, term, files } = params

  const fileContents = files
    .map(
      (file, index) => `
=== FILE ${index + 1}: ${file.name} ===
Type: ${file.type}
Pages: ${file.pageCount}

Content:
${file.textContent.slice(0, 30000)} ${file.textContent.length > 30000 ? '\n[Content truncated...]' : ''}
`
    )
    .join('\n\n')

  return `You are an expert educational AI tutor creating a comprehensive course outline.

COURSE INFORMATION:
- Course Name: ${courseName}
- School: ${school}
- Term: ${term}
- Number of Files: ${files.length}

COURSE MATERIALS:
${fileContents}

---

INSTRUCTIONS:
Generate a hierarchical course outline that organizes all the material from these documents. The outline should help students understand the structure and flow of the course.

OUTPUT FORMAT (JSON):
Return a JSON array of outline nodes. Each node should have:
- "id": unique identifier (use format "ch1", "ch1-s1", "ch1-s1-c1" etc.)
- "title": concise title for this section
- "description": brief description of what this section covers (1-2 sentences)
- "type": one of "chapter", "section", or "concept"
- "children": array of child nodes (for chapters and sections)
- "references": array of page references where this topic appears, with format:
  { "fileName": "filename.pdf", "page": 5 }

GUIDELINES:
1. Create 3-8 main chapters based on major topics
2. Each chapter should have 2-6 sections
3. Sections can have concept-level items for key definitions/formulas
4. Reference specific pages from the source documents where topics appear
5. Use clear, student-friendly language
6. Ensure the outline flows logically (prerequisite topics first)
7. Include page references from multiple files if a topic spans documents

EXAMPLE OUTPUT:
[
  {
    "id": "ch1",
    "title": "Introduction to Linear Algebra",
    "description": "Foundational concepts including vectors, matrices, and basic operations.",
    "type": "chapter",
    "children": [
      {
        "id": "ch1-s1",
        "title": "Vectors and Vector Spaces",
        "description": "Definition and properties of vectors in Rn.",
        "type": "section",
        "references": [
          { "fileName": "Lecture 1.pdf", "page": 3 },
          { "fileName": "Lecture 1.pdf", "page": 4 }
        ],
        "children": [
          {
            "id": "ch1-s1-c1",
            "title": "Vector Addition",
            "type": "concept",
            "references": [{ "fileName": "Lecture 1.pdf", "page": 3 }]
          }
        ]
      }
    ]
  }
]

Return ONLY the JSON array, no additional text.`
}

function stripMarkdownCodeBlock(text: string): string {
  let result = text.trim()
  if (result.startsWith('```json')) {
    result = result.slice(7)
  } else if (result.startsWith('```')) {
    result = result.slice(3)
  }
  if (result.endsWith('```')) {
    result = result.slice(0, -3)
  }
  return result.trim()
}

export function parseOutlineResponse(response: string): OutlineNode[] {
  const jsonStr = stripMarkdownCodeBlock(response)

  try {
    const parsed = JSON.parse(jsonStr)

    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array')
    }

    return sanitizeOutline(parsed)
  } catch (error) {
    console.error('Failed to parse outline response:', error)
    throw new Error('Failed to parse course outline')
  }
}

/**
 * Sanitize and validate outline nodes.
 */
function sanitizeOutline(nodes: unknown[]): OutlineNode[] {
  return nodes.map((node, index) => sanitizeNode(node, `node-${index}`))
}

function sanitizeNode(node: unknown, fallbackId: string): OutlineNode {
  if (typeof node !== 'object' || node === null) {
    return {
      id: fallbackId,
      title: 'Unknown Section',
      type: 'section',
    }
  }

  const n = node as Record<string, unknown>

  const sanitized: OutlineNode = {
    id: typeof n.id === 'string' ? n.id : fallbackId,
    title: typeof n.title === 'string' ? n.title : 'Untitled',
    type: ['chapter', 'section', 'concept'].includes(n.type as string)
      ? (n.type as 'chapter' | 'section' | 'concept')
      : 'section',
  }

  if (typeof n.description === 'string') {
    sanitized.description = n.description
  }

  if (Array.isArray(n.children) && n.children.length > 0) {
    sanitized.children = n.children.map((child, i) =>
      sanitizeNode(child, `${sanitized.id}-${i}`)
    )
  }

  if (Array.isArray(n.references)) {
    sanitized.references = n.references
      .filter(
        (ref): ref is { fileName: string; page: number; fileId?: string } =>
          typeof ref === 'object' &&
          ref !== null &&
          typeof (ref as Record<string, unknown>).fileName === 'string' &&
          typeof (ref as Record<string, unknown>).page === 'number'
      )
      .map((ref) => ({
        fileId: ref.fileId || '',
        fileName: ref.fileName,
        page: ref.page,
      }))
  }

  return sanitized
}
