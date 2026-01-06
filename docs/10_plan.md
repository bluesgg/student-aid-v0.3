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
- ORM: Prisma (type-safe, migrations)
- Rate Limiting: Vercel KV (Redis)
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
- Set up Supabase project (Auth + Database + Storage)
- Configure Prisma with Supabase connection
- Set up environment variables
- Initialize Vercel KV for rate limiting

**Acceptance Criteria**:
- [ ] `pnpm dev` starts dev server successfully
- [ ] `pnpm lint` and `pnpm typecheck` pass
- [ ] Supabase project created with database accessible
- [ ] Prisma schema synced with Supabase
- [ ] Environment variables documented in `.env.example`

**Files to Create**:
```
/
├── package.json (with all dependencies)
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
├── .env.example
├── .env.local (not committed)
├── prisma/
│   └── schema.prisma
└── src/
    ├── app/layout.tsx
    ├── app/page.tsx (redirect to /courses or /login)
    └── lib/
        ├── supabase/
        │   └── server.ts (createClient helper)
        └── prisma.ts (singleton client)
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
    "@prisma/client": "^5.9.0",
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
    "prisma": "^5.9.0",
    "@types/node": "^20.11.0",
    "@types/react": "^18.3.0",
    "tailwindcss": "^3.4.0",
    "eslint": "^8.56.0",
    "eslint-config-next": "^14.2.0"
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

**Database Schema Changes** (Prisma):
```prisma
model Course {
  id           String   @id @default(uuid())
  userId       String
  name         String
  school       String
  term         String
  fileCount    Int      @default(0)
  lastVisitedAt DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  files        File[]

  @@unique([userId, name])
  @@index([userId])
}

model File {
  id              String   @id @default(uuid())
  courseId        String
  userId          String
  name            String
  type            FileType
  pageCount       Int
  isScanned       Boolean  @default(false)
  pdfContentHash  String?  @db.VarChar(64)
  storageKey      String   // Supabase Storage path
  lastReadPage    Int      @default(1)
  uploadedAt      DateTime @default(now())

  course          Course   @relation(fields: [courseId], references: [id], onDelete: Cascade)
  stickers        Sticker[]
  summaries       Summary[]

  @@unique([courseId, name])
  @@index([userId, pdfContentHash]) // For dedup lookup
  @@index([courseId])
}

enum FileType {
  Lecture
  Homework
  Exam
  Other
}
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

**Database Schema Changes** (Prisma):
```prisma
model Sticker {
  id              String   @id @default(uuid())
  userId          String
  courseId        String
  fileId          String
  type            StickerType
  page            Int
  anchorText      String   @db.Text
  anchorRect      Json?    // { x, y, width, height }
  parentId        String?
  contentMarkdown String   @db.Text
  folded          Boolean  @default(false)
  depth           Int      @default(0)
  createdAt       DateTime @default(now())

  file            File     @relation(fields: [fileId], references: [id], onDelete: Cascade)
  parent          Sticker? @relation("StickerThread", fields: [parentId], references: [id], onDelete: Cascade)
  children        Sticker[] @relation("StickerThread")

  @@index([fileId, page])
  @@index([userId])
}

enum StickerType {
  auto
  manual
}

model Quota {
  id          String   @id @default(uuid())
  userId      String
  bucket      QuotaBucket
  used        Int      @default(0)
  limit       Int
  resetAt     DateTime
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([userId, bucket])
  @@index([userId])
}

enum QuotaBucket {
  learningInteractions
  documentSummary
  sectionSummary
  courseSummary
  autoExplain
}
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

**Database Schema Changes** (Prisma):
```prisma
model QaInteraction {
  id              String   @id @default(uuid())
  userId          String
  courseId        String
  fileId          String
  question        String   @db.Text
  answerMarkdown  String   @db.Text
  references      Json     // [{ page: 3, snippet: "..." }]
  createdAt       DateTime @default(now())

  @@index([fileId])
  @@index([userId])
}

model Summary {
  id              String      @id @default(uuid())
  userId          String
  courseId        String
  fileId          String?
  type            SummaryType
  pageRangeStart  Int?
  pageRangeEnd    Int?
  contentMarkdown String      @db.Text
  createdAt       DateTime    @default(now())

  file            File?       @relation(fields: [fileId], references: [id], onDelete: Cascade)

  @@index([fileId, type])
  @@index([userId])
}

