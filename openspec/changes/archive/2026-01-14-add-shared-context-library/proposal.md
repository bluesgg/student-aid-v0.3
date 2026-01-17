# Add Shared Context Library

## Overview
Implement a cross-user shared context library that automatically extracts key knowledge entries (definitions, formulas, theorems, concepts, principles) from PDFs to enhance AI-powered explanations and Q&A. The context library addresses two key scenarios:
1. **Many small PDFs** (e.g., 20 lecture slides with 10-30 pages each) - enables cross-document concept lookup
2. **Few large PDFs** (e.g., a 500-page textbook) - maintains forward references to definitions from earlier chapters

## Problem Statement
Currently, AI features (auto-explain, selection-explain, Q&A) only see the current page content. When a page references concepts from previous pages or other documents (e.g., "using the derivative definition from Lecture 3"), the AI lacks context to provide accurate explanations. This forces users to manually find referenced concepts or receive incomplete answers.

## Proposed Solution

### Core Architecture
**Two-layer structure**:
1. **Shared Content Layer** (`pdf_context_entries` table) - Cross-user reusable knowledge entries indexed by `pdf_hash`
2. **User Association Layer** (`user_context_scope` table) - Maps users to their accessible context entries

### Key Features
1. **Automatic Extraction** - On first PDF open, asynchronously extract knowledge entries using GPT-4o-mini
2. **Cross-User Sharing** - Same PDF content (by hash) shares context entries across all users
3. **AI Enhancement** - Inject relevant context into auto-explain, selection-explain, and Q&A prompts
4. **Smart Retrieval** - Use LLM to extract keywords from queries, then match against context library
5. **Progress Visibility** - Show extraction progress in P4 file list (real-time updates via Supabase Realtime)
6. **Word-Based Batching** - Dynamic batching by word count (3000-5000 words/batch) adapts to PDF density
7. **Quality Control** - AI self-scoring (>=0.7 threshold) and automatic deduplication within PDFs
8. **English-First Strategy** - Recommend English PDFs for best experience; auto-translate non-English content when detected
9. **Fault Tolerance** - Automatic retry with resume-from-checkpoint (no redundant re-processing)

### Entry Types
- **Definition**: Formal term definitions (e.g., "Derivative - the instantaneous rate of change...")
- **Formula**: Mathematical expressions (e.g., "$f'(x) = \lim_{h→0}...$")
- **Theorem**: Proven statements (e.g., "Mean Value Theorem: if f is continuous on [a,b]...")
- **Concept**: High-level ideas (e.g., "Machine learning is a method...")
- **Principle**: Conditional rules (e.g., "When a risky asset is perfectly hedged, use the risk-free rate")

### Language Handling
**English-first approach**: The system recommends English PDFs for optimal AI experience. When non-English content (e.g., Chinese) is detected, the system automatically translates extracted entries to English for storage. This ensures consistent API communication and enables cross-language concept matching while optimizing for the primary user base (English materials).

## Scope

### In Scope
- Automatic context extraction on first PDF open (P5 page load)
- Cross-user content sharing via `pdf_content_hash`
- Course-level context scoping (all PDFs in a course share context)
- AI enhancement for: auto-explain, selection-explain, Q&A
- Progress display in P4 file list (word count tracking)
- Toast notification on completion
- Quality filtering via AI self-scoring
- Checkpoint-based retry for failed extractions (resume from last successful batch)
- Version tracking for extraction algorithm upgrades
- Storage limits: 5GB/user, 50 files/course, 100MB/file, 200 pages/file
- Usage limits: 20 PDF extractions per user per month (cost control)
- Basic monitoring (success rate, processing time, quality scores) from day 1
- Week 1 prototype validation: Manual extraction + quality testing before full implementation

### Out of Scope (MVP)
- User-visible context library browsing UI (deferred to v1.1, ~2 weeks post-MVP)
- Manual context entry management (add/edit/delete)
- Context injection for summary features (document/chapter/course summaries already see full content)
- Cross-course global library (user sees only course-level context)
- Vector embeddings / RAG (using keyword matching for MVP)
- Real-time extraction (only async background processing)
- Migration of pre-existing PDFs (system launches without legacy data)

