# context-library Specification

## Purpose
TBD - created by archiving change add-shared-context-library. Update Purpose after archive.
## Requirements
### Requirement: Automatic Context Extraction on First Open
The system SHALL automatically trigger context extraction when a user first opens a PDF in the study page (P5).

#### Scenario: First open triggers extraction
- **GIVEN** a user uploads a new PDF to course "Calculus I"
- **AND** the PDF has `pdf_hash = "abc123"`
- **WHEN** the user opens the PDF for the first time in P5
- **THEN** the system checks if context entries exist for hash "abc123"
- **AND** finding none, creates an extraction job with status "pending"
- **AND** queues the job for async processing
- **AND** returns extraction job status to the client

#### Scenario: Cross-user cache hit skips extraction
- **GIVEN** User A already uploaded and extracted PDF with hash "abc123"
- **AND** User B uploads the same PDF (same hash)
- **WHEN** User B opens the PDF for the first time
- **THEN** the system finds existing context entries for hash "abc123"
- **AND** creates only a user association record (user_context_scope)
- **AND** returns `{ cached: true }` to the client
- **AND** no extraction job is created

#### Scenario: Extraction job visible in P4 file list
- **GIVEN** an extraction job is processing for "Lecture05.pdf"
- **WHEN** the user views the course details page (P4)
- **THEN** the file list displays "⏳ Analyzing document (45/150 pages)"
- **AND** the progress updates as batches complete
- **AND** other files show "✅ Ready for AI" if extraction is complete

### Requirement: Five Entry Types
The system SHALL extract five types of knowledge entries from PDF content.

#### Scenario: Extract definition entry
- **GIVEN** a PDF page contains text "The derivative of a function is its instantaneous rate of change"
- **WHEN** the extraction AI processes this page
- **THEN** an entry is created with:
  - type: "definition"
  - title: "Derivative"
  - content: "The derivative of a function is its instantaneous rate of change..."
  - keywords: ["derivative", "rate of change", "instantaneous", "calculus"]
  - quality_score: 0.95

#### Scenario: Extract formula entry
- **GIVEN** a PDF page contains "$f'(x) = \lim_{h→0} \frac{f(x+h)-f(x)}{h}$"
- **WHEN** the extraction AI processes this page
- **THEN** an entry is created with:
  - type: "formula"
  - title: "Derivative Definition (Limit Form)"
  - content: Full formula with explanation in English
  - keywords: ["derivative", "limit", "definition", "formula"]

#### Scenario: Extract theorem entry
- **GIVEN** a PDF page contains "Mean Value Theorem: If f is continuous on [a,b] and differentiable on (a,b), then..."
- **WHEN** the extraction AI processes this page
- **THEN** an entry is created with:
  - type: "theorem"
  - title: "Mean Value Theorem"
  - content: Full theorem statement with conditions

#### Scenario: Extract concept entry
- **GIVEN** a PDF page contains "Machine learning is a method that allows computers to learn from data"
- **WHEN** the extraction AI processes this page
- **THEN** an entry is created with:
  - type: "concept"
  - title: "Machine Learning"
  - content: High-level explanation of the concept

#### Scenario: Extract principle entry
- **GIVEN** a PDF page contains "When a risky asset is perfectly hedged with a non-risky asset, the expected return should equal the risk-free rate"
- **WHEN** the extraction AI processes this page
- **THEN** an entry is created with:
  - type: "principle"
  - title: "Risk-free rate for hedged portfolios"
  - content: Full conditional rule with explanation
  - keywords: ["risk-free", "hedge", "portfolio", "finance"]

### Requirement: Quality Filtering
The system SHALL filter extracted entries based on AI-assessed quality scores.

#### Scenario: High-quality entry is kept
- **GIVEN** the extraction AI returns an entry with quality_score: 0.85
- **WHEN** the system processes the extraction batch
- **THEN** the entry is inserted into `pdf_context_entries`
- **AND** is available for context retrieval

#### Scenario: Low-quality entry is discarded
- **GIVEN** the extraction AI returns an entry with quality_score: 0.65
- **WHEN** the system processes the extraction batch
- **THEN** the entry is NOT inserted (filtered out)
- **AND** does not pollute the context library

