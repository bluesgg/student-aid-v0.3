# StudentAid MVP Implementation Plan

> **Status**: Ready for execution
> **Last Updated**: 2026-01-05
> **Scope**: P1-P7 (Authentication → Core Learning → Optional Features)

---

## EXECUTIVE SUMMARY

This plan covers the implementation of StudentAid, a PDF learning platform for university students. The project is **greenfield** with complete specifications but no code yet.

**Tech Stack** (Locked):
- Frontend: Next.js 14 App Router + TypeScript + Tailwind + TanStack Query
- Backend: Next.js Route Handlers + Supabase (Auth/Postgres/Storage) + OpenAI API
- Database: Supabase Postgres with RLS + SQL migrations (no ORM)
- Rate Limiting: Vercel KV (Redis)
- Error Monitoring: Sentry (server-side only)
- Testing: Vitest (API tests) + Playwright (E2E smoke tests)
- Layout: react-resizable-panels
- Package Manager: pnpm

**Key Constraint**: All Supabase and OpenAI calls MUST be server-side only. Frontend uses `/api/*` endpoints exclusively.

---

## MILESTONES

### M1: Project Setup & Infrastructure (P0)
**Goal**: Bootstrap Next.js project with all dependencies and configs

**Scope**:
- Initialize Next.js 14 with App Router + TypeScript
- Install all dependencies (see FILE TREE section)
- Configure Tailwind CSS + base styles
- Set up Supabase projects (separate for dev/staging/prod)
- Create initial database schema with SQL migrations
- Set up Supabase RLS policies for row-level security
- Initialize Sentry for server-side error tracking
- Set up environment variables
- Initialize Vercel KV for rate limiting

**Acceptance Criteria**:
- [ ] `pnpm dev` starts dev server successfully
- [ ] `pnpm lint` and `pnpm typecheck` pass
- [ ] Supabase projects created (dev/staging/prod) with database accessible
- [ ] Database schema initialized via Supabase SQL migrations
- [ ] RLS policies active on all tables (verified with test queries)
- [ ] Sentry initialized and capturing test errors
- [ ] Source maps uploaded to Sentry for production
- [ ] Environment variables documented in `.env.example`

**Files to Create**:
```
/
├── package.json (with all dependencies)
├── next.config.js (with Sentry webpack plugin)
├── tailwind.config.js
├── tsconfig.json
├── sentry.server.config.ts
├── sentry.edge.config.ts (for middleware)
├── .env.example
├── .env.local (not committed)
└── src/
    ├── app/layout.tsx
    ├── app/page.tsx (redirect to /courses or /login)
    └── lib/
        ├── supabase/
        │   ├── server.ts (createClient helper)
        │   ├── db.ts (typed query helpers)
        │   └── migrations/
        │       └── 001_initial_schema.sql
        └── sentry/
            └── config.ts (Sentry error handling helpers)
```

**Dependencies** (partial list):
```json
{
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@supabase/supabase-js": "^2.39.0",
    "@supabase/ssr": "^0.1.0",
    "@sentry/nextjs": "^7.99.0",
    "openai": "^4.28.0",
    "@tanstack/react-query": "^5.28.0",
    "@vercel/kv": "^1.0.1",
    "react-pdf": "^7.7.0",
    "pdfjs-dist": "^3.11.174",
    "pdf-parse": "^1.1.1",
    "pdf-lib": "^1.17.1",
    "react-markdown": "^9.0.1",
    "remark-math": "^6.0.0",
    "remark-gfm": "^4.0.0",
    "rehype-katex": "^7.0.0",
    "katex": "^0.16.9",
    "prism-react-renderer": "^2.3.1",
    "react-resizable-panels": "^2.0.0",
    "react-window": "^1.8.10",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.11.0",
    "@types/react": "^18.3.0",
    "tailwindcss": "^3.4.0",
    "eslint": "^8.56.0",
    "eslint-config-next": "^14.2.0",
    "vitest": "^1.2.0",
    "@playwright/test": "^1.40.0"
  }
}
```

---

### M2: Authentication System (P1/P2)
**Goal**: Implement registration, login, logout, and email verification

**Reference Docs**:
- PRD §2.6 (data collection), §4.2 (tech stack)
- Page Design §2 (P1/P2)
- API Design §1 (auth endpoints)
- Tech §3 (Supabase integration)

**Scope**:
- P1: Login page with email/password
- P2: Registration page with email verification flow
- `/auth/callback` route for email confirmation
- Middleware for session management
- Auth API routes
- Email resend with rate limiting

**Acceptance Criteria**:
- [ ] User can register with email/password
- [ ] Registration triggers Supabase verification email
- [ ] Email link navigates to `/auth/callback` and redirects to `/courses`
- [ ] Unverified users get 403 on login with "Resend email" button
- [ ] Login sets httpOnly cookie and redirects to `/courses`
- [ ] Logout clears cookie and redirects to `/login`
- [ ] Middleware protects `/courses/*` and `/account/*` routes
- [ ] Resend email rate limited to 5/15min per email, 10/hour per IP
- [ ] Session expires after 30 days (Supabase refresh token)

**Files to Create/Modify**:
```
src/
├── app/
│   ├── (public)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── register/
│   │       └── page.tsx
│   ├── auth/
│   │   └── callback/
│   │       └── route.ts
│   └── api/
│       └── auth/
│           ├── register/
│           │   └── route.ts
│           ├── login/
│           │   └── route.ts
│           ├── logout/
│           │   └── route.ts
│           ├── me/
│           │   └── route.ts
│           └── resend-confirmation/
│               └── route.ts
├── middleware.ts
├── features/
│   └── auth/
│       ├── components/
│       │   ├── login-form.tsx
│       │   └── register-form.tsx
│       ├── api.ts
│       └── hooks/
│           └── use-auth.ts
└── lib/
    ├── api-client.ts (fetch wrapper with credentials)
    └── rate-limit.ts (Vercel KV helper)
```

**API Routes**:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /auth/callback` (not /api, redirect handler)
- `POST /api/auth/resend-confirmation`

---

### M3: Course Management (P3/P4)
**Goal**: CRUD operations for courses and PDF uploads

**Reference Docs**:
- PRD §3.1 (quota: 6 courses max)
- Page Design §3 (P3 course list), §4 (P4 course details)
- API Design §2 (courses & files)

**Scope**:
- P3: Course list page with create/edit/delete
- P4: Course details page with file management
- Multi-file PDF upload with type selection
- Scanned PDF detection
- File name conflict resolution
- Quota enforcement (6 courses per user)
- PDF content hash calculation for deduplication

**Acceptance Criteria**:
- [ ] User can create up to 6 courses
- [ ] Course names unique per user
- [ ] Course list shows file count and last visited
- [ ] P4 shows PDFs grouped by type (Lecture/Homework/Exam/Other)
- [ ] Multi-file drag-drop upload works
- [ ] Upload detects scanned PDFs (< 50 chars/page avg)
- [ ] Upload calculates SHA-256 hash of PDF text content
- [ ] File name conflicts show dialog (rename/replace/cancel)
- [ ] Replace deletes old file + all AI data
- [ ] Delete course cascades to files and AI data
- [ ] P4 displays account-wide AI quota preview

**Files to Create/Modify**:
```
src/
├── app/
│   ├── (app)/
│   │   ├── layout.tsx (auth check + user provider)
│   │   ├── courses/
│   │   │   ├── page.tsx (P3)
│   │   │   └── [courseId]/
│   │   │       ├── page.tsx (P4)
│   │   │       └── files/
│   │   │           └── [fileId]/
│   │   │               └── page.tsx (P5, next milestone)
│   │   └── account/
│   │       └── usage/
│   │           └── page.tsx (P7, later)
│   └── api/
│       ├── courses/
│       │   ├── route.ts (GET list, POST create)
│       │   └── [courseId]/
│       │       ├── route.ts (GET/PATCH/DELETE)
│       │       └── files/
│       │           ├── route.ts (GET list, POST upload)
│       │           └── [fileId]/
│       │               └── route.ts (GET/DELETE)
│       └── quotas/
│           └── route.ts (GET account quota)
├── features/
│   ├── courses/
│   │   ├── components/
│   │   │   ├── course-card.tsx
│   │   │   ├── course-list.tsx
│   │   │   ├── create-course-dialog.tsx
│   │   │   └── delete-course-dialog.tsx
│   │   ├── api.ts
│   │   └── hooks/
│   │       ├── use-courses.ts
│   │       └── use-create-course.ts
│   ├── files/
│   │   ├── components/
│   │   │   ├── file-list.tsx
│   │   │   ├── file-upload.tsx
│   │   │   └── file-conflict-dialog.tsx
│   │   ├── api.ts
│   │   └── hooks/
│   │       ├── use-files.ts
│   │       └── use-upload-file.ts
│   └── usage/
│       ├── components/
│       │   └── quota-badge.tsx (mini preview for P4)
│       └── api.ts
└── lib/
    ├── pdf/
    │   ├── detect-scanned.ts (< 50 chars/page logic)
    │   └── hash.ts (SHA-256 content hash)
    └── storage.ts (Supabase Storage helpers)