enum SummaryType {
  document
  section
  course
}
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

### M8: Usage Dashboard (P7) [OPTIONAL]
**Goal**: Display quota usage and limits

**Reference Docs**:
- PRD §3.1 (quota definitions)
- Page Design §7 (P7)
- API Design §4 (quota endpoint)

**Scope**:
- P7 usage page
- Display all quota buckets with progress bars
- Show reset date (based on user registration anniversary)
- Color-coded warnings (green < 70%, yellow 70-90%, red > 90%)

**Acceptance Criteria**:
- [ ] Shows all quota buckets with used/limit
- [ ] Progress bars color-coded by usage percentage
- [ ] Displays next reset date in user's timezone
- [ ] Explains account-wide quota sharing
- [ ] Links to P7 from P4 quota preview

**Files to Create/Modify**:
```
src/
├── app/
│   └── (app)/
│       └── account/
│           └── usage/
│               └── page.tsx
└── features/
    └── usage/
        ├── components/
        │   ├── quota-overview.tsx
        │   ├── quota-progress-bar.tsx
        │   └── reset-date-display.tsx
        └── hooks/
            └── use-quota-overview.ts
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

### Complete Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ==================== AUTH ====================
// Users managed by Supabase Auth (auth.users)
// Reference by userId (String UUID)

// ==================== COURSES ====================

model Course {
  id            String    @id @default(uuid())
  userId        String
  name          String
  school        String
  term          String
  fileCount     Int       @default(0)
  lastVisitedAt DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  files         File[]

  @@unique([userId, name])
  @@index([userId])
  @@map("courses")
}

// ==================== FILES ====================

model File {
  id              String   @id @default(uuid())
  courseId        String
  userId          String
  name            String
  type            FileType
  pageCount       Int
  isScanned       Boolean  @default(false)
  pdfContentHash  String?  @db.VarChar(64)
  storageKey      String   // Supabase Storage path
  lastReadPage    Int      @default(1)
  uploadedAt      DateTime @default(now())
  updatedAt       DateTime @updatedAt

  course          Course    @relation(fields: [courseId], references: [id], onDelete: Cascade)
  stickers        Sticker[]
  summaries       Summary[]
  qaInteractions  QaInteraction[]

  @@unique([courseId, name])
  @@index([userId, pdfContentHash])
  @@index([courseId])
  @@map("files")
}

enum FileType {
  Lecture
  Homework
  Exam
  Other
}

// ==================== AI LEARNING DATA ====================

model Sticker {
  id              String      @id @default(uuid())
  userId          String
  courseId        String
  fileId          String
  type            StickerType
  page            Int
  anchorText      String      @db.Text
  anchorRect      Json?       // { x, y, width, height }
  parentId        String?
  contentMarkdown String      @db.Text
  folded          Boolean     @default(false)
  depth           Int         @default(0)
  createdAt       DateTime    @default(now())

  file            File        @relation(fields: [fileId], references: [id], onDelete: Cascade)
  parent          Sticker?    @relation("StickerThread", fields: [parentId], references: [id], onDelete: Cascade)
  children        Sticker[]   @relation("StickerThread")

  @@index([fileId, page, type])
  @@index([userId])
  @@map("stickers")
}

enum StickerType {
  auto
  manual
}

model QaInteraction {
  id              String   @id @default(uuid())
  userId          String
  courseId        String
  fileId          String
  question        String   @db.Text
  answerMarkdown  String   @db.Text
  references      Json     // [{ page: 3, snippet: "..." }]
  createdAt       DateTime @default(now())

  file            File     @relation(fields: [fileId], references: [id], onDelete: Cascade)

  @@index([fileId])
  @@index([userId])
  @@map("qa_interactions")
}

model Summary {
  id              String      @id @default(uuid())
  userId          String
  courseId        String
  fileId          String?
  type            SummaryType
  pageRangeStart  Int?
  pageRangeEnd    Int?
  contentMarkdown String      @db.Text
  createdAt       DateTime    @default(now())

  file            File?       @relation(fields: [fileId], references: [id], onDelete: Cascade)

  @@index([fileId, type])
  @@index([userId])
  @@index([courseId, type])
  @@map("summaries")
}

enum SummaryType {
  document
  section
  course
}

// ==================== QUOTAS ====================

model Quota {
  id          String      @id @default(uuid())
  userId      String
  bucket      QuotaBucket
  used        Int         @default(0)
  limit       Int
  resetAt     DateTime
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  @@unique([userId, bucket])
  @@index([userId])
  @@index([resetAt])
  @@map("quotas")
}

enum QuotaBucket {
  learningInteractions
  documentSummary
  sectionSummary
  courseSummary
  autoExplain
}

// ==================== OPTIONAL: MONITORING & AUDIT ====================
// (Implement in P1 if monitoring is required, otherwise defer)

model AuditLog {
  id          String   @id @default(uuid())
  userId      String?
  eventType   String   @db.VarChar(50)
  ipPrefix    String?  @db.VarChar(20)
  userAgent   String?  @db.VarChar(255)
  requestId   String?  @db.VarChar(50)
  metadata    Json?
  createdAt   DateTime @default(now())

  @@index([userId])
  @@index([createdAt])
  @@map("audit_logs")
}

model AiUsageLog {
  id              String   @id @default(uuid())
  requestId       String?  @db.VarChar(50)
  userId          String?
  courseId        String?
  fileId          String?
  operationType   String   @db.VarChar(50)
  model           String   @db.VarChar(50)
  inputTokens     Int
  outputTokens    Int
  costUsdApprox   Decimal  @db.Decimal(10, 6)
  latencyMs       Int
  success         Boolean
  errorCode       String?  @db.VarChar(50)
  createdAt       DateTime @default(now())

  @@index([userId])
  @@index([createdAt])
  @@map("ai_usage_logs")
}
```

