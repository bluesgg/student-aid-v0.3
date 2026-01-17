# Change: Add Settings Page with Language & Usage

## Why
1. Users need to configure UI language and AI explanation language independently for optimal learning experience
2. Usage statistics are currently in a separate page but logically belong with other settings
3. A unified Settings page provides a better UX for managing user preferences

## What Changes
- Create new `/settings` page with Tab layout (Language | Usage)
- Move Usage page content into Settings as a tab
- Add user preferences table with `ui_locale` and `explain_locale` fields
- Add first-login language selection modal for new users
- Implement full-site i18n using `next-intl` for UI text
- Pass `explain_locale` to all AI API calls to control output language
- Update header navigation: replace "Usage" link with "Settings"
- Page refresh on language change (no client-side hot-swap)

## Impact
- New spec: `settings` (renamed from `language-settings`)
- Affected code:
  - Database: New migration for `user_preferences` table
  - Components: `app-header.tsx` (change Usage to Settings link)
  - New: `src/app/(app)/settings/page.tsx` with tab layout
  - Move: Usage components integrated into Settings page
  - API: All AI routes need to accept/use `explain_locale`
  - Layout: Root layout needs `next-intl` provider
  - All pages: UI text extracted to translation files
  - Remove: `/app/(app)/usage/page.tsx` (content moved to Settings)

## Constraints
- Languages supported: English (en), Chinese (zh) only
- Default: English for both UI and explanation
- Skip modal = use defaults, never show again
- Refresh-based switching (simpler, MVP-appropriate)

## Non-Goals (Out of Scope)
- Languages beyond English/Chinese
- Guest user language preferences
- Real-time language switching without refresh
- Translating existing AI-generated content (stickers, Q&A history)
- Account management (email/password change) - future iteration