#### Scenario: Noise detection (page numbers, headers)
- **GIVEN** the extraction AI identifies text "Page 15" or "Chapter 3" as a candidate
- **WHEN** the system validates the entry
- **THEN** the entry is assigned quality_score < 0.7
- **AND** is automatically filtered out

### Requirement: Dynamic Word-Based Batching
The system SHALL dynamically determine batch size based on PDF word count density.

#### Scenario: Dense text PDF (textbook)
- **GIVEN** a 200-page PDF with average 800 words per page
- **WHEN** the system estimates token density from first 10 pages
- **THEN** avgTokensPerPage ≈ 1000
- **AND** batch size = floor(3500 / 1000) = 3 pages per batch (clamped to min 5)
- **AND** actual batch size = 5 pages per batch
- **AND** total batches = ceil(200 / 5) = 40 batches

#### Scenario: Sparse text PDF (slides)
- **GIVEN** a 100-page PDF with average 150 words per page
- **WHEN** the system estimates token density from first 10 pages
- **THEN** avgTokensPerPage ≈ 200
- **AND** batch size = floor(3500 / 200) = 17 pages per batch
- **AND** total batches = ceil(100 / 17) = 6 batches

#### Scenario: Batch size clamping
- **GIVEN** a PDF with very low token density (50 tokens/page)
- **WHEN** the system calculates batch size = floor(3500 / 50) = 70
- **THEN** batch size is clamped to max 20 pages per batch
- **AND** prevents excessive page ranges in single API call

### Requirement: English Storage Normalization
The system SHALL store all context entries in English regardless of source PDF language.

#### Scenario: Chinese PDF extraction
- **GIVEN** a Chinese PDF contains "导数是函数在某点的瞬时变化率"
- **WHEN** the extraction AI processes this page
- **THEN** the AI translates to English during extraction
- **AND** entry is stored with:
  - title: "Derivative"
  - content: "The derivative of a function is its instantaneous rate of change..."
  - language: "en"

#### Scenario: English PDF extraction
- **GIVEN** an English PDF contains "The derivative of a function..."
- **WHEN** the extraction AI processes this page
- **THEN** entry is stored directly without translation:
  - title: "Derivative"
  - content: Original English text
  - language: "en"

#### Scenario: Cross-language concept matching
- **GIVEN** User A's Chinese PDF extracted "Derivative" in English
- **AND** User B asks in English "What is a derivative?"
- **WHEN** the system retrieves context
- **THEN** User A's extracted definition matches User B's query
- **AND** language normalization enables cross-language reuse

### Requirement: Course-Level Context Scoping
The system SHALL scope context retrieval to the current course only.

#### Scenario: Context limited to current course
- **GIVEN** a user has two courses: "Calculus I" and "Statistics"
- **AND** "Calculus I" has PDF with definition of "Derivative"
- **WHEN** the user uses AI features in "Statistics" course
- **THEN** the "Derivative" definition is NOT available
- **AND** only "Statistics" course context is retrieved

#### Scenario: All PDFs in course share context
- **GIVEN** a course "Finance" has 10 PDFs
- **AND** Lecture01.pdf defines "Risk-free rate"
- **WHEN** the user asks a question on Lecture05.pdf
- **THEN** the system retrieves context from all 10 PDFs in the course
- **AND** includes "Risk-free rate" definition from Lecture01
- **AND** prioritizes Lecture05 entries over Lecture01

### Requirement: Context Injection for AI Features
The system SHALL inject relevant context into prompts for auto-explain, selection-explain, and Q&A features.

#### Scenario: Auto-explain uses context
- **GIVEN** a user clicks "Explain this page" on page 15 of Lecture05.pdf
- **AND** page 15 mentions "using the chain rule"
- **AND** Lecture03.pdf has a "Chain Rule" formula entry
- **WHEN** the system builds the AI prompt
- **THEN** the prompt includes:
  - Current page 15 text
  - Retrieved "Chain Rule" formula from Lecture03
  - Formatted as structured JSON knowledge base
- **AND** AI response references the chain rule definition

#### Scenario: Selection-explain uses context
- **GIVEN** a user selects text "apply the mean value theorem" on page 20
- **AND** Lecture02.pdf has a "Mean Value Theorem" entry
- **WHEN** the system generates explanation
- **THEN** the prompt includes the theorem definition from Lecture02
- **AND** AI explains the selection using the theorem context

