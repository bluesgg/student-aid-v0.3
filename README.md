# StudentAid Web (MVP)

AI-powered learning platform for managing course materials and studying with intelligent PDF explanations, Q&A, and exam prep outlines.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS
- **State Management**: TanStack Query (React Query)
- **UI Primitives**: Radix UI
- **Package Manager**: pnpm (required)
- **BaaS**: Supabase (Auth + Postgres + Storage) - server-side only
- **AI**: OpenAI API - server-side only

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 9+

### Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Available Scripts

```bash
pnpm dev      # Start development server
pnpm build    # Build for production
pnpm start    # Start production server
pnpm lint     # Run ESLint
```

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (public)/           # Public routes (login, register)
│   │   ├── login/
│   │   └── register/
│   ├── (app)/              # Protected app routes
│   │   ├── courses/
│   │   │   ├── [courseId]/
│   │   │   │   ├── files/[fileId]/   # P5: PDF Reader
│   │   │   │   └── outline/          # P6: Course Outline
│   │   │   └── page.tsx              # P3: Course List
│   │   └── account/
│   │       └── usage/                # P7: Usage & Quotas
│   ├── api/                # API Route Handlers (BFF)
│   ├── layout.tsx          # Root layout
│   └── providers.tsx       # Client providers
├── components/
│   ├── ui/                 # Base UI components (Button, Input, Dialog, etc.)
│   ├── page-shell.tsx      # Page layout wrapper
│   ├── empty-state.tsx     # Empty state component
│   └── error-state.tsx     # Error state component
├── features/               # Feature modules (to be added)
│   ├── auth/
│   ├── courses/
│   ├── files/
│   ├── reader/
│   ├── ai/
│   └── usage/
├── lib/
│   ├── api-client.ts       # API client with unified error handling
│   ├── query-client.ts     # TanStack Query configuration
│   └── utils.ts            # Utility functions
├── types/
│   └── api.ts              # API response types and error codes
└── config/                 # Configuration (to be added)
```

## Routes

| Page | Route | Description |
|------|-------|-------------|
| P1 | `/login` | User login |
| P2 | `/register` | User registration |
| P3 | `/courses` | Course list (My Courses) |
| P4 | `/courses/[courseId]` | Course detail & file management |
| P5 | `/courses/[courseId]/files/[fileId]` | PDF reader with AI panel |
| P6 | `/courses/[courseId]/outline` | Course-level study outline |
| P7 | `/account/usage` | Usage quotas & statistics |

## Environment Variables

Create a `.env.local` file with the following variables:

```env
# Supabase (required for Milestone 1+)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenAI (required for Milestone 5+)
OPENAI_API_KEY=your_openai_api_key
```

> **Note**: These are placeholder values. Actual Supabase and OpenAI integration will be implemented in later milestones.

## Development Guidelines

### Code Style

- Use TypeScript strict mode
- Follow kebab-case for file names (`course-card.tsx`)
- Use PascalCase for components and types
- Use camelCase for functions and variables
- Prefix hooks with `use` (`useCourseList`)

### Key Constraints

1. **No client-side BaaS calls**: All Supabase/OpenAI calls must be in Route Handlers
2. **Unified API responses**: All `/api/*` endpoints return `{ ok: true, data }` or `{ ok: false, error: { code, message } }`
3. **Loading/Empty/Error states**: Every page must handle all three states
4. **pnpm only**: Do not use npm or yarn

### Reference Documents

- [`docs/01_light_prd.md`](docs/01_light_prd.md) - Product requirements
- [`docs/02_page_and_flow_design.md`](docs/02_page_and_flow_design.md) - Page & flow design
- [`docs/03_api_design.md`](docs/03_api_design.md) - API specifications
- [`docs/04_tech_and_code_style.md`](docs/04_tech_and_code_style.md) - Technical guidelines

## Milestone Progress

- [x] **Milestone 0**: Scaffold & baseline UX (current)
- [ ] **Milestone 1**: Auth (Supabase)
- [ ] **Milestone 2**: Courses CRUD
- [ ] **Milestone 3**: Files upload/list
- [ ] **Milestone 4**: PDF reader
- [ ] **Milestone 5**: Stickers & AI explain
- [ ] **Milestone 6**: Q&A & Summaries
- [ ] **Milestone 7**: Quotas & Usage

## License

Private - All rights reserved