```

**Database Schema** (SQL with RLS):
```sql
-- Part of migration: 001_initial_schema.sql

-- ==================== COURSES ====================

CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  school TEXT NOT NULL,
  term TEXT NOT NULL,
  file_count INTEGER DEFAULT 0,
  last_visited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_user_course_name UNIQUE(user_id, name)
);

CREATE INDEX idx_courses_user_id ON courses(user_id);

-- RLS Policies
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own courses" ON courses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own courses" ON courses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own courses" ON courses
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own courses" ON courses
  FOR DELETE USING (auth.uid() = user_id);

-- ==================== FILES ====================

CREATE TYPE file_type AS ENUM ('Lecture', 'Homework', 'Exam', 'Other');

CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type file_type NOT NULL,
  page_count INTEGER NOT NULL,
  is_scanned BOOLEAN DEFAULT FALSE,
  pdf_content_hash VARCHAR(64),
  storage_key TEXT NOT NULL,
  last_read_page INTEGER DEFAULT 1,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_course_file_name UNIQUE(course_id, name)
);

CREATE INDEX idx_files_user_id_hash ON files(user_id, pdf_content_hash);
CREATE INDEX idx_files_course_id ON files(course_id);

-- RLS Policies
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own files" ON files
  FOR ALL USING (auth.uid() = user_id);
```

**API Routes**:
- `GET /api/courses`
- `POST /api/courses`
- `GET /api/courses/[courseId]`
- `PATCH /api/courses/[courseId]`
- `DELETE /api/courses/[courseId]`
- `POST /api/courses/[courseId]/files`
- `GET /api/courses/[courseId]/files/[fileId]`
- `DELETE /api/courses/[courseId]/files/[fileId]`
- `GET /api/quotas`

---

### M4: PDF Reader (P5 - Left Panel)
**Goal**: Implement PDF viewer with pagination, zoom, and page memory

**Reference Docs**:
- PRD §2.1 (layout structure)
- Page Design §5.1 (P5 layout)
- Tech §2.3 (PDF libs), §10.2 (performance)

**Scope**:
- PDF rendering with react-pdf
- Page navigation (prev/next/jump)
- Zoom controls (fit-width/fit-page/custom)
- Text selection for AI explain
- Remember last read page (persist to DB)
- Virtual scrolling for large PDFs (>50 pages)
- Responsive 3-column layout with resizable panels

**Acceptance Criteria**:
- [ ] PDF renders correctly (text layer visible)
- [ ] Page navigation works (prev/next buttons + page input)
- [ ] Zoom levels work (50%, 75%, 100%, 125%, 150%, fit-width, fit-page)
- [ ] User can select text in PDF
- [ ] Last read page saves on page change (debounced)
- [ ] Reopening file jumps to last read page
- [ ] Large PDFs (>50 pages) use virtual scrolling
- [ ] Layout has 3 draggable columns (PDF | Stickers | Q&A)
- [ ] Column widths persist to localStorage
- [ ] Each column min 20%, max 70%
- [ ] Scanned PDFs show warning in right panel

**Files to Create/Modify**:
```
src/
├── app/
│   └── (app)/
│       └── courses/
│           └── [courseId]/
│               └── files/
│                   └── [fileId]/
│                       └── page.tsx (main P5 page)
├── features/
│   ├── reader/
│   │   ├── components/
│   │   │   ├── pdf-viewer.tsx (main viewer)
│   │   │   ├── pdf-page.tsx (single page renderer)
│   │   │   ├── pdf-toolbar.tsx (zoom, page nav)
│   │   │   ├── text-selection-popup.tsx (AI explain trigger)
│   │   │   └── virtual-pdf-list.tsx (react-window wrapper)
│   │   ├── hooks/
│   │   │   ├── use-pdf-document.ts
│   │   │   ├── use-page-navigation.ts
│   │   │   ├── use-text-selection.ts
│   │   │   └── use-last-read-page.ts
│   │   └── api.ts (update last read page)
│   └── layout/
│       ├── components/
│       │   ├── resizable-layout.tsx (3-column wrapper)
│       │   └── layout-provider.tsx (persist widths)
│       └── hooks/
│           └── use-layout-preferences.ts (localStorage)
└── lib/
    └── pdf/
        └── worker.ts (pdfjs worker config)
```

**API Routes** (extended):
- `PATCH /api/courses/[courseId]/files/[fileId]` (update lastReadPage)

---

### M5: AI Stickers (P5 - Middle Panel)
**Goal**: Auto-explain and manual selection explain with follow-ups

**Reference Docs**:
- PRD §2.2 (AI capabilities), §2.3 (sticker mechanism), §3.1 (quota)
- Page Design §5.2 (sticker features)
- API Design §3 (AI endpoints), §3.0.1 (sticker model)

**Scope**:
- Auto-explain page (300/month quota, per-user)
- Selection explain (150/month quota shared with Q&A)
- Follow-up questions on stickers (max 10 depth)
- Sticker collapse/expand with persistence
- OpenAI streaming responses
- Quota enforcement and UI warnings
- Caching (return existing stickers without regeneration)

**Acceptance Criteria**:
- [ ] "Explain this page" button generates 2-6 auto stickers
- [ ] Auto stickers cached (subsequent clicks return DB data)
- [ ] Text selection in PDF shows "AI Explain" popup
- [ ] Selection explain creates manual sticker with original text snippet
- [ ] Text selection in sticker allows follow-up (max 10 depth)
- [ ] Stickers display as Markdown with LaTeX support
- [ ] Stickers collapsible (state persists to DB)
- [ ] Stickers have max height 300-400px with internal scroll
- [ ] Quota warnings at >90% usage
- [ ] HTTP 429 on quota exceeded with clear error message
- [ ] Streaming shows progressive text (first token < 2s)
- [ ] Failed streams don't deduct quota if no tokens received

**Files to Create/Modify**:
```
src/
├── app/
│   └── api/
│       └── ai/
│           ├── explain-page/
│           │   └── route.ts
│           ├── explain-selection/
│           │   └── route.ts
│           └── stickers/
│               ├── [stickerId]/
│               │   └── route.ts (PATCH for folded state)
│               └── route.ts (GET list for file)
├── features/
│   ├── stickers/
│   │   ├── components/
│   │   │   ├── sticker-panel.tsx (middle column)
│   │   │   ├── sticker-card.tsx (single sticker)
│   │   │   ├── auto-sticker.tsx
│   │   │   ├── manual-sticker.tsx
│   │   │   ├── sticker-thread.tsx (follow-up chain)
│   │   │   └── explain-page-button.tsx
│   │   ├── hooks/
│   │   │   ├── use-stickers.ts
│   │   │   ├── use-explain-page.ts
│   │   │   ├── use-explain-selection.ts
│   │   │   └── use-toggle-sticker.ts
│   │   └── api.ts
│   └── ai/
│       ├── components/
│       │   └── markdown-renderer.tsx (unified renderer)
│       └── lib/
│           └── streaming.ts (SSE parser)
├── lib/
│   ├── openai.ts (client config)
│   └── quota/
│       ├── check.ts (verify quota before AI call)
│       ├── deduct.ts (atomic decrement)
│       └── reset.ts (cron job helper, for later)
└── components/
    └── ui/
        └── markdown-renderer.tsx (moved from features/ai)
