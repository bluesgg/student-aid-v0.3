# Design: Term Dropdown Selection

## Context
The current implementation uses a free-text input for term selection, which can lead to:
- Inconsistent formatting (e.g., "Spring 2025" vs "spring 25" vs "2025 Spring")
- Extra cognitive load on users to type the term manually
- No guidance on what format to use

## Goals / Non-Goals

### Goals
- Provide consistent term formatting across all courses
- Auto-select the current academic term to reduce friction
- Support common academic terms: Fall, Winter, Spring, Summer

### Non-Goals
- Custom term names (keep it simple with standard terms)
- Complex academic calendar integration
- Multiple term systems (e.g., quarter vs semester)

## Decisions

### Term Options Generation
Generate terms programmatically:
- Current year + previous year + next year
- Three terms per year: Winter, Spring, Fall
- Format: "[Season] [Year]" (e.g., "Winter 2026")
- Total: 9 options (3 years × 3 terms)

**Rationale**: Covers most use cases while keeping the dropdown manageable. Three-term system aligns with typical academic calendars.

### Current Term Logic
Auto-select based on date:
- January-April: Winter
- May-August: Spring
- September-December: Fall

**Rationale**: Aligns with common academic calendar patterns. Simple month-based logic avoids complexity. Three-term system matches standard semester structure.

### Implementation Approach
Create a utility function `getTermOptions()` that:
1. Returns array of term objects with `{ label: string, value: string }`
2. Includes a `getCurrentTerm()` helper to identify default selection
3. Can be reused if term selection is needed elsewhere

**Alternatives Considered**:
- Hardcoded list: Would require manual updates each year
- Server-side configuration: Overkill for this MVP scope
- User preference storage: Not needed since auto-selection is sufficient

## Risks / Trade-offs

### Risk: Academic Calendar Variation
Different institutions have different term dates.

**Mitigation**: The auto-selected term is just a default; users can change it. The month ranges are reasonable approximations.

### Risk: Term Naming Differences
Some schools use "Autumn" instead of "Fall", or "Q1/Q2" instead of seasons.

**Mitigation**: Keep standard season names for simplicity. If needed in the future, this can be made configurable, but it's not a blocker for MVP.

## Migration Plan

### Backward Compatibility
Existing courses with free-text terms are unaffected. The database schema remains unchanged (term is still a TEXT field).

### Rollout
Direct deployment - no data migration needed since this only affects the creation UI, not existing data.

## Open Questions
None - straightforward UI enhancement with no breaking changes.
