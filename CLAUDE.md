# Role
# CLAUDE.md — Project Memory (StudentAid Web MVP)

You are the full-stack engineer for this repo. Build the MVP strictly based on the four docs below. Do not invent requirements.

## Source of Truth (must follow)
- /docs/01_light_prd.md
- /docs/02_page_and_flow_design.md
- /docs/03_api_design.md
- /docs/04_tech_and_code_style.md

If docs conflict or something is unclear: stop that part, explain the conflict, propose 2–3 options, add TODOs, continue only on unblocked work.

## Non-negotiable Architecture
- Next.js App Router + TypeScript + Tailwind + pnpm
- TanStack Query for server state
- BFF only: all business APIs are Next.js Route Handlers under /app/api/**
- Client must NOT call BaaS/LLM SDKs directly; client calls only /api/**
- Supabase/Auth/Storage usage is server-side only
- Session uses httpOnly cookies; registration may require email confirmation (follow /docs/03)

## MVP Pages (implement in this order, per /docs/02)
P1 Login → P2 Register/Email confirm → P3 Courses → P4 Course materials (PDF upload/list) → P5 Study page (PDF viewer + AI: explain page/selection, stickers + follow-ups, Q&A, summaries)

## Working Rules
For any task:
1) Read relevant doc sections + existing code
2) Output a short PLAN: scope, acceptance criteria, file list
3) Implement in small diffs
4) After each diff run: pnpm lint + pnpm typecheck (and tests if present)
5) Output: CHANGELOG + REGRESSION CHECKLIST

## Quality & Security
- Validate inputs on server; consistent error JSON per /docs/03
- No secrets in code; use env vars
- Add loading/empty/error states for every page/action
- Avoid new dependencies unless necessary for MVP


<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->