```

**Database Schema** (SQL with RLS):
```sql
-- Part of migration: 001_initial_schema.sql

-- ==================== STICKERS ====================

CREATE TYPE sticker_type AS ENUM ('auto', 'manual');

CREATE TABLE stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  type sticker_type NOT NULL,
  page INTEGER NOT NULL,
  anchor_text TEXT NOT NULL,
  anchor_rect JSONB,
  parent_id UUID REFERENCES stickers(id) ON DELETE CASCADE,
  content_markdown TEXT NOT NULL,
  folded BOOLEAN DEFAULT FALSE,
  depth INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stickers_file_page_type ON stickers(file_id, page, type);
CREATE INDEX idx_stickers_user_id ON stickers(user_id);

-- RLS Policies
ALTER TABLE stickers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own stickers" ON stickers
  FOR ALL USING (auth.uid() = user_id);

-- ==================== QUOTAS ====================

CREATE TYPE quota_bucket AS ENUM (
  'learningInteractions',
  'documentSummary',
  'sectionSummary',
  'courseSummary',
  'autoExplain'
);

CREATE TABLE quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket quota_bucket NOT NULL,
  used INTEGER DEFAULT 0,
  "limit" INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_user_bucket UNIQUE(user_id, bucket)
);

CREATE INDEX idx_quotas_user_id ON quotas(user_id);
CREATE INDEX idx_quotas_reset_at ON quotas(reset_at);

-- RLS Policies
ALTER TABLE quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own quotas" ON quotas
  FOR ALL USING (auth.uid() = user_id);
```

**API Routes**:
- `POST /api/ai/explain-page`
- `POST /api/ai/explain-selection`
- `GET /api/ai/stickers` (list for file/page)
- `PATCH /api/ai/stickers/[stickerId]` (toggle folded)

---

### M6: Q&A and Summaries (P5 - Right Panel)
**Goal**: Question answering and document/section summaries

**Reference Docs**:
- PRD §2.2 (AI capabilities), §3.1 (quota)
- Page Design §5.2 (Q&A, summaries)
- API Design §3.5, §3.6

**Scope**:
- Q&A input with context from entire PDF
- Document summary (single file)
- Section summary (page range)
- Summary caching (no regeneration)
- References to page numbers in answers
- Quota sharing (Q&A uses learningInteractions bucket)

**Acceptance Criteria**:
- [ ] User can ask questions about the PDF
- [ ] Answers include page references (clickable to jump)
- [ ] Q&A history persists per file
- [ ] "Summarize this document" button creates summary card
- [ ] "Summarize this section" allows page range input
- [ ] Summaries cached (no regeneration on reopen)
- [ ] In-progress summary returns 409 with appropriate message
- [ ] Q&A and summaries use separate quota buckets
- [ ] All AI responses rendered as Markdown with LaTeX

**Files to Create/Modify**:
```
src/
├── app/
│   └── api/
│       └── ai/
│           ├── qa/
│           │   └── route.ts
│           └── summarize/
│               └── route.ts
├── features/
│   └── qa/
│       ├── components/
│       │   ├── qa-panel.tsx (right column)
│       │   ├── qa-input.tsx
│       │   ├── qa-history.tsx
│       │   ├── qa-card.tsx
│       │   ├── summary-card.tsx
│       │   └── summary-buttons.tsx
│       ├── hooks/
│       │   ├── use-qa.ts
│       │   ├── use-summarize.ts
│       │   └── use-qa-history.ts
│       └── api.ts
└── lib/
    └── openai/
        ├── qa.ts (Q&A prompt engineering)
        └── summarize.ts (summary prompts)
```

**Database Schema Changes** (SQL with RLS):
```sql
-- Part of migration: 001_initial_schema.sql

-- ==================== QA INTERACTIONS ====================

CREATE TABLE qa_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer_markdown TEXT NOT NULL,
  references JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_qa_file_id ON qa_interactions(file_id);
CREATE INDEX idx_qa_user_id ON qa_interactions(user_id);

-- RLS Policies
ALTER TABLE qa_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own qa" ON qa_interactions
  FOR ALL USING (auth.uid() = user_id);

-- ==================== SUMMARIES ====================

CREATE TYPE summary_type AS ENUM ('document', 'section', 'course');

CREATE TABLE summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL,
  file_id UUID REFERENCES files(id) ON DELETE CASCADE,
  type summary_type NOT NULL,
  page_range_start INTEGER,
  page_range_end INTEGER,
  content_markdown TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_summaries_file_type ON summaries(file_id, type);
CREATE INDEX idx_summaries_user_id ON summaries(user_id);
CREATE INDEX idx_summaries_course_type ON summaries(course_id, type);

-- RLS Policies
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own summaries" ON summaries
  FOR ALL USING (auth.uid() = user_id);
```

**API Routes**:
- `POST /api/ai/qa`
- `POST /api/ai/summarize`
- `GET /api/ai/qa/history` (for file)

---

### M7: Course Outline (P6) [OPTIONAL]
**Goal**: Generate course-level study outline

**Reference Docs**:
- PRD §2.2 (course-level capabilities)
- Page Design §6 (P6)
- API Design §3 (courseSummary quota)

**Scope**:
- Course outline page
- Generate outline from all files in course
- Tree structure (chapters → sections → concepts)
- Links to PDF pages
- 15/month quota (courseSummary bucket)

**Acceptance Criteria**:
- [ ] "Generate course outline" button in P4
- [ ] Outline displays as expandable tree
- [ ] Sections link to specific PDF pages
- [ ] Outline cached (regenerate button available)
- [ ] Uses courseSummary quota bucket (15/month)

**Files to Create/Modify**:
```
src/
├── app/
│   ├── (app)/
│   │   └── courses/
│   │       └── [courseId]/
│   │           └── outline/
│   │               └── page.tsx
│   └── api/
│       └── ai/
│           └── outline/
│               └── route.ts
└── features/
    └── outline/
        ├── components/
        │   ├── outline-tree.tsx
        │   ├── outline-node.tsx
        │   └── generate-outline-button.tsx
        ├── hooks/
        │   └── use-outline.ts
        └── api.ts
```

**API Routes**:
- `POST /api/ai/outline`
- `GET /api/courses/[courseId]/outline`

---

### M8: Usage & Token Tracking Dashboard (P7) [REQUIRED per D7]
**Goal**: Display quota usage, token consumption, and estimated costs

**Reference Docs**:
- PRD §3.1 (quota definitions)
- Page Design §7 (P7)
- API Design §4 (quota endpoint)
- Decision D7 (Token Tracking)

**Scope**:
- P7 usage page with quota and token tracking
- Display all quota buckets with progress bars
- Show reset date (based on user registration anniversary)
- Color-coded warnings (green < 70%, yellow 70-90%, red > 90%)
- **NEW**: Display token usage and estimated costs per quota bucket
- **NEW**: Show cost breakdown by operation type
- **NEW**: Project monthly costs based on current usage
- **NEW**: Alert if costs exceed threshold

**Acceptance Criteria**:
- [ ] Shows all quota buckets with used/limit
- [ ] Progress bars color-coded by usage percentage
- [ ] Displays next reset date in user's timezone
- [ ] Explains account-wide quota sharing
- [ ] Links to P7 from P4 quota preview
- [ ] **NEW**: Shows estimated token usage per AI operation
- [ ] **NEW**: Displays cost breakdown by operation type (bar chart)
- [ ] **NEW**: Shows token usage timeline (line graph)
- [ ] **NEW**: Projects monthly costs with visual indicator
- [ ] **NEW**: Alerts when projected cost > $10/month

**Files to Create/Modify**:
```
src/
├── app/
│   ├── (app)/
│   │   └── account/
│   │       └── usage/
│   │           └── page.tsx
│   └── api/
│       └── quotas/
│           └── tokens/
│               └── route.ts (NEW: token stats endpoint)
├── features/
│   └── usage/
│       ├── components/
│       │   ├── quota-overview.tsx
│       │   ├── quota-progress-bar.tsx
│       │   ├── reset-date-display.tsx
│       │   ├── token-usage-chart.tsx (NEW: bar chart)
│       │   ├── cost-breakdown.tsx (NEW: pie chart)
│       │   ├── token-timeline.tsx (NEW: line graph)
│       │   └── estimated-monthly-cost.tsx (NEW: projection)
│       └── hooks/
│           ├── use-quota-overview.ts
│           └── use-token-stats.ts (NEW)
└── lib/
    └── openai/
        └── cost-tracker.ts (NEW: cost calculation utilities)