### Access Control Principles

**Row-Level Security (RLS)** via Prisma middleware or Supabase RLS policies:

1. **Courses**: User can only access their own courses (`userId = auth.userId`)
2. **Files**: User can only access files in their courses
3. **Stickers/QA/Summaries**: User can only access their own learning data
4. **Quotas**: User can only read/write their own quota records

**Implementation Options**:
- **Option A** (Recommended): Prisma middleware to inject `where: { userId }` filters
- **Option B**: Supabase RLS policies (requires Supabase service role key)
- **Option C**: Manual checks in every API route (least DRY)

**Cascade Deletes**:
- Delete course → delete all files → delete all stickers/QA/summaries
- Delete file → delete all stickers/QA/summaries for that file
- Configured via Prisma `onDelete: Cascade`

---

## FILE TREE (Proposed)

```
student-aid/
├── .env.example
├── .env.local (not committed)
├── .eslintrc.json
├── .gitignore
├── next.config.js
├── package.json
├── pnpm-lock.yaml
├── postcss.config.js
├── tailwind.config.js
├── tsconfig.json
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│       └── (auto-generated)
├── public/
│   └── (static assets)
├── docs/
│   ├── 01_light_prd.md
│   ├── 02_page_and_flow_design.md
│   ├── 03_api_design.md
│   ├── 04_tech_and_code_style.md
│   └── 10_plan.md (this file)
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
    │       └── quotas/
    │           └── route.ts
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
    │   │   │   └── reset-date-display.tsx
    │   │   ├── hooks/
    │   │   │   └── use-quota-overview.ts
    │   │   └── api.ts
    │   └── layout/
    │       ├── components/
    │       │   ├── resizable-layout.tsx
    │       │   └── layout-provider.tsx
    │       └── hooks/
    │           └── use-layout-preferences.ts
    ├── lib/
    │   ├── supabase/
    │   │   └── server.ts (createClient helper)
    │   ├── openai/
    │   │   ├── client.ts
    │   │   ├── streaming.ts
    │   │   ├── prompts/
    │   │   │   ├── explain-page.ts
    │   │   │   ├── explain-selection.ts
    │   │   │   ├── qa.ts
    │   │   │   └── summarize.ts
    │   │   └── cost-tracker.ts (optional, for monitoring)
    │   ├── pdf/
    │   │   ├── detect-scanned.ts
    │   │   ├── hash.ts
    │   │   └── worker.ts
    │   ├── quota/
    │   │   ├── check.ts
    │   │   ├── deduct.ts
    │   │   └── reset.ts (cron job helper)
    │   ├── storage.ts (Supabase Storage helpers)
    │   ├── rate-limit.ts (Vercel KV wrapper)
    │   ├── api-client.ts (fetch wrapper)
    │   ├── prisma.ts (singleton client)
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

## DECISIONS NEEDED

### ✅ Confirmed Decisions (from user input):
1. **ORM**: Prisma (type-safe, excellent DX)
2. **Rate Limiting**: Vercel KV (Redis)
3. **Resizable Layout**: react-resizable-panels
4. **PDF Deduplication**: Yes, implement in MVP

### 🔴 Remaining Critical Decisions:

#### D1: Email Configuration
**Question**: Use Supabase built-in email templates or custom SMTP?

**Options**:
1. **Supabase Default (Recommended)**: Use Supabase's built-in email service
   - Pros: Zero config, works out of box, free tier included
   - Cons: Limited customization, Supabase branding

2. **Custom SMTP (Resend/SendGrid)**: Configure custom email provider
   - Pros: Full branding control, better deliverability
   - Cons: Extra setup, cost, need to handle templates

3. **Hybrid**: Supabase for auth emails, custom for transactional
   - Pros: Quick MVP start, can upgrade later
   - Cons: Two email systems to manage

**Recommendation**: Option 1 (Supabase Default) for MVP, migrate to Option 3 post-launch

---

#### D2: Quota Reset Strategy
**Question**: How to implement monthly quota reset based on user registration anniversary?

**Options**:
1. **Vercel Cron + Daily Check (Recommended)**:
   - Cron runs daily at 00:00 UTC
   - Queries users where `registration_day = today`
   - Resets their quotas
   - Pros: Simple, reliable, built into Vercel
   - Cons: Not instant (up to 24h delay)

2. **On-Demand Check**:
   - Check `resetAt` on every quota-consuming API call
   - Reset if expired
   - Pros: No cron needed, instant reset
   - Cons: Extra DB queries, race conditions possible

3. **Hybrid**:
   - Cron for bulk reset
   - On-demand as fallback
   - Pros: Best reliability
   - Cons: Most complexity

**Recommendation**: Option 1 (Vercel Cron) for MVP simplicity

---

#### D3: Streaming Implementation
**Question**: How to implement OpenAI streaming responses?

**Options**:
1. **Server-Sent Events (SSE) (Recommended)**:
   - Next.js Route Handler returns `ReadableStream`
   - Frontend uses `EventSource` or fetch with streaming
   - Pros: Standard, built-in Next.js support, resumable
   - Cons: Slightly more complex than polling

2. **WebSocket**:
   - Use Socket.IO or native WebSocket
   - Pros: Bidirectional, low latency
   - Cons: Complex setup, doesn't fit serverless model well

3. **Long Polling**:
   - Poll API every 500ms for updates
   - Pros: Simplest implementation
   - Cons: High latency, inefficient

**Recommendation**: Option 1 (SSE) - well-supported in Next.js 14 App Router

---

#### D4: Development Environment
**Question**: Local Supabase or cloud-only?

**Options**:
1. **Cloud-Only (Recommended for MVP)**:
   - Single Supabase project for dev/staging/prod
   - Use environment variables to distinguish
   - Pros: Zero Docker setup, consistent environment
   - Cons: Shared database (use namespacing)

2. **Local Supabase (Docker)**:
   - Run Supabase locally via `supabase start`
   - Pros: Isolated dev environment, no cloud quota limits
   - Cons: Docker setup complexity, migration sync issues

3. **Hybrid**:
   - Local DB + cloud Auth/Storage
   - Pros: Best of both
   - Cons: Most complex

**Recommendation**: Option 1 (Cloud-Only) for MVP, add Docker for post-MVP

---

#### D5: Error Monitoring
**Question**: Add error tracking (Sentry/Bugsnag) in MVP?

**Options**:
1. **No - Console Logs Only (Recommended for MVP)**:
   - Use `console.error()` and Vercel logs
   - Pros: Zero setup
   - Cons: Manual log inspection

2. **Yes - Sentry**:
   - Add Sentry SDK
   - Pros: Error aggregation, stack traces, alerts
   - Cons: Extra config, potential cost

3. **Vercel Analytics**:
   - Use built-in Vercel error tracking
   - Pros: Native integration
   - Cons: Limited features vs. Sentry

**Recommendation**: Option 1 for MVP, add Sentry in post-MVP

---

#### D6: Testing Strategy
**Question**: What testing approach for MVP?

**Options**:
1. **Manual Testing Only (Fastest MVP)**:
   - No automated tests initially
   - Manual QA before each deploy
   - Pros: Zero test setup time
   - Cons: Regression risk

2. **API Route Tests Only (Recommended)**:
   - Unit tests for API routes with Vitest
   - Mock Prisma/Supabase/OpenAI
   - Pros: Catches critical bugs, fast tests
   - Cons: Some setup time

3. **Full E2E (Playwright)**:
   - End-to-end tests for critical flows
   - Pros: Highest confidence
   - Cons: Slow, flaky, high maintenance

**Recommendation**: Option 2 (API tests only) - protect core logic without slowing MVP

---

#### D7: OpenAI Token Tracking
**Question**: Implement detailed token usage tracking?

**Options**:
1. **No Tracking (Simplest MVP)**:
   - Just deduct quota, ignore token counts
   - Pros: Minimal code
   - Cons: No cost visibility

2. **Log Only (Recommended)**:
   - Write token counts to `ai_usage_logs` table
   - No real-time dashboard
   - Pros: Data for future analysis, low overhead
   - Cons: Can't see costs in real-time

3. **Real-Time Dashboard**:
   - Track tokens + costs, show in P7
   - Pros: Full cost visibility
   - Cons: Extra complexity, not user-facing

**Recommendation**: Option 2 (Log Only) - gather data without UI overhead

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
- [ ] Load test: 10 concurrent users, 50 requests/min
- [ ] Security audit: SQL injection, XSS, CSRF checks
- [ ] Quota enforcement: Verify 429 responses at limits
- [ ] Email delivery: Test verification, resend rate limiting
- [ ] PDF uploads: Test 10 file types, edge cases (0 pages, 1000 pages, scanned)
- [ ] AI streaming: First token < 2s, full response < 10s
- [ ] Session expiry: Graceful logout, redirect preservation
- [ ] Mobile responsive: Test on 375px width (iPhone SE)
- [ ] Accessibility: Keyboard nav, screen reader labels

**Post-Launch Monitoring**:
- [ ] Set up Vercel log alerts for 5xx errors
- [ ] Monitor Supabase dashboard for DB connection pool exhaustion
- [ ] Track OpenAI API costs daily (set budget alert)
- [ ] Monitor quota reset cron job (should run daily)
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

### Phase 4: Polish (Week 6)
- M7: Course outline (P6) [Optional]
- M8: Usage dashboard (P7) [Optional]
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
- P6/P7 optional features
- E2E testing with Playwright
- Error monitoring with Sentry
- Local Supabase development
- Advanced rate limiting (per-route, adaptive)
- OCR for scanned PDFs
- Mobile optimization

---

## APPENDIX A: Environment Variables

```bash
# === Supabase ===
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# === Database (Supabase Postgres) ===
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres

