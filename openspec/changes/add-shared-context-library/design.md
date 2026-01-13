# Design Document: Shared Context Library

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                   Context Library Architecture                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User Uploads PDF → Generate pdf_hash → Check Cache     │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Shared Content Layer (Cross-User)                          │ │
│  │ ┌────────────────────────────────────────────────────────┐ │ │
│  │ │  pdf_context_entries                                   │ │ │
│  │ │  ─────────────────────────────────────────────────────  │ │ │
│  │ │  id, pdf_hash, type, title, content,           │ │ │
│  │ │  source_page, keywords[], quality_score, language      │ │ │
│  │ └────────────────────────────────────────────────────────┘ │ │
│  └────────────────────┬───────────────────────────────────────┘ │
│                       │ Reused across users                     │
│                       ▼                                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ User Association Layer                                     │ │
│  │ ┌────────────────────────────────────────────────────────┐ │ │
│  │ │  user_context_scope                                    │ │ │
│  │ │  ─────────────────────────────────────────────────────  │ │ │
│  │ │  user_id, course_id, file_id, pdf_hash         │ │ │
│  │ └────────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
│                       │                                          │
│                       ▼ Query when AI called                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Context Retrieval Engine                                   │ │
│  │ ─────────────────────────────────────────────────────────  │ │
│  │ 1. Extract keywords via LLM                                │ │
│  │ 2. Match against context entries (Postgres GIN index)      │ │
│  │ 3. Prioritize: current PDF > same course > by type         │ │
│  │ 4. Apply token budget (2000 tokens max, ~3000 tokens)      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                       │                                          │
│                       ▼                                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ AI Functions (Enhanced with Context)                       │ │
│  │ ─────────────────────────────────────────────────────────  │ │
│  │ • Auto-explain (explain-page)                              │ │
│  │ • Selection-explain (explain-selection)                    │ │
│  │ • Q&A (ask-question)                                       │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Data Models

### pdf_context_entries (Shared Layer)
```sql
CREATE TABLE pdf_context_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_hash VARCHAR(64) NOT NULL,    -- Links to canonical_documents.pdf_hash
  type TEXT NOT NULL,               -- 'definition'|'formula'|'theorem'|'concept'|'principle'
  title TEXT NOT NULL,              -- Entry name (e.g., "Derivative", "Chain Rule")
  content TEXT NOT NULL,            -- Full explanation in English
  source_page INTEGER NOT NULL,     -- Page where this entry appears
  keywords TEXT[] NOT NULL,         -- Search keywords for matching
  quality_score FLOAT NOT NULL,     -- AI self-assessed quality (0-1)
  language TEXT NOT NULL,           -- Always 'en' for MVP
  extraction_version INTEGER NOT NULL DEFAULT 1,  -- Algorithm version for backfill tracking
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Foreign key to canonical documents
  CONSTRAINT fk_context_canonical FOREIGN KEY (pdf_hash)
    REFERENCES canonical_documents(pdf_hash) ON DELETE CASCADE,

  -- Validation constraints
  CONSTRAINT check_quality_score CHECK (quality_score >= 0 AND quality_score <= 1),
  CONSTRAINT check_page_positive CHECK (source_page > 0),
  CONSTRAINT check_type_valid CHECK (type IN ('definition', 'formula', 'theorem', 'concept', 'principle'))
);

COMMENT ON TABLE pdf_context_entries IS 'Shared context library entries extracted from PDFs. Cross-user reusable via pdf_hash.';
COMMENT ON COLUMN pdf_context_entries.pdf_hash IS 'SHA-256 hash linking to canonical_documents';
COMMENT ON COLUMN pdf_context_entries.quality_score IS 'AI self-assessed quality (0-1). Entries with score < 0.7 are filtered out.';
COMMENT ON COLUMN pdf_context_entries.extraction_version IS 'Algorithm version used for extraction. Enables backfill when prompts improve.';

-- Indexes for fast retrieval
CREATE INDEX idx_context_hash ON pdf_context_entries(pdf_hash);
CREATE INDEX idx_context_keywords ON pdf_context_entries USING GIN (keywords);
CREATE INDEX idx_context_title ON pdf_context_entries USING GIN (to_tsvector('english', title));
CREATE INDEX idx_context_type ON pdf_context_entries(type);
CREATE INDEX idx_context_quality ON pdf_context_entries(quality_score) WHERE quality_score >= 0.7;
```