```

---

## API MAP

### Authentication APIs
| Endpoint | Handler | Method | Related Pages |
|----------|---------|--------|---------------|
| `/api/auth/register` | `src/app/api/auth/register/route.ts` | POST | P2 (register) |
| `/api/auth/login` | `src/app/api/auth/login/route.ts` | POST | P1 (login) |
| `/api/auth/logout` | `src/app/api/auth/logout/route.ts` | POST | All (header) |
| `/api/auth/me` | `src/app/api/auth/me/route.ts` | GET | All (auth check) |
| `/api/auth/resend-confirmation` | `src/app/api/auth/resend-confirmation/route.ts` | POST | P1, P2 |
| `/auth/callback` | `src/app/auth/callback/route.ts` | GET | Email link |

### Course & File APIs
| Endpoint | Handler | Method | Related Pages |
|----------|---------|--------|---------------|
| `/api/courses` | `src/app/api/courses/route.ts` | GET, POST | P3 |
| `/api/courses/[courseId]` | `src/app/api/courses/[courseId]/route.ts` | GET, PATCH, DELETE | P3, P4 |
| `/api/courses/[courseId]/files` | `src/app/api/courses/[courseId]/files/route.ts` | POST | P4 |
| `/api/courses/[courseId]/files/[fileId]` | `src/app/api/courses/[courseId]/files/[fileId]/route.ts` | GET, PATCH, DELETE | P4, P5 |

### AI Learning APIs
| Endpoint | Handler | Method | Related Pages |
|----------|---------|--------|---------------|
| `/api/ai/explain-page` | `src/app/api/ai/explain-page/route.ts` | POST | P5 (sticker panel) |
| `/api/ai/explain-selection` | `src/app/api/ai/explain-selection/route.ts` | POST | P5 (sticker panel) |
| `/api/ai/qa` | `src/app/api/ai/qa/route.ts` | POST | P5 (Q&A panel) |
| `/api/ai/summarize` | `src/app/api/ai/summarize/route.ts` | POST | P5 (Q&A panel) |
| `/api/ai/outline` | `src/app/api/ai/outline/route.ts` | POST | P6 (outline) |
| `/api/ai/stickers` | `src/app/api/ai/stickers/route.ts` | GET | P5 (load stickers) |
| `/api/ai/stickers/[stickerId]` | `src/app/api/ai/stickers/[stickerId]/route.ts` | PATCH | P5 (toggle fold) |

### Quota & Usage APIs
| Endpoint | Handler | Method | Related Pages |
|----------|---------|--------|---------------|
| `/api/quotas` | `src/app/api/quotas/route.ts` | GET | P4, P5, P7 |

---

## DATA MODEL

### Complete Database Schema (SQL with RLS)

```sql
-- Migration: 001_initial_schema.sql
-- Complete database schema for StudentAid MVP
-- All tables use Row-Level Security (RLS) for automatic user isolation

-- Enable RLS globally
ALTER DATABASE postgres SET row_security = on;

-- ==================== AUTH ====================
-- Users managed by Supabase Auth (auth.users table)
-- All user_id columns reference auth.users(id)

-- ==================== COURSES ====================

CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  school TEXT NOT NULL,
  term TEXT NOT NULL,
  file_count INTEGER DEFAULT 0,
  last_visited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_user_course_name UNIQUE(user_id, name)
);

CREATE INDEX idx_courses_user_id ON courses(user_id);

-- RLS Policies
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own courses" ON courses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own courses" ON courses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own courses" ON courses
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own courses" ON courses
  FOR DELETE USING (auth.uid() = user_id);

-- ==================== FILES ====================

CREATE TYPE file_type AS ENUM ('Lecture', 'Homework', 'Exam', 'Other');

CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type file_type NOT NULL,
  page_count INTEGER NOT NULL,
  is_scanned BOOLEAN DEFAULT FALSE,
  pdf_content_hash VARCHAR(64),
  storage_key TEXT NOT NULL,
  last_read_page INTEGER DEFAULT 1,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_course_file_name UNIQUE(course_id, name)
);

CREATE INDEX idx_files_user_id_hash ON files(user_id, pdf_content_hash);
CREATE INDEX idx_files_course_id ON files(course_id);

-- RLS Policies
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own files" ON files
  FOR ALL USING (auth.uid() = user_id);

-- ==================== AI LEARNING DATA ====================

-- Stickers (AI explanations anchored to PDF pages)

CREATE TYPE sticker_type AS ENUM ('auto', 'manual');

CREATE TABLE stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  type sticker_type NOT NULL,
  page INTEGER NOT NULL,
  anchor_text TEXT NOT NULL,
  anchor_rect JSONB,
  parent_id UUID REFERENCES stickers(id) ON DELETE CASCADE,
  content_markdown TEXT NOT NULL,
  folded BOOLEAN DEFAULT FALSE,
  depth INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stickers_file_page_type ON stickers(file_id, page, type);
CREATE INDEX idx_stickers_user_id ON stickers(user_id);

-- RLS Policies
ALTER TABLE stickers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own stickers" ON stickers
  FOR ALL USING (auth.uid() = user_id);

-- Q&A Interactions

CREATE TABLE qa_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer_markdown TEXT NOT NULL,
  references JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_qa_file_id ON qa_interactions(file_id);
CREATE INDEX idx_qa_user_id ON qa_interactions(user_id);

-- RLS Policies
ALTER TABLE qa_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own qa" ON qa_interactions
  FOR ALL USING (auth.uid() = user_id);

-- Summaries

CREATE TYPE summary_type AS ENUM ('document', 'section', 'course');

CREATE TABLE summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL,
  file_id UUID REFERENCES files(id) ON DELETE CASCADE,
  type summary_type NOT NULL,
  page_range_start INTEGER,
  page_range_end INTEGER,
  content_markdown TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_summaries_file_type ON summaries(file_id, type);
CREATE INDEX idx_summaries_user_id ON summaries(user_id);
CREATE INDEX idx_summaries_course_type ON summaries(course_id, type);

-- RLS Policies
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own summaries" ON summaries
  FOR ALL USING (auth.uid() = user_id);

-- ==================== QUOTAS ====================

CREATE TYPE quota_bucket AS ENUM (
  'learningInteractions',
  'documentSummary',
  'sectionSummary',
  'courseSummary',
  'autoExplain'
);

CREATE TABLE quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket quota_bucket NOT NULL,
  used INTEGER DEFAULT 0,
  "limit" INTEGER NOT NULL,
  reset_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_user_bucket UNIQUE(user_id, bucket)
);

CREATE INDEX idx_quotas_user_id ON quotas(user_id);
CREATE INDEX idx_quotas_reset_at ON quotas(reset_at);

-- RLS Policies
ALTER TABLE quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own quotas" ON quotas
  FOR ALL USING (auth.uid() = user_id);

-- ==================== OPTIONAL: MONITORING & AUDIT ====================
-- (Implement in M1 for error monitoring via Sentry)

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  ip_prefix VARCHAR(20),
  user_agent VARCHAR(255),
  request_id VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);

-- RLS Policies (admin-only, no user access)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON audit_logs
  FOR ALL USING (auth.role() = 'service_role');