#### Scenario: Q&A uses context
- **GIVEN** a user asks "What is the risk-free rate?" on page 30
- **AND** Lecture05.pdf page 12 has a principle about risk-free rates
- **WHEN** the system processes the question
- **THEN** context retrieval extracts keywords ["risk-free", "rate"]
- **AND** retrieves the relevant principle from page 12
- **AND** AI answer cites "According to page 12, when a risky asset is hedged..."

#### Scenario: Summaries do NOT use context
- **GIVEN** a user requests document summary for Lecture05.pdf
- **WHEN** the system builds the summary prompt
- **THEN** context library is NOT queried
- **AND** summary is generated from document content only
- **AND** avoids redundant information injection

### Requirement: Two-Stage Context Retrieval
The system SHALL use LLM-based keyword extraction followed by database matching for context retrieval.

#### Scenario: Keyword extraction from page text
- **GIVEN** page 15 contains "We will now compute the derivative using the chain rule"
- **WHEN** the system extracts keywords
- **THEN** LLM returns ["derivative", "chain rule", "computation"]
- **AND** these keywords are used for database query

#### Scenario: Keyword extraction from user question
- **GIVEN** a user asks "How do I apply the mean value theorem?"
- **WHEN** the system extracts keywords
- **THEN** LLM returns ["mean value theorem", "application"]
- **AND** these keywords match against context entries

#### Scenario: Priority scoring in retrieval
- **GIVEN** multiple context entries match keywords
- **AND** Entry A is from current PDF (Lecture05)
- **AND** Entry B is from another PDF in same course (Lecture03)
- **AND** Entry C is type "definition"
- **AND** Entry D is type "concept"
- **WHEN** the system ranks entries
- **THEN** Entry A (current PDF) has highest priority
- **AND** Entry C (definition type) ranks higher than Entry D (concept)
- **AND** final order: A > C > B > D

#### Scenario: Token budget enforcement
- **GIVEN** context retrieval returns 30 matching entries
- **AND** total tokens = 3200 (exceeds budget of 2000)
- **WHEN** the system applies token budget
- **THEN** lower-priority entries are truncated
- **AND** final context fits within 2000 token budget (~3000 actual tokens)
- **AND** current PDF entries are preserved first

### Requirement: Extraction Progress Visibility
The system SHALL display extraction progress in the P4 file list.

#### Scenario: Processing status display
- **GIVEN** an extraction job is at batch 7 of 15 (processed 70/150 pages)
- **WHEN** the user views the course details page (P4)
- **THEN** the file shows "⏳ Analyzing document (70/150 pages)"
- **AND** the status updates in real-time via Supabase Realtime subscriptions (NOT polling)

#### Scenario: Completed status display
- **GIVEN** an extraction job has status "completed"
- **WHEN** the user views the P4 file list
- **THEN** the file shows "✅ Ready for AI"
- **AND** no progress indicator is shown

#### Scenario: Failed extraction partial success
- **GIVEN** an extraction job completed 12 of 15 batches successfully
- **AND** 3 batches failed after 3 retries
- **WHEN** the user views the P4 file list
- **THEN** the file shows "✅ Ready for AI" (partial success allowed)
- **AND** the 12 successful batches' context is available

### Requirement: Extraction Completion Notification
The system SHALL notify users via toast when extraction completes.

#### Scenario: Toast on completion
- **GIVEN** an extraction job completes for "Lecture05.pdf"
- **WHEN** the job status changes to "completed"
- **THEN** a toast notification appears with:
  - Title: "Document analysis complete"
  - Message: "Lecture05.pdf is ready for enhanced AI explanations"
  - Duration: 5 seconds
  - Type: success

#### Scenario: No toast for cached PDFs
- **GIVEN** a user opens a PDF with cached context (cross-user hit)
- **WHEN** the system creates user association only
- **THEN** no extraction job is created
- **AND** no toast notification is shown
- **AND** user can immediately use AI features

### Requirement: Concurrency Control
The system SHALL limit concurrent extraction jobs to ensure system stability.

#### Scenario: Global concurrency limit
- **GIVEN** 5 extraction jobs are currently processing
- **AND** a new job is queued
- **WHEN** the scheduler checks for next job
- **THEN** the new job remains pending
- **AND** starts only when a slot becomes available