### user_context_scope (Association Layer)
```sql
CREATE TABLE user_context_scope (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  pdf_hash VARCHAR(64) NOT NULL,  -- Links to canonical_documents
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Foreign key to canonical documents
  CONSTRAINT fk_scope_canonical FOREIGN KEY (pdf_hash)
    REFERENCES canonical_documents(pdf_hash) ON DELETE CASCADE,

  -- Ensure one association per user-file pair
  CONSTRAINT unique_user_file UNIQUE(user_id, file_id)
);

COMMENT ON TABLE user_context_scope IS 'Maps users to accessible context entries. Enables course-level context scoping.';

-- Indexes for association lookups
CREATE INDEX idx_scope_user_course ON user_context_scope(user_id, course_id);
CREATE INDEX idx_scope_hash ON user_context_scope(pdf_hash);
CREATE INDEX idx_scope_file ON user_context_scope(file_id);
```

### context_extraction_jobs (Task Queue)
```sql
CREATE TABLE context_extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_hash VARCHAR(64) NOT NULL,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  status TEXT NOT NULL,  -- 'pending'|'processing'|'completed'|'failed'
  total_pages INTEGER NOT NULL,
  total_words INTEGER NOT NULL,          -- Total word count in PDF
  processed_words INTEGER DEFAULT 0,     -- Words processed so far (for progress tracking)
  processed_pages INTEGER DEFAULT 0,     -- Pages processed (for display)
  current_batch INTEGER DEFAULT 0,
  total_batches INTEGER NOT NULL,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  extraction_version INTEGER NOT NULL DEFAULT 1,  -- Algorithm version
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Validation constraints
  CONSTRAINT check_status_valid CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  CONSTRAINT check_pages_non_negative CHECK (processed_pages >= 0 AND total_pages > 0),
  CONSTRAINT check_words_non_negative CHECK (processed_words >= 0 AND total_words > 0),
  CONSTRAINT check_batch_non_negative CHECK (current_batch >= 0 AND total_batches > 0),
  CONSTRAINT check_retry_non_negative CHECK (retry_count >= 0)
);

COMMENT ON TABLE context_extraction_jobs IS 'Async job queue for context extraction tasks. Tracks word count for token-based batching.';
COMMENT ON COLUMN context_extraction_jobs.total_words IS 'Total word count in PDF, estimated from text extraction';
COMMENT ON COLUMN context_extraction_jobs.processed_words IS 'Words processed so far (for progress %). Display uses page numbers for UX.';

-- Indexes for job queue operations
CREATE INDEX idx_jobs_status ON context_extraction_jobs(status, created_at);
CREATE INDEX idx_jobs_hash ON context_extraction_jobs(pdf_hash);
CREATE INDEX idx_jobs_file ON context_extraction_jobs(file_id);
CREATE INDEX idx_jobs_processing ON context_extraction_jobs(status, total_pages) WHERE status = 'pending';
```

## Extraction Pipeline

### Phase 1: Trigger & Queue
```typescript
// Triggered when user first opens PDF in P5
async function onPDFFirstOpen(fileId: string, userId: string) {
  const file = await getFile(fileId)

  // Check if context already exists (cross-user cache hit)
  const existingContext = await db.query(`
    SELECT COUNT(*) FROM pdf_context_entries
    WHERE pdf_hash = $1
  `, [file.pdf_hash])

  if (existingContext.count > 0) {
    // Create user association only
    await db.insert('user_context_scope', {
      user_id: userId,
      course_id: file.course_id,
      file_id: fileId,
      pdf_hash: file.pdf_hash,
    })
    return { cached: true }
  }

  // Create extraction job
  const batchSize = await determineBatchSize(file)
  const totalBatches = Math.ceil(file.page_count / batchSize)

  await db.insert('context_extraction_jobs', {
    pdf_hash: file.pdf_hash,
    file_id: fileId,
    status: 'pending',
    total_pages: file.page_count,
    total_batches: totalBatches,
  })

  // Queue async processing
  await queueExtractionJob(jobId)

  return { cached: false, jobId }
}
```