-- AI Usage Logs (for token tracking dashboard)

CREATE TABLE ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id VARCHAR(50),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  course_id UUID,
  file_id UUID,
  operation_type VARCHAR(50) NOT NULL,
  model VARCHAR(50) NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd_approx DECIMAL(10, 6) NOT NULL,
  latency_ms INTEGER NOT NULL,
  success BOOLEAN NOT NULL,
  error_code VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_logs_user_id ON ai_usage_logs(user_id);
CREATE INDEX idx_ai_logs_created_at ON ai_usage_logs(created_at);

-- RLS Policies (admin-only for privacy; users access via aggregated API)
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON ai_usage_logs
  FOR ALL USING (auth.role() = 'service_role');
```

### Access Control Principles

**Row-Level Security (RLS)** via Supabase PostgreSQL policies:

All tables have RLS enabled with policies that automatically filter by `auth.uid()`. This ensures:

1. **Courses**: Users can only view/modify their own courses (`user_id = auth.uid()`)
2. **Files**: Users can only access files they own (enforced at database level)
3. **Stickers/QA/Summaries**: Users can only access their own learning data
4. **Quotas**: Users can only read/write their own quota records
5. **Audit/AI Usage Logs**: Admin-only access (service role) - users access aggregated data via API

**Benefits of RLS**:
- **Database-level security**: Cannot be bypassed by application code
- **No manual userId checks**: RLS policies automatically filter queries
- **Consistent across all queries**: SELECT, INSERT, UPDATE, DELETE all enforced
- **Defense in depth**: Even if API route forgets auth check, database blocks unauthorized access

**Cascade Deletes**:
- Delete course → automatically deletes all files → deletes all stickers/QA/summaries
- Delete file → automatically deletes all stickers/QA/summaries for that file
- Configured via `ON DELETE CASCADE` in foreign key constraints

---

## FILE TREE (Proposed)

```
student-aid/
├── .env.example
├── .env.local (not committed)
├── .eslintrc.json
├── .gitignore
├── next.config.js (with Sentry webpack plugin)
├── package.json
├── pnpm-lock.yaml
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── sentry.server.config.ts (server-side error tracking)
├── sentry.edge.config.ts (middleware error tracking)
├── playwright.config.ts (E2E test configuration)
├── vitest.config.ts (API test configuration)
├── public/
│   └── (static assets)
├── docs/
│   ├── 01_light_prd.md
│   ├── 02_page_and_flow_design.md
│   ├── 03_api_design.md
│   ├── 04_tech_and_code_style.md
│   └── 10_plan.md (this file)
├── tests/
│   ├── api/ (Vitest unit tests for API routes)
│   │   ├── auth.test.ts
│   │   ├── courses.test.ts
│   │   ├── files.test.ts
│   │   ├── ai.test.ts
│   │   └── quotas.test.ts
│   └── e2e/ (Playwright end-to-end tests)
│       ├── auth.spec.ts
│       ├── upload.spec.ts
│       ├── ai-explain.spec.ts
│       └── qa.spec.ts
└── src/
    ├── app/
    │   ├── layout.tsx (root layout, providers)
    │   ├── page.tsx (redirect to /courses or /login)
    │   ├── globals.css (Tailwind imports + KaTeX CSS)
    │   ├── (public)/
    │   │   ├── layout.tsx (public layout)
    │   │   ├── login/
    │   │   │   └── page.tsx
    │   │   └── register/
    │   │       └── page.tsx
    │   ├── (app)/
    │   │   ├── layout.tsx (auth check, user provider)
    │   │   ├── courses/
    │   │   │   ├── page.tsx (P3)
    │   │   │   └── [courseId]/
    │   │   │       ├── page.tsx (P4)
    │   │   │       ├── outline/
    │   │   │       │   └── page.tsx (P6)
    │   │   │       └── files/
    │   │   │           └── [fileId]/
    │   │   │               └── page.tsx (P5)
    │   │   └── account/
    │   │       └── usage/
    │   │           └── page.tsx (P7)
    │   ├── auth/
    │   │   └── callback/
    │   │       └── route.ts
    │   └── api/
    │       ├── auth/
    │       │   ├── register/route.ts
    │       │   ├── login/route.ts
    │       │   ├── logout/route.ts
    │       │   ├── me/route.ts
    │       │   └── resend-confirmation/route.ts
    │       ├── courses/
    │       │   ├── route.ts
    │       │   └── [courseId]/
    │       │       ├── route.ts
    │       │       └── files/
    │       │           ├── route.ts
    │       │           └── [fileId]/
    │       │               └── route.ts
    │       ├── ai/
    │       │   ├── explain-page/route.ts
    │       │   ├── explain-selection/route.ts
    │       │   ├── qa/route.ts
    │       │   ├── summarize/route.ts
    │       │   ├── outline/route.ts
    │       │   └── stickers/
    │       │       ├── route.ts
    │       │       └── [stickerId]/route.ts
    │       ├── quotas/
    │       │   ├── route.ts
    │       │   └── tokens/
    │       │       └── route.ts (NEW: token stats)
    │       └── cron/
    │           └── reset-quotas/
    │               └── route.ts (NEW: quota reset cron)
    ├── middleware.ts
    ├── components/
    │   └── ui/
    │       ├── button.tsx
    │       ├── input.tsx
    │       ├── dialog.tsx
    │       ├── card.tsx
    │       ├── progress.tsx
    │       └── markdown-renderer.tsx (unified AI output)
    ├── features/
    │   ├── auth/
    │   │   ├── components/
    │   │   │   ├── login-form.tsx
    │   │   │   └── register-form.tsx
    │   │   ├── hooks/
    │   │   │   └── use-auth.ts
    │   │   └── api.ts
    │   ├── courses/
    │   │   ├── components/
    │   │   │   ├── course-card.tsx
    │   │   │   ├── course-list.tsx
    │   │   │   ├── create-course-dialog.tsx
    │   │   │   ├── edit-course-dialog.tsx
    │   │   │   └── delete-course-dialog.tsx
    │   │   ├── hooks/
    │   │   │   ├── use-courses.ts
    │   │   │   ├── use-create-course.ts
    │   │   │   └── use-delete-course.ts
    │   │   └── api.ts
    │   ├── files/
    │   │   ├── components/
    │   │   │   ├── file-list.tsx
    │   │   │   ├── file-card.tsx
    │   │   │   ├── file-upload.tsx
    │   │   │   ├── file-conflict-dialog.tsx
    │   │   │   └── scanned-badge.tsx
    │   │   ├── hooks/
    │   │   │   ├── use-files.ts
    │   │   │   ├── use-upload-file.ts
    │   │   │   └── use-delete-file.ts
    │   │   └── api.ts
    │   ├── reader/
    │   │   ├── components/
    │   │   │   ├── pdf-viewer.tsx
    │   │   │   ├── pdf-page.tsx
    │   │   │   ├── pdf-toolbar.tsx
    │   │   │   ├── text-selection-popup.tsx
    │   │   │   └── virtual-pdf-list.tsx
    │   │   ├── hooks/
    │   │   │   ├── use-pdf-document.ts
    │   │   │   ├── use-page-navigation.ts
    │   │   │   ├── use-text-selection.ts
    │   │   │   └── use-last-read-page.ts
    │   │   └── api.ts
    │   ├── stickers/
    │   │   ├── components/
    │   │   │   ├── sticker-panel.tsx
    │   │   │   ├── sticker-card.tsx
    │   │   │   ├── auto-sticker.tsx
    │   │   │   ├── manual-sticker.tsx
    │   │   │   ├── sticker-thread.tsx
    │   │   │   └── explain-page-button.tsx
    │   │   ├── hooks/
    │   │   │   ├── use-stickers.ts
    │   │   │   ├── use-explain-page.ts
    │   │   │   ├── use-explain-selection.ts
    │   │   │   └── use-toggle-sticker.ts
    │   │   └── api.ts
    │   ├── qa/
    │   │   ├── components/
    │   │   │   ├── qa-panel.tsx
    │   │   │   ├── qa-input.tsx
    │   │   │   ├── qa-history.tsx
    │   │   │   ├── qa-card.tsx
    │   │   │   ├── summary-card.tsx
    │   │   │   └── summary-buttons.tsx
    │   │   ├── hooks/
    │   │   │   ├── use-qa.ts
    │   │   │   ├── use-summarize.ts
    │   │   │   └── use-qa-history.ts
    │   │   └── api.ts
    │   ├── outline/
    │   │   ├── components/
    │   │   │   ├── outline-tree.tsx
    │   │   │   ├── outline-node.tsx
    │   │   │   └── generate-outline-button.tsx
    │   │   ├── hooks/
    │   │   │   └── use-outline.ts
    │   │   └── api.ts
    │   ├── usage/
    │   │   ├── components/
    │   │   │   ├── quota-overview.tsx
    │   │   │   ├── quota-progress-bar.tsx
    │   │   │   ├── quota-badge.tsx
    │   │   │   ├── reset-date-display.tsx
    │   │   │   ├── token-usage-chart.tsx (NEW: bar chart)
    │   │   │   ├── cost-breakdown.tsx (NEW: pie chart)
    │   │   │   ├── token-timeline.tsx (NEW: line graph)
    │   │   │   └── estimated-monthly-cost.tsx (NEW: projection)
    │   │   ├── hooks/
    │   │   │   ├── use-quota-overview.ts
    │   │   │   └── use-token-stats.ts (NEW)
    │   │   └── api.ts
    │   └── layout/
    │       ├── components/
    │       │   ├── resizable-layout.tsx
    │       │   └── layout-provider.tsx
    │       └── hooks/
    │           └── use-layout-preferences.ts
    ├── lib/
    │   ├── supabase/
    │   │   ├── server.ts (createClient helper)
    │   │   ├── db.ts (typed query helpers)
    │   │   └── migrations/
    │   │       └── 001_initial_schema.sql
    │   ├── openai/
    │   │   ├── client.ts
    │   │   ├── streaming.ts
    │   │   ├── prompts/
    │   │   │   ├── explain-page.ts
    │   │   │   ├── explain-selection.ts
    │   │   │   ├── qa.ts
    │   │   │   └── summarize.ts
    │   │   └── cost-tracker.ts (REQUIRED for token tracking)
    │   ├── pdf/
    │   │   ├── detect-scanned.ts
    │   │   ├── hash.ts
    │   │   └── worker.ts
    │   ├── quota/
    │   │   ├── check.ts
    │   │   ├── deduct.ts
    │   │   ├── reset.ts (cron job helper)
    │   │   └── check-and-reset.ts (NEW: on-demand fallback)
    │   ├── sentry/
    │   │   └── config.ts (Sentry error handling helpers)
    │   ├── storage.ts (Supabase Storage helpers)
    │   ├── rate-limit.ts (Vercel KV wrapper)
    │   ├── api-client.ts (fetch wrapper)
    │   └── utils.ts (misc helpers)
    ├── types/
    │   ├── index.ts
    │   ├── api.ts
    │   ├── course.ts
    │   ├── file.ts
    │   ├── sticker.ts
    │   ├── qa.ts
    │   └── quota.ts
    └── config/
        ├── quotas.ts (quota limits)
        ├── constants.ts
        └── env.ts (env var validation)