## Success Metrics
1. **Core Value Validation** (Week 1) - Prototype test shows >20% improvement in AI answer accuracy with context vs without
2. **Cost Efficiency** - Monthly costs stay within $100-150 for 1000 active users; 70%+ cache hit rate for popular PDFs
3. **AI Quality** - Reduced "definition not found" type responses by 40%+ (measured via user feedback)
4. **User Experience** - Processing time targets (validated in Phase 2):
   - Slide decks (100 pages, 8k words): **<1 minute**
   - Typical textbook (200 pages, 120k words): **2-3 minutes**
   - 95%+ extraction success rate
5. **System Performance** - Context retrieval adds <200ms latency to AI calls

## Dependencies
- Existing PDF upload/storage system
- Existing `pdf_hash` mechanism (reuse from `canonical_documents` table)
- Existing `files.content_hash` column (already implemented in migration 002)
- OpenAI API (gpt-4o-mini for extraction and keyword extraction)
- Supabase Postgres (storage)

## Cost Analysis

### Extraction Costs
**Per-PDF extraction** (using gpt-4o-mini with word-based batching):
- Average 100-page textbook: ~60,000 words
- 15 batches × 7000 tokens/batch = 105k tokens total
- Input: 75k tokens × $0.15/1M = $0.011
- Output: 30k tokens × $0.60/1M = $0.018
- **Total: ~$0.03 per 100-page textbook**

**With cross-user sharing** (70% cache hit rate, conservative estimate):
- Effective cost: **$0.009 per user per common PDF** (3x reduction vs no sharing)

### Keyword Extraction Costs
**Per-AI-call overhead**:
- Each auto-explain/selection-explain/Q&A call extracts keywords first
- Input: 500 tokens (current page text + question)
- Output: 50 tokens (keyword list)
- Cost: **~$0.0001 per call** (gpt-4o-mini)

**Monthly impact** (1000 users, 100 AI calls each):
- 100,000 keyword extractions × $0.0001 = **$10/month**

### Total Monthly Cost Estimate
For 1000 active users (with usage limits and cost controls):
- Extraction: $0.06/user × 1000 = $60
- Keyword extraction: $10
- Infrastructure (Redis, increased workers): $10-20
- **Budget target: $80-120/month** (with 20 PDF/user/month limit)
- **Hard cost ceiling: $150/month** (enforced via usage quotas)

## Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| **Core value unproven** | 7.5 weeks wasted if users don't perceive improvement | **Week 1 prototype validation**: Manual extraction + 20-question quality test (with/without context); proceed only if >20% improvement |
| **Cost overruns** | Budget exceeded, unsustainable | Hard limits: 20 PDF/user/month, 200 pages/file; daily cost monitoring with $20/day alert; gradual rollout (10→50→100 users) |
| Extraction failures | Users lose context enhancement | Silent degradation: AI functions work without context; automatic retry with checkpoint resume (max 3 attempts) |
| Poor quality entries | Noisy context pollutes AI responses | AI self-scoring during extraction; filter entries with quality_score >= 0.7; within-PDF deduplication |
| Translation quality issues | Non-English PDFs get poor translations | English-first strategy reduces exposure; 10% quality penalty for translations; UI recommends English PDFs |
| Storage growth | Database bloat | 5GB/user limit; 200 pages/file; hash-based deduplication; monthly cleanup of orphaned entries |
| Duplicate entries | Same definition extracted multiple times | Deduplication logic keeps highest quality_score entry per title |
| Algorithm quality drift | Old extractions lower quality than new | Version tracking (`extraction_version` field); backfill jobs can re-extract with improved prompts |
| Slow processing for large files | User waits too long | Increased global concurrency (10 workers); word-based batching adapts to PDF density; prioritize smaller jobs; 200-page limit |

## Open Questions
None - all requirements clarified through discovery phase.