### Phase 2: Batch Processing with Checkpoint Resume
```typescript
async function processExtractionJob(jobId: string) {
  const job = await getJob(jobId)
  const file = await getFile(job.file_id)

  // Determine batch strategy based on word count
  const strategy = await determineBatchStrategy(file)

  // Resume from checkpoint if retrying
  let currentPage = job.processed_pages || 0
  let processedWords = job.processed_words || 0

  for (let batch = job.current_batch; batch < job.total_batches; batch++) {
    try {
      // Extract next batch based on word budget
      const { text: batchText, endPage, wordCount } = await extractNextBatch(
        file,
        currentPage,
        strategy.wordsPerBatch
      )

      // Call OpenAI for extraction
      const entries = await extractContextEntries(batchText, {
        pdfHash: file.pdf_hash,
        startPage: currentPage,
        endPage,
        version: job.extraction_version,
      })

      // Filter by quality score
      const validEntries = entries.filter(e => e.quality_score >= 0.7)

      // Deduplicate within batch and against existing entries
      const deduplicatedEntries = await deduplicateEntries(validEntries, file.pdf_hash)

      // Store entries
      await db.insertMany('pdf_context_entries', deduplicatedEntries)

      // Update job progress (checkpoint for resume)
      processedWords += wordCount
      currentPage = endPage

      await db.update('context_extraction_jobs', job.id, {
        processed_pages: currentPage,
        processed_words: processedWords,
        current_batch: batch + 1,
      })

    } catch (error) {
      // On error, job state is saved (checkpoint). Retry will resume from here.
      await handleBatchError(job, batch, error)
      return // Exit, will be retried by queue
    }
  }

  // Mark job complete
  await db.update('context_extraction_jobs', job.id, {
    status: 'completed',
    completed_at: new Date(),
  })

  // Send toast notification
  await notifyUser(job.file_id, 'extraction_complete')
}
```

### Phase 3: Word-Based Dynamic Batching
```typescript
/**
 * Determines batch size based on word count, not page count.
 * This adapts to PDF density: slide decks get larger batches, textbooks get smaller.
 */
async function determineBatchStrategy(file: File): Promise<BatchStrategy> {
  const BATCH_CONFIG = {
    targetWordsPerBatch: 4000,      // ~3000 tokens
    minWordsPerBatch: 2000,          // Sparse PDFs (slides)
    maxWordsPerBatch: 6000,          // Dense PDFs (textbooks)
  }

  // Sample first 10 pages to estimate word density
  const samplePages = await extractTextFromPages(file, 0, Math.min(9, file.page_count - 1))
  const totalWords = estimateWordCount(samplePages)
  const avgWordsPerPage = totalWords / Math.min(10, file.page_count)

  // Estimate total words in PDF
  const estimatedTotalWords = Math.round(avgWordsPerPage * file.page_count)

  // Calculate number of batches based on word count
  const wordsPerBatch = clamp(
    BATCH_CONFIG.targetWordsPerBatch,
    BATCH_CONFIG.minWordsPerBatch,
    BATCH_CONFIG.maxWordsPerBatch
  )

  const totalBatches = Math.ceil(estimatedTotalWords / wordsPerBatch)

  return {
    wordsPerBatch,
    totalBatches,
    estimatedTotalWords,
    avgWordsPerPage,
  }
}

/**
 * Extract text for next batch based on word count budget.
 * Returns variable page ranges depending on content density.
 */
async function extractNextBatch(
  file: File,
  startPage: number,
  wordBudget: number
): Promise<{ text: string; endPage: number; wordCount: number }> {
  let currentPage = startPage
  let accumulatedText = ''
  let accumulatedWords = 0

  // Accumulate pages until word budget reached
  while (currentPage < file.page_count && accumulatedWords < wordBudget) {
    const pageText = await extractTextFromPage(file, currentPage)
    const pageWords = estimateWordCount(pageText)

    // Stop if adding this page exceeds budget significantly
    if (accumulatedWords > 0 && accumulatedWords + pageWords > wordBudget * 1.2) {
      break
    }

    accumulatedText += pageText + '\n'
    accumulatedWords += pageWords
    currentPage++
  }

  return {
    text: accumulatedText,
    endPage: currentPage,
    wordCount: accumulatedWords,
  }
}
```