```

**Key Decisions in Structure**:
1. **Route Groups**: `(public)` for login/register, `(app)` for auth-required pages
2. **Feature-First**: Organize by feature (`features/courses`, `features/stickers`) rather than by type
3. **Server Components Default**: Only add `'use client'` when needed (forms, interactive UI)
4. **API Co-location**: API routes mirror page structure

---

## CRITICAL ARCHITECTURE DECISIONS ✅ ALL CONFIRMED

### ✅ Confirmed Decisions (from user input):
1. **Database**: Supabase Postgres with RLS (NO Prisma ORM)
2. **Rate Limiting**: Vercel KV (Redis)
3. **Resizable Layout**: react-resizable-panels
4. **PDF Deduplication**: Yes, implement in MVP
5. **Error Monitoring**: Sentry (server-side only)
6. **Testing**: Vitest (API tests) + Playwright (E2E smoke tests)
7. **Email**: Supabase built-in templates
8. **Quota Reset**: Hybrid (Cron + on-demand)
9. **Streaming**: Server-Sent Events (SSE)
10. **Dev Environment**: Separate cloud projects (dev/staging/prod)
11. **Token Tracking**: Real-time dashboard in P7

---

### Implementation Details

#### D1: Email Configuration ✅ CONFIRMED
**Decision**: Use Supabase built-in email templates

**Implementation**:
- Use Supabase Auth email templates for verification
- Customize templates via Supabase dashboard
- Zero additional configuration required
- Can migrate to custom SMTP post-MVP if needed

**Rationale**: Fastest MVP path with zero setup overhead

---

#### D2: Quota Reset Strategy ✅ CONFIRMED
**Decision**: Hybrid (Vercel Cron + On-demand fallback)

**Implementation**:

1. **Primary: Vercel Cron** runs daily at 00:00 UTC
   - Queries users where `EXTRACT(DAY FROM created_at) = EXTRACT(DAY FROM NOW())`
   - Bulk resets quotas for matching users
   - Endpoint: `src/app/api/cron/reset-quotas/route.ts`

2. **Fallback: On-demand check** in quota deduction logic
   - If `reset_at < NOW()`, reset quota before deducting
   - Handles edge cases where cron missed a user
   - Helper: `src/lib/quota/check-and-reset.ts`

**Benefits**:
- Dual redundancy for maximum reliability
- Instant reset for edge cases
- Simple cron implementation

**Rationale**: Best reliability with minimal added complexity

---

#### D3: Streaming Implementation ✅ CONFIRMED
**Decision**: Server-Sent Events (SSE) via Next.js ReadableStream

**Implementation**:
- Next.js Route Handlers return `ReadableStream`
- Frontend uses `fetch` with streaming reader
- OpenAI streaming chunks forwarded to client
- Built-in Next.js 14 App Router support

**Example**:
```typescript
// src/app/api/ai/explain-page/route.ts
export async function POST(req: Request) {
  const stream = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    stream: true,
    messages: [...]
  })

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify(chunk)}\n\n`
            )
          )
        }
        controller.close()
      }
    }),
    { headers: { 'Content-Type': 'text/event-stream' } }
  )
}
```

**Rationale**: Standard approach with excellent Next.js 14 support

---

#### D4: Development Environment ✅ CONFIRMED
**Decision**: Cloud-only Supabase with separate projects for dev/staging/prod

**Implementation**:
- Create 3 Supabase projects:
  - `studentaid-dev` (development)
  - `studentaid-staging` (testing)
  - `studentaid-prod` (production)

- Environment-specific `.env` files:
  - `.env.local` (dev)
  - `.env.staging` (staging)
  - `.env.production` (prod)

- Database migrations:
  - Develop in `dev` project
  - Test in `staging` project
  - Deploy to `prod` via Supabase CLI

**Benefits**:
- Isolated data per environment
- No Docker setup complexity
- Consistent cloud environment
- Easy rollback and migration testing

**Rationale**: Maximum isolation without Docker complexity

---

#### D5: Error Monitoring ✅ CONFIRMED
**Decision**: Add Sentry for server-side error tracking

**Implementation**:

1. Install `@sentry/nextjs@^7.99.0`
2. Configure server-side only (no client bundle bloat)
3. Track errors in:
   - API routes
   - Server components
   - Middleware
   - Background jobs (cron)

**Configuration**:
```typescript
// sentry.server.config.ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1, // 10% performance monitoring
  enabled: process.env.NODE_ENV === 'production',
  integrations: [
    new Sentry.Integrations.Postgres(),
  ]
})
```

**Features**:
- Error aggregation and deduplication
- Stack traces with source maps
- Performance monitoring (API latency)
- Alerts for critical errors
- No client-side tracking (privacy-focused)

