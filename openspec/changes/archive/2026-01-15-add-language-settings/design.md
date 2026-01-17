# Design: Settings Page with Language & Usage

## Context
The current MVP has Usage as a standalone page and no internationalization. All UI text is hardcoded in English. Users cannot configure AI explanation language. This change:
1. Creates a unified Settings page with tab navigation
2. Moves Usage into Settings as a tab
3. Adds language configuration (UI + AI explanation)

## Goals
- Unified Settings page with tab layout (Language | Usage)
- Enable users to set UI language (en/zh) and explanation language (en/zh) independently
- Prompt new users to select language on first login
- Reuse existing Usage components without modification
- All UI text must be translatable

## Non-Goals
- Supporting more than 2 languages
- Real-time language switching (refresh is acceptable)
- Translating existing stored content
- Account management features (email/password change)

## Decisions

### D1: Page Structure - Tab Layout
**Decision**: Use tab-based layout with Language and Usage tabs

**UI Structure**:
```
/settings page
├── Header (existing AppHeader)
├── Page Title: "Settings"
├── Tab Bar
│   ├── Tab: Language (default)
│   └── Tab: Usage
├── Tab Content Area
│   ├── [Language Tab] - Language selectors
│   └── [Usage Tab] - All existing usage components
└── Footer (if any)
```

**Rationale**:
- Clean separation of concerns
- Usage content is substantial; deserves its own tab
- Tab state can be managed via URL query param or local state

### D2: i18n Library - `next-intl`
**Decision**: Use `next-intl` for internationalization

**Rationale**:
- Native App Router support with Server Components
- Smaller bundle than react-i18next
- Active maintenance, strong Next.js ecosystem adoption
- Simple API: `useTranslations()` hook

**Alternatives considered**:
- `react-i18next`: Heavier, SSR complexity with App Router
- `next-translate`: Less active, fewer features
- Manual JSON + context: Too much boilerplate

### D3: Storage - Database over Cookies
**Decision**: Store preferences in `user_preferences` table, not cookies

**Rationale**:
- Persists across devices/browsers
- Can extend with more preferences later
- Server can read directly in RSC without client hydration
- Simpler than cookie management in middleware

**Schema**:
```sql
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ui_locale VARCHAR(5) DEFAULT 'en',
  explain_locale VARCHAR(5) DEFAULT 'en',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### D4: First-Login Detection
**Decision**: Check if `user_preferences` row exists for user

**Rationale**:
- No row = new user = show modal
- Row exists (even with defaults) = returning user = no modal
- Simple, no additional flags needed

### D5: Usage Tab Implementation
**Decision**: Reuse existing Usage components inside a tab wrapper

**Approach**:
```typescript
// src/components/settings/usage-tab.tsx
export function UsageTab() {
  const { data, isLoading, error, refetch } = useTokenStats()

  // Same rendering logic as current usage/page.tsx
  // But without AppHeader (already in parent)
  return (
    <div className="space-y-6">
      <EstimatedMonthlyCost {...props} />
      <TokenUsageChart {...props} />
      <CostBreakdown {...props} />
      <QuotaOverview {...props} />
    </div>
  )
}
```

**Rationale**:
- Zero changes to existing usage components
- Only extraction of content from page wrapper to tab component
- Maintains all existing functionality

### D6: Language Change Flow
**Decision**: Save via API + full page refresh

**Flow**:
1. User changes language in Settings > Language tab
2. User clicks Save
3. Client calls `PATCH /api/user/preferences`
4. API updates database
5. Client triggers `router.refresh()`
6. Page reloads with new locale from server

**Rationale**:
- Refresh is simpler and ensures all server components re-render
- Avoids complex client-side state synchronization

### D7: AI Prompt Injection
**Decision**: Add `explain_locale` to all AI prompts as system instruction

**Implementation**:
```typescript
// In AI route handlers
const locale = await getUserExplainLocale(userId)
const systemPrompt = locale === 'zh'
  ? `${basePrompt}\n\nIMPORTANT: Respond in Chinese (简体中文).`
  : basePrompt  // Default English
```

**Affected routes**:
- `/api/ai/explain-page`
- `/api/ai/explain-selection`
- `/api/ai/qa`
- `/api/ai/summary`

### D8: Header Navigation Change
**Decision**: Replace "Usage" link with "Settings"

**Before**:
```
[Logo] [Courses] [Usage] [Sign out]
```

**After**:
```
[Logo] [Courses] [Settings] [Sign out]
```

**Rationale**:
- Usage is now part of Settings
- Cleaner navigation with single settings entry point

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Translation effort | Medium | Start with core strings only (~100), expand incrementally |
| AI may ignore locale | Low | Strong prompt instruction + temperature control |
| Refresh causes UX friction | Low | Acceptable per user confirmation |
| Usage components tight coupling | Low | Components are already isolated, just wrapper extraction |

## File Structure

```
src/
├── i18n/
│   ├── request.ts        # next-intl config
│   └── messages/
│       ├── en.json       # English strings
│       └── zh.json       # Chinese strings
├── components/
│   ├── app-header.tsx    # Modified: Usage → Settings link
│   ├── language-modal.tsx # New: first-login modal
│   └── settings/
│       ├── language-settings-tab.tsx  # New: Language tab content
│       └── usage-tab.tsx              # New: Usage tab wrapper
├── app/(app)/
│   ├── settings/
│   │   └── page.tsx      # New: Settings page with tabs
│   ├── usage/
│   │   └── page.tsx      # Modified: redirect to /settings?tab=usage OR remove
│   └── api/user/
│       └── preferences/
│           └── route.ts  # New: GET/PATCH user preferences
├── features/usage/       # Unchanged: existing usage components
└── lib/
    └── user-preferences.ts # New: helper functions
```

## Migration Plan
1. Add database migration (can run anytime, no breaking changes)
2. Add i18n infrastructure (messages, provider)
3. Create Settings page with tabs
4. Create Language tab component
5. Create Usage tab component (extract from usage page)
6. Update header navigation
7. Add preferences API
8. Add first-login modal
9. Extract UI strings to translation files
10. Update AI routes to use explain_locale
11. Remove/redirect old usage page

All steps are additive; no breaking changes to existing functionality until step 11.

## Open Questions
None - all requirements clarified with PM.