# === OpenAI ===
OPENAI_API_KEY=sk-proj-...
OPENAI_ORG_ID=org-...  # Optional

# === Vercel KV (Redis for rate limiting) ===
KV_URL=redis://...
KV_REST_API_URL=https://...
KV_REST_API_TOKEN=...
KV_REST_API_READ_ONLY_TOKEN=...

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

# === Monitoring (Optional) ===
SENTRY_DSN=https://...  # Post-MVP
VERCEL_ANALYTICS_ID=...  # Built-in

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
| **Database** | @prisma/client | ^5.9.0 | ORM |
| | @supabase/supabase-js | ^2.39.0 | Supabase SDK |
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
| **Infra** | @vercel/kv | ^1.0.1 | Rate limiting |
| | zod | ^3.22.4 | Schema validation |

---

## NEXT STEPS

1. **User Confirmation**: Review this plan, confirm all decisions
2. **Repository Setup**: Initialize Next.js project with dependencies
3. **Supabase Setup**: Create project, configure Auth/Storage
4. **Prisma Migration**: Run `prisma migrate dev` to create schema
5. **Start Implementation**: Begin with M1 (Project Setup)

---

**Plan Status**: ✅ Ready for Execution
**Estimated MVP Timeline**: 4-6 weeks (1 developer, full-time)
**Post-MVP Enhancements**: 2-4 weeks

---

*This plan synthesizes all requirements from the four source-of-truth documents. Any deviations during implementation should be documented and approved.*