**Rationale**: Critical for production debugging without manual log inspection

---

#### D6: Testing Strategy ✅ CONFIRMED
**Decision**: API route unit tests + minimal E2E smoke tests

**Implementation**:

1. **API Route Tests** (Vitest):
   - Unit tests for all API endpoints
   - Mock Supabase and OpenAI
   - Test quota enforcement, auth, validation
   - Run on every commit

2. **E2E Smoke Tests** (Playwright):
   - Critical user flows only:
     - Register → Email verification → Login
     - Create course → Upload PDF → View in reader
     - Explain page → Generate sticker → Collapse/expand
     - Q&A → Ask question → Get answer
   - Run on every deploy to staging/prod
   - Headless mode for CI/CD

**Files**:
- `tests/api/**/*.test.ts` (Vitest API tests)
- `tests/e2e/**/*.spec.ts` (Playwright E2E tests)

**Scripts**:
```json
{
  "scripts": {
    "test": "vitest",
    "test:e2e": "playwright test",
    "test:ci": "vitest run && playwright test"
  }
}
```

**Rationale**: Comprehensive coverage without excessive maintenance burden

---

#### D7: OpenAI Token Tracking ✅ CONFIRMED
**Decision**: Implement real-time token tracking dashboard in P7 (M8)

**Implementation**:

1. **Token Logging** (all AI operations):
   - Log to `ai_usage_logs` table:
     - `input_tokens`, `output_tokens`
     - `cost_usd_approx` (calculated)
     - `operation_type`, `model`, `latency_ms`

2. **Cost Calculation**:
```typescript
// lib/openai/cost-tracker.ts
const PRICING = {
  'gpt-4-turbo-preview': { input: 0.01 / 1000, output: 0.03 / 1000 },
  'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 },
  'gpt-3.5-turbo-16k': { input: 0.003 / 1000, output: 0.004 / 1000 }
}

export function calculateCost(model: string, inputTokens: number, outputTokens: number) {
  const pricing = PRICING[model]
  return inputTokens * pricing.input + outputTokens * pricing.output
}
```

3. **Dashboard Components** (expanded M8):
   - `QuotaOverview` (existing)
   - **NEW**: `TokenUsageChart` - Bar chart of tokens by operation type
   - **NEW**: `CostBreakdown` - Pie chart of costs by quota bucket
   - **NEW**: `TokenTimeline` - Line graph of token usage over time
   - **NEW**: `EstimatedMonthlyCost` - Projection based on current usage

4. **API Endpoint**:
   - `GET /api/quotas/tokens` - Returns aggregated token stats:
     ```json
     {
       "totalTokens": 125000,
       "totalCost": 3.75,
       "byOperation": {
         "autoExplain": { "tokens": 50000, "cost": 1.50 },
         "selectionExplain": { "tokens": 30000, "cost": 0.90 },
         "qa": { "tokens": 25000, "cost": 0.75 },
         "documentSummary": { "tokens": 20000, "cost": 0.60 }
       },
       "monthlyProjection": 7.50
     }
     ```

**Rationale**: Essential for cost monitoring and user transparency

---

## RISKS & VALIDATION

### Top 10 Risks

#### R1: OpenAI API Rate Limits 🔴 **HIGH**
**Risk**: OpenAI rate limits hit during concurrent user requests

**Validation**:
- Load test with 10 concurrent users requesting AI explanations
- Monitor OpenAI API dashboard for rate limit errors
- Test quota enforcement prevents runaway costs

**Mitigation**:
- Implement request queuing (simple in-memory queue for MVP)
- Add exponential backoff with retry logic
- Set per-user rate limits (max 5 concurrent AI requests)
- Cache aggressively (return existing stickers/summaries)

---

#### R2: PDF Text Extraction Quality 🟡 **MEDIUM**
**Risk**: Some PDFs have poor text extraction (scanned, image-heavy, non-English)

**Validation**:
- Test with 20+ diverse PDFs (slides, textbooks, scanned notes, multilingual)
- Verify scanned detection works (< 50 chars/page threshold)
- Test selection explain on image-heavy PDFs

**Mitigation**:
- Clear UI warnings for scanned PDFs
- Fall back gracefully (hide AI buttons, show message)
- Consider OCR post-MVP (Tesseract.js or AWS Textract)

---

#### R3: Large PDF Performance 🟡 **MEDIUM**
**Risk**: PDFs with 100+ pages cause browser crashes or slow renders

**Validation**:
- Test with PDFs of 50, 100, 200 pages
- Measure LCP (target < 3s) and FPS (target 60fps)
- Test on throttled CPU (4x slowdown)

**Mitigation**:
- Virtual scrolling with `react-window` (only render visible pages ±2)
- Lazy load page canvases
- Consider server-side thumbnail generation for preview

---

#### R4: Quota Synchronization 🔴 **HIGH**
**Risk**: Race conditions in quota deduction (multiple tabs, concurrent requests)

**Validation**:
- Open 3 tabs, rapid-fire AI requests simultaneously
- Check DB: `SELECT used FROM quotas` should match expected count
- Test edge case: quota at 149/150, make 2 concurrent requests

**Mitigation**:
- Use Prisma transactions with optimistic locking:
  ```ts
  await prisma.quota.update({
    where: { userId_bucket: { userId, bucket } },
    data: { used: { increment: 1 } }
  })
  ```
- Add `@@unique([userId, bucket])` constraint (already in schema)
- Return 429 if quota exceeded, roll back on failure

---

#### R5: Session Expiry UX 🟡 **MEDIUM**
**Risk**: User's session expires mid-task, losing unsaved work

**Validation**:
- Let session expire (30 days), try to use AI feature
- Manually clear auth cookie, trigger API call
- Test deep link after logout: `/courses/xyz/files/abc`

**Mitigation**:
- Middleware redirects to `/login?redirect=/original/path`
- Save redirect URL in sessionStorage
- Auto-redirect after login
- Show clear "Session expired" message

---

#### R6: File Upload Failures 🟡 **MEDIUM**
**Risk**: Upload fails mid-way (network, server error, timeout)

**Validation**:
- Simulate network disconnect during upload (DevTools throttle)
- Upload 20MB file on slow connection
- Test 10 concurrent uploads

**Mitigation**:
- Show upload progress bar
- Retry failed chunks (if using multipart upload)
- Clean up orphaned files in Supabase Storage (cron job)
- Clear error messages with retry button

---

#### R7: Markdown/LaTeX Rendering 🟢 **LOW**
**Risk**: AI generates invalid Markdown or LaTeX, breaking renderer

**Validation**:
- Test with edge cases: nested lists, tables, inline math, block math
- Inject malformed LaTeX: `$\frac{1}{0$` (unclosed)
- Test long equations (> 1000 chars)

**Mitigation**:
- Wrap `MarkdownRenderer` in ErrorBoundary
- Add KaTeX error handler (`throwOnError: false`)
- Sanitize AI output (reject HTML tags, script injection)

---

#### R8: Supabase Storage Quota 🟡 **MEDIUM**
**Risk**: Supabase free tier has 1GB storage limit

**Validation**:
- Calculate: 6 courses × 10 files × 5MB avg = 300MB per user
- Free tier limit: 1GB total = ~3 users with full storage
- Monitor Supabase dashboard for storage usage

**Mitigation**:
- PDF deduplication (hash-based) to reduce storage
- Compress PDFs on upload (optional, may lose quality)
- Set max file size: 50MB per PDF
- Plan to upgrade to Pro tier ($25/mo = 100GB)

---

#### R9: Streaming Timeout Handling 🟡 **MEDIUM**
**Risk**: OpenAI streaming hangs, user waits indefinitely

**Validation**:
- Mock slow OpenAI response (delay first token by 10s)
- Test network disconnect during streaming
- Measure time to first token (target < 2s, fail at > 5s)

**Mitigation**:
- 30s total timeout for AI requests
- 5s timeout for first token (show "AI is thinking..." after 2s)
- Allow user to cancel request (abort controller)
- Don't deduct quota if no tokens received

---