### Phase 4: Deduplication Logic
```typescript
/**
 * Deduplicate entries within current batch and against existing DB entries.
 * Keeps highest quality_score for each title.
 */
async function deduplicateEntries(
  newEntries: ContextEntry[],
  pdfHash: string
): Promise<ContextEntry[]> {
  // Step 1: Deduplicate within current batch
  const batchDeduped = deduplicateWithinBatch(newEntries)

  // Step 2: Check against existing entries in DB
  const existingTitles = await db.query(`
    SELECT title, MAX(quality_score) as max_score
    FROM pdf_context_entries
    WHERE pdf_hash = $1
      AND title = ANY($2)
    GROUP BY title
  `, [pdfHash, batchDeduped.map(e => e.title)])

  const existingMap = new Map(
    existingTitles.rows.map(r => [r.title, r.max_score])
  )

  // Step 3: Filter out entries that are lower quality than existing ones
  const finalEntries = batchDeduped.filter(entry => {
    const existingScore = existingMap.get(entry.title)
    // Keep if: (1) no existing entry, OR (2) higher quality than existing
    return !existingScore || entry.quality_score > existingScore
  })

  return finalEntries
}

/**
 * Deduplicate entries within a single batch.
 * Keeps highest quality_score for each title.
 */
function deduplicateWithinBatch(entries: ContextEntry[]): ContextEntry[] {
  const grouped = new Map<string, ContextEntry[]>()

  // Group by title (case-insensitive)
  for (const entry of entries) {
    const normalizedTitle = entry.title.toLowerCase().trim()
    if (!grouped.has(normalizedTitle)) {
      grouped.set(normalizedTitle, [])
    }
    grouped.get(normalizedTitle)!.push(entry)
  }

  // Keep highest quality_score from each group
  const deduplicated: ContextEntry[] = []
  for (const [, group] of grouped) {
    const best = group.reduce((a, b) =>
      a.quality_score > b.quality_score ? a : b
    )
    deduplicated.push(best)
  }

  return deduplicated
}
```

### Phase 5: English-First Language Strategy
```typescript
/**
 * English-first approach: Only translate when non-English content is detected.
 * Optimizes for primary use case (English PDFs) while supporting other languages.
 */
const TRANSLATION_SYSTEM_PROMPT = `
You are an expert academic knowledge extractor with strong translation skills.

When extracting from non-English source material:
1. Translate all output to English
2. Preserve technical terminology accuracy
3. Maintain mathematical notation and symbols unchanged
4. Keep original meaning and context
5. Use standard English academic terminology