#### Scenario: Per-user concurrency limit
- **GIVEN** User A has 2 extraction jobs processing
- **AND** User A uploads a third PDF
- **WHEN** the scheduler checks for next job
- **THEN** User A's third job remains pending
- **AND** other users' jobs can still be scheduled

#### Scenario: Small file priority
- **GIVEN** pending jobs: JobA (200 pages), JobB (50 pages), JobC (100 pages)
- **AND** a processing slot becomes available
- **WHEN** the scheduler selects next job
- **THEN** JobB (50 pages) is selected first
- **AND** small files complete faster, improving perceived speed

### Requirement: Graceful Error Handling
The system SHALL ensure AI features work even when context extraction fails.

#### Scenario: Silent degradation on retrieval failure
- **GIVEN** context retrieval throws an error (database timeout)
- **WHEN** auto-explain is called
- **THEN** the system logs the error
- **AND** proceeds with basic prompt (no context)
- **AND** AI feature still works for the user
- **AND** user is not notified of the failure

#### Scenario: Batch retry on extraction failure
- **GIVEN** an extraction batch fails with API error
- **AND** retry_count = 1
- **WHEN** the system handles the error
- **THEN** the batch is re-queued for retry
- **AND** retry_count increments to 2
- **AND** job status remains "processing"

#### Scenario: Give up after max retries
- **GIVEN** an extraction batch fails 3 times
- **WHEN** the system handles the error
- **THEN** the batch is marked as permanently failed
- **AND** job status changes to "completed" (partial success)
- **AND** other successful batches remain available
- **AND** failed batch is logged for investigation

### Requirement: Storage Limit Enforcement
The system SHALL enforce storage limits to prevent resource abuse.

#### Scenario: User storage quota check
- **GIVEN** a user has 4.9GB of storage used
- **WHEN** the user attempts to upload a 200MB PDF
- **THEN** the system rejects the upload
- **AND** returns error "Storage quota exceeded (5GB limit)"
- **AND** suggests deleting old files

#### Scenario: File size limit
- **GIVEN** a user attempts to upload a 150MB PDF
- **WHEN** the system validates the file
- **THEN** the upload is rejected
- **AND** returns error "File too large (100MB limit)"

#### Scenario: Page count limit
- **GIVEN** a PDF has 250 pages
- **WHEN** the user attempts to upload it
- **THEN** the system rejects the upload
- **AND** returns error "PDF exceeds maximum page count (200 pages)"
- **AND** suggests splitting the file or uploading key chapters only

#### Scenario: Course file count limit
- **GIVEN** a course already has 50 PDFs
- **WHEN** the user attempts to upload another PDF
- **THEN** the upload is rejected
- **AND** returns error "Course file limit reached (50 files)"

### Requirement: Hash-Based Version Handling
The system SHALL treat PDF updates as new documents based on content hash changes.

#### Scenario: Same PDF re-upload uses cache
- **GIVEN** User A uploads "Textbook_v1.pdf" with hash "abc123"
- **AND** context is extracted and stored
- **WHEN** User A deletes and re-uploads the exact same file
- **THEN** the hash remains "abc123"
- **AND** existing context is reused (cache hit)
- **AND** no extraction job is created

#### Scenario: Updated PDF triggers new extraction
- **GIVEN** User A uploads "Textbook_v1.pdf" with hash "abc123"
- **AND** context is extracted and stored
- **WHEN** User A uploads "Textbook_v2.pdf" (updated content) with hash "def456"
- **THEN** the system treats it as a new PDF
- **AND** creates a new extraction job for hash "def456"
- **AND** old context for hash "abc123" remains for other users

### Requirement: Context Entry Deduplication
The system SHALL prevent duplicate entries within the same PDF.

#### Scenario: Same term on multiple pages
- **GIVEN** a PDF defines "Derivative" on both page 5 and page 12
- **WHEN** extraction processes both pages
- **THEN** the AI identifies the duplicate
- **AND** keeps only the higher quality_score entry
- **OR** keeps only the first occurrence (page 5)

#### Scenario: Near-duplicate titles
- **GIVEN** extraction finds "Derivative" on page 5 and "Derivative (definition)" on page 12
- **WHEN** the system stores entries
- **THEN** both entries are kept (different titles)
- **AND** database query can match either variant