#### R10: Cross-Browser PDF Rendering 🟢 **LOW**
**Risk**: react-pdf behaves differently across browsers

**Validation**:
- Test on Chrome, Firefox, Safari, Edge
- Test on Windows, macOS, Linux
- Check PDF.js worker loading

**Mitigation**:
- Use latest `pdfjs-dist` (3.11.174) with known bug fixes
- Bundle PDF.js worker correctly (see `lib/pdf/worker.ts`)
- Add browser detection for known issues (Safari canvas rendering)

---

### Validation Checklist

**Pre-Launch**:
- [ ] Test all P1-P5 pages in Chrome, Firefox, Safari
- [ ] **E2E smoke tests pass** (Playwright): Register → Upload PDF → Explain → Q&A
- [ ] Load test: 10 concurrent users, 50 requests/min
- [ ] Security audit: SQL injection, XSS, CSRF checks
- [ ] **RLS verification**: Test cross-user data access blocked (different auth tokens)
- [ ] Quota enforcement: Verify 429 responses at limits
- [ ] Email delivery: Test verification, resend rate limiting
- [ ] PDF uploads: Test 10 file types, edge cases (0 pages, 1000 pages, scanned)
- [ ] AI streaming: First token < 2s, full response < 10s
- [ ] **Sentry error capture**: Trigger test error, verify in Sentry dashboard
- [ ] Session expiry: Graceful logout, redirect preservation
- [ ] Mobile responsive: Test on 375px width (iPhone SE)
- [ ] Accessibility: Keyboard nav, screen reader labels
- [ ] **Token cost tracking**: Verify dashboard shows accurate token counts and costs

**Post-Launch Monitoring**:
- [ ] **Sentry alerts** configured for critical errors (5xx, auth failures, quota exceeded)
- [ ] Set up Vercel log alerts for 5xx errors
- [ ] Monitor Supabase dashboard for DB connection pool exhaustion
- [ ] Track OpenAI API costs daily (set budget alert, compare with dashboard projection)
- [ ] Monitor quota reset cron job (should run daily at 00:00 UTC)
- [ ] **E2E test suite** passes on every deploy to staging/prod
- [ ] Check user feedback for common pain points

---

## IMPLEMENTATION ORDER

### Phase 1: Foundation (Week 1)
- M1: Project setup
- M2: Authentication (P1/P2)

### Phase 2: Core Features (Week 2-3)
- M3: Course management (P3/P4)
- M4: PDF reader (P5 left panel)

### Phase 3: AI Learning (Week 4-5)
- M5: AI stickers (P5 middle panel)
- M6: Q&A & summaries (P5 right panel)

### Phase 4: Polish & Monitoring (Week 6)
- M7: Course outline (P6) [Optional]
- M8: Usage & token tracking dashboard (P7) [Required per D7]
- Test suite: API unit tests + E2E smoke tests
- Sentry integration and error monitoring setup
- Bug fixes, performance optimization
- User testing & feedback

---

## SUCCESS CRITERIA

**MVP Launch Ready**:
1. All P1-P5 pages functional and tested
2. Core user flow works: Register → Upload PDF → AI Explain → Q&A
3. Quota enforcement active (no runaway costs)
4. Performance targets met (LCP < 3s, AI < 5s TTFB)
5. Zero critical security issues
6. Email verification works reliably
7. PDF uploads handle common edge cases
8. Responsive design works on desktop (mobile best-effort)

**Post-MVP Goals**:
- Custom SMTP for emails (Resend/SendGrid)
- Advanced token analytics (cost breakdown by user, trend analysis)
- Local Supabase development environment (Docker)
- Advanced rate limiting (per-route, adaptive)
- OCR for scanned PDFs (Tesseract.js integration)
- Mobile-first optimization and native app consideration
- Real-time collaboration features
- Advanced PDF annotations and highlights

---

## APPENDIX A: Environment Variables

```bash
# === Supabase (Environment-specific projects) ===
# Development
NEXT_PUBLIC_SUPABASE_URL=https://xxx-dev.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# Staging (use .env.staging)
# NEXT_PUBLIC_SUPABASE_URL=https://xxx-staging.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
# SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# Production (use .env.production)
# NEXT_PUBLIC_SUPABASE_URL=https://xxx-prod.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
# SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# === OpenAI ===
OPENAI_API_KEY=sk-proj-...
OPENAI_ORG_ID=org-...  # Optional

# === Vercel KV (Redis for rate limiting) ===
KV_URL=redis://...
KV_REST_API_URL=https://...
KV_REST_API_TOKEN=...
KV_REST_API_READ_ONLY_TOKEN=...

# === Sentry (Error Monitoring) ===
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_AUTH_TOKEN=xxx  # For source map uploads
SENTRY_ORG=your-org
SENTRY_PROJECT=studentaid
NEXT_PUBLIC_SENTRY_ENVIRONMENT=development  # or staging/production

# === Quota Configuration ===
COURSE_LIMIT=6
AI_LEARNING_LIMIT=150
AI_DOC_SUMMARY_LIMIT=100
AI_SECTION_SUMMARY_LIMIT=65
AI_COURSE_SUMMARY_LIMIT=15
AUTO_EXPLAIN_MONTHLY=300

# === Feature Flags ===
ENABLE_AUTO_EXPLAIN=true
ENABLE_STREAMING=true
ENABLE_PDF_DEDUP=true

# === Monitoring ===
VERCEL_ANALYTICS_ID=...  # Built-in Vercel analytics

# === Build Info ===
NEXT_PUBLIC_BUILD_VERSION=0.1.0-mvp
```

---

## APPENDIX B: Key Dependencies Summary

| Category | Package | Version | Purpose |
|----------|---------|---------|---------|
| **Framework** | next | ^14.2.0 | App Router, SSR, API routes |
| | react | ^18.3.0 | UI library |
| | typescript | ^5.3.0 | Type safety |
| **Database** | @supabase/supabase-js | ^2.39.0 | Supabase SDK (query builder) |
| | @supabase/ssr | ^0.1.0 | Server-side auth |
| **AI** | openai | ^4.28.0 | OpenAI API |
| **PDF** | react-pdf | ^7.7.0 | PDF rendering |
| | pdfjs-dist | ^3.11.174 | PDF.js library |
| | pdf-parse | ^1.1.1 | Server-side extraction |
| | pdf-lib | ^1.17.1 | PDF manipulation |
| **Markdown** | react-markdown | ^9.0.1 | Markdown rendering |
| | remark-math | ^6.0.0 | Math plugin |
| | rehype-katex | ^7.0.0 | LaTeX rendering |
| | katex | ^0.16.9 | Math typesetting |
| **UI** | tailwindcss | ^3.4.0 | Styling |
| | react-resizable-panels | ^2.0.0 | Resizable layout |
| | react-window | ^1.8.10 | Virtual scrolling |
| | @tanstack/react-query | ^5.28.0 | Server state |
| **Monitoring** | @sentry/nextjs | ^7.99.0 | Error tracking (server-side) |
| **Testing** | vitest | ^1.2.0 | API route unit tests |
| | @playwright/test | ^1.40.0 | E2E smoke tests |
| **Infra** | @vercel/kv | ^1.0.1 | Rate limiting |
| | zod | ^3.22.4 | Schema validation |

---

## NEXT STEPS

1. **User Confirmation**: ✅ All architecture decisions confirmed
2. **Repository Setup**: Initialize Next.js project with dependencies
3. **Supabase Setup**: Create 3 projects (dev/staging/prod), configure Auth/Storage
4. **Database Migration**: Run SQL migration `001_initial_schema.sql` via Supabase CLI
5. **Sentry Setup**: Create Sentry project, configure DSN and source maps
6. **Start Implementation**: Begin with M1 (Project Setup)

---

**Plan Status**: ✅ Ready for Execution
**Estimated MVP Timeline**: 4-6 weeks (1 developer, full-time)
**Post-MVP Enhancements**: 2-4 weeks

---

*This plan synthesizes all requirements from the four source-of-truth documents. Any deviations during implementation should be documented and approved.*