Quality requirements:
- Technical terms must be correctly translated (e.g., "导数" → "Derivative", NOT "derived number")
- Mathematical expressions remain unchanged (e.g., $f'(x) = ...$)
- Quality score should reflect translation confidence
- If translation is uncertain, reduce quality_score accordingly
`

async function extractContextEntries(
  batchText: string,
  options: { pdfHash: string; startPage: number; endPage: number }
): Promise<ContextEntry[]> {
  // Detect source language
  const language = detectLanguage(batchText)

  // Select appropriate system prompt (English-first strategy)
  const systemPrompt = language === 'en'
    ? EXTRACTION_SYSTEM_PROMPT  // No translation needed
    : TRANSLATION_SYSTEM_PROMPT // Translate to English

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: buildExtractionUserPrompt(batchText, language) },
    ],
  })

  const entries = parseExtractionResponse(response.choices[0].message.content)

  // Apply quality penalty for translated content (non-English sources)
  if (language !== 'en') {
    return entries.map(entry => ({
      ...entry,
      // 10% quality penalty for translations (more conservative than 5%)
      quality_score: entry.quality_score * 0.9,
      language: 'en',  // Always store as English
    }))
  }

  return entries.map(e => ({ ...e, language: 'en' }))
}

function detectLanguage(text: string): 'en' | 'non-en' {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const totalChars = text.replace(/\s/g, '').length

  // If >30% Chinese characters, treat as non-English (triggers translation)
  if (chineseChars / totalChars > 0.3) return 'non-en'

  // Default to English (no translation)
  return 'en'
}
```

## Extraction Prompts

### System Prompt
```
You are an expert academic knowledge extractor. Your task is to extract reusable knowledge entries from educational PDFs.

Extract the following types of entries:
1. **Definition** - Formal term definitions
2. **Formula** - Mathematical expressions
3. **Theorem** - Proven statements with conditions
4. **Concept** - High-level explanatory ideas
5. **Principle** - Conditional rules or guidelines

For each entry, provide:
- title: The term/concept name (max 100 chars, in English)
- content: Full explanation in English (100-500 words)
- keywords: Array of search keywords (English)
- quality_score: Your confidence in this entry's reusability (0.0-1.0)

Requirements:
- All output must be in English, regardless of source language
- Each entry should be self-contained and understandable without context
- Quality score > 0.9: Core concepts that will be referenced frequently
- Quality score 0.7-0.9: Important but specialized content
- Quality score < 0.7: Will be filtered out

Respond in JSON format:
{
  "entries": [
    {
      "type": "definition",
      "title": "Derivative",
      "content": "The derivative of a function...",
      "keywords": ["derivative", "rate of change", "instantaneous", "calculus"],
      "quality_score": 0.95
    }
  ]
}
```

## Context Retrieval Strategy

### Two-Stage Retrieval
```typescript
async function retrieveContext(params: {
  userId: string
  courseId: string
  fileId: string
  currentPage: number
  query?: string  // For Q&A
}): Promise<ContextEntry[]> {

  // Stage 1: Extract keywords via LLM
  const keywords = await extractKeywordsWithLLM({
    pageText: await getCurrentPageText(params.fileId, params.currentPage),
    userQuestion: params.query,
  })

  // Stage 2: Query database with priority ranking
  const entries = await db.query(`
    SELECT e.*,
      CASE
        WHEN scope.file_id = $1 THEN 100  -- Current PDF highest priority
        WHEN scope.course_id = $2 THEN 50 -- Same course medium priority
        ELSE 0
      END +
      CASE e.type
        WHEN 'definition' THEN 20
        WHEN 'formula' THEN 15
        WHEN 'theorem' THEN 10
        WHEN 'principle' THEN 10
        WHEN 'concept' THEN 5
      END AS priority_score
    FROM pdf_context_entries e
    JOIN user_context_scope scope ON e.pdf_hash = scope.pdf_hash
    WHERE scope.user_id = $3
      AND scope.course_id = $2
      AND (
        e.title ILIKE ANY($4)  -- Keyword match
        OR e.keywords && $5    -- Array overlap
      )
    ORDER BY priority_score DESC
    LIMIT 30
  `, [params.fileId, params.courseId, params.userId, keywords, keywords])

  // Stage 3: Apply token budget (2000 tokens max, ~3000 actual tokens)
  return applyTokenBudget(entries, {
    maxTokens: 2000,
  })
}
```

### Context Injection Format
```typescript
function buildEnhancedPrompt(context: ContextEntry[], pageText: string): string {
  const contextJson = context.map(e => ({
    type: e.type,
    title: e.title,
    content: e.content,
    source: `Page ${e.source_page}`,
  }))

  return `
You have access to the following knowledge base from this course:

<knowledge-base>
${JSON.stringify(contextJson, null, 2)}
</knowledge-base>

Current page content:
---
${pageText}
---

When explaining, use relevant entries from the knowledge base to provide accurate definitions and context. Cite sources when referencing previous pages.
`
}
```

## UI Changes (MVP)

### P4 File List (Progress Display)
```tsx
// Show extraction progress inline (word-based tracking, page-based display)
// Real-time updates via Supabase Realtime (not polling)
<FileListItem file={file}>
  {extractionJob?.status === 'processing' && (
    <div className="text-sm text-gray-600">
      ⏳ Analyzing document ({extractionJob.processed_pages}/{file.page_count} pages)
    </div>
  )}
  {extractionJob?.status === 'completed' && (
    <div className="text-sm text-green-600">
      ✅ Ready for AI
    </div>
  )}
</FileListItem>
```

### Toast Notification (Completion)
```tsx
// Show toast when extraction completes
showToast({
  type: 'success',
  title: 'Document analysis complete',
  message: `${file.name} is ready for enhanced AI explanations`,
  duration: 5000,
})
```

### Context Library Browsing UI (Post-MVP, v1.1)
**Deferred to ~2 weeks post-MVP launch**

Planned features:
- Browse extracted knowledge entries in P4 (new "Knowledge Library" tab)
- Filter by type (definitions, formulas, theorems, concepts, principles)
- Search by keyword
- View source (which PDF, which page)
- Read-only display (no editing in v1.1)

**Why deferred:**
- Core extraction and AI enhancement provide immediate value
- Browsing UI is "nice-to-have" for power users
- Allows faster MVP launch and validation of core functionality

## Performance Optimizations

### Database Indexes
```sql
-- Fast keyword matching
CREATE INDEX idx_keywords_gin ON pdf_context_entries USING GIN (keywords);

-- Fast title search
CREATE INDEX idx_title_tsvector ON pdf_context_entries USING GIN (to_tsvector('english', title));

-- Fast user context lookup
CREATE INDEX idx_user_course_scope ON user_context_scope (user_id, course_id);
```

### Concurrency Control
```typescript
const EXTRACTION_LIMITS = {
  maxConcurrent: 10,         // Global concurrent jobs (increased for speed)
  maxPerUser: 2,             // Max jobs per user
  prioritySmallFirst: true,  // Small files get priority (by total_words)
}

class ExtractionScheduler {
  async getNextJob(): Promise<Job | null> {
    const running = await this.getRunningJobs()

    if (running.length >= EXTRACTION_LIMITS.maxConcurrent) {
      return null
    }

    const userCounts = groupBy(running, 'user_id')

    const candidates = await this.getPendingJobs()
      .filter(job => (userCounts[job.user_id] || 0) < EXTRACTION_LIMITS.maxPerUser)
      .sort((a, b) => a.total_words - b.total_words)  // Small first (by word count)

    return candidates[0] || null
  }
}
```

## Cost Analysis

### Per-PDF Extraction Cost
```
Assumptions:
- Average: 100 pages per PDF
- Batch size: 10 pages
- Input: 5000 tokens/batch
- Output: 2000 tokens/batch
- Model: gpt-4o-mini

Cost calculation:
- 10 batches × 7000 tokens/batch = 70k tokens total
- Input: 50k tokens × $0.15/1M = $0.0075
- Output: 20k tokens × $0.60/1M = $0.012
- Total: ~$0.02 per 100-page PDF

With 90% cache hit rate (cross-user sharing):
- Effective cost: $0.002 per user per common PDF
```

## Error Handling

### Extraction Failures with Checkpoint Resume
```typescript
/**
 * Handles batch extraction errors with automatic retry.
 * Key feature: On retry, resumes from last successful batch (no re-processing).
 */
async function handleBatchError(job: Job, batch: number, error: Error) {
  // Log failure for monitoring
  await db.insert('extraction_failures', {
    job_id: job.id,
    batch_number: batch,
    error_message: error.message,
    error_stack: error.stack,
    timestamp: new Date(),
  })

  // Retry logic (max 3 attempts)
  if (job.retry_count < 3) {
    // Re-queue job with incremented retry count
    // IMPORTANT: processed_pages and current_batch are preserved (checkpoint)
    await db.update('context_extraction_jobs', job.id, {
      retry_count: job.retry_count + 1,
      status: 'pending',  // Re-queue for retry
      error_message: `Retry ${job.retry_count + 1}/3: ${error.message}`,
    })

    // Add back to queue with exponential backoff
    const delaySeconds = Math.pow(2, job.retry_count) * 60 // 1min, 2min, 4min
    await queue.add('extract-context', { jobId: job.id }, { delay: delaySeconds * 1000 })

  } else {
    // Max retries reached - mark as partially complete
    const successRate = (job.current_batch / job.total_batches) * 100

    await db.update('context_extraction_jobs', job.id, {
      status: 'completed',  // Allow partial success (AI features still work)
      error_message: `Partial completion: ${job.current_batch}/${job.total_batches} batches (${successRate.toFixed(0)}%)`,
      completed_at: new Date(),
    })

    // Alert monitoring (for investigation)
    logger.error('Extraction job failed after max retries', {
      jobId: job.id,
      fileId: job.file_id,
      successRate,
      lastError: error.message,
    })
  }
}
```

### Graceful Degradation
```typescript
// AI functions always work, even without context
async function buildPromptWithContext(params: any) {
  try {
    const context = await retrieveContext(params)
    return buildEnhancedPrompt(context, params.pageText)
  } catch (error) {
    console.error('Context retrieval failed, proceeding without context', error)
    return buildBasicPrompt(params.pageText)  // Fallback
  }
}
```

## Security & Privacy

### Data Isolation
- User association layer ensures users only see their own courses' context
- Cross-user sharing only applies to AI-generated content (not user-uploaded PDFs)
- Deleting a file removes user association but keeps shared entries (other users may use same PDF)

### Storage Limits
```typescript
const STORAGE_LIMITS = {
  maxStoragePerUser: 5 * 1024 * 1024 * 1024,  // 5GB
  maxFilesPerCourse: 50,
  maxFileSize: 100 * 1024 * 1024,             // 100MB
  maxPagesPerFile: 200,                       // Reduced from 500 for cost control
  maxExtractionsPerUserPerMonth: 20,          // Usage quota for cost control
}
```

## API Design

### New Endpoints

#### GET /api/context/extraction-status/:fileId
**Purpose**: Check extraction job status for a file

**Response** (200 OK):
```json
{
  "ok": true,
  "data": {
    "status": "processing",  // 'pending' | 'processing' | 'completed' | 'failed'
    "progress": {
      "processedPages": 45,
      "totalPages": 150,
      "currentBatch": 5,
      "totalBatches": 15
    },
    "cached": false,
    "completedAt": null,
    "error": null
  }
}
```

**Error Codes**:
- `FILE_NOT_FOUND` (404)
- `UNAUTHORIZED` (401)

#### POST /api/context/extract-keywords (Internal)
**Purpose**: Extract keywords from text for context retrieval

**Request**:
```json
{
  "text": "We will now compute the derivative using the chain rule",
  "question": "What is the chain rule?"  // optional
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "keywords": ["derivative", "chain rule", "computation"],
    "model": "gpt-4o-mini",
    "tokensUsed": 120
  }
}
```

### Modified Endpoints

#### POST /api/ai/explain-page (Enhanced)
**Changes**: Internally retrieves context before calling OpenAI. No request/response format changes (backward compatible).

**Internal flow**:
```typescript
async function POST(req: Request) {
  const { fileId, page } = await req.json()

  // NEW: Retrieve context
  const context = await retrieveContext({
    userId: session.userId,
    courseId: await getCourseIdByFile(fileId),
    fileId,
    currentPage: page,
  })

  // Enhanced prompt with context
  const prompt = buildEnhancedPrompt(context, pageText)

  // Call OpenAI...
}
```

**Error handling**: Context retrieval failure → silent degradation (log error, proceed without context)

#### POST /api/ai/explain-selection (Enhanced)
Same as explain-page

#### POST /api/ai/ask-question (Enhanced)
Same as explain-page, but keywords extracted from user question

### Error Codes

Add to existing error code registry (03_api_design.md §6):

| Code | HTTP | Description |
|------|------|-------------|
| `EXTRACTION_IN_PROGRESS` | 202 | Context extraction is still running |
| `EXTRACTION_FAILED` | 500 | Context extraction failed (AI features still work) |
| `CONTEXT_RETRIEVAL_ERROR` | 500 | Context retrieval failed (internal, logged) |
| `STORAGE_QUOTA_EXCEEDED` | 413 | User exceeded 5GB storage limit |
| `FILE_SIZE_EXCEEDED` | 413 | PDF exceeds 100MB limit |
| `PAGE_COUNT_EXCEEDED` | 413 | PDF exceeds 200 pages limit |
| `COURSE_FILE_LIMIT` | 413 | Course has 50 files already |
| `EXTRACTION_QUOTA_EXCEEDED` | 429 | User exceeded 20 extractions/month limit |

### Rate Limiting

No additional rate limiting beyond existing AI endpoint limits. Context retrieval is internal and does not count toward user quota.
