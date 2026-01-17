# PDF Continuous Scroll Mode - OpenSpec Proposal

## 📋 Quick Summary

This OpenSpec proposal adds **continuous scroll mode** to the P5 PDF reader, allowing users to choose between traditional page-by-page navigation and modern continuous scrolling through multiple pages.

**Status**: 🟢 Updated with Stakeholder Feedback
**Change ID**: `add-pdf-continuous-scroll`
**Type**: New Feature + Integration
**Impact**: Frontend only, no backend changes
**Version**: 2.0 (Updated 2026-01-12)

## 🎯 What's Being Added

### Core Feature
Two reading modes with a toggle control:
- **Page Mode** (default): Current behavior - one page at a time with prev/next buttons
- **Scroll Mode** (new): Continuous vertical scrolling through multiple pages, like Adobe Acrobat

### Key Capabilities
1. **Mode Toggle**: UI control in toolbar to switch between modes with ARIA support
2. **Current Page Tracking**: Intelligent detection of "current page" in scroll mode (highest visible area)
3. **Seamless Integration**: All existing features work in both modes:
   - Text selection & AI explanations
   - Sticker highlighting & navigation
   - Image region selection
   - Last read page memory
   - Zoom controls with anchor preservation
4. **Performance**: Virtual scrolling for all document sizes (consistent implementation)
5. **Persistence**: User preference saved to localStorage and URL (?mode=scroll|page)
6. **Keyboard Accessibility**: Full keyboard navigation support (Tab, Enter/Space, PageUp/Down, arrows)
7. **Screen Reader Support**: ARIA live regions announce mode changes and current page
8. **Error Handling**: Graceful degradation when browser APIs unavailable

## 📁 Proposal Structure

```
add-pdf-continuous-scroll/
├── proposal.md              # Why, what, and impact
├── design.md                # Technical decisions and architecture
├── tasks.md                 # 15 phases, 75+ implementation tasks
├── VALIDATION-SUMMARY.md    # Validation checklist (this was auto-generated)
├── README.md                # This file
└── specs/
    ├── pdf-reader-modes/
    │   └── spec.md          # NEW: 13 requirements, 59 scenarios
    └── pdf-viewer-interaction/
        └── spec.md          # DELTA: 3 added + 1 modified requirements
```

## 🔍 Documents Overview

### 1. proposal.md
**Purpose**: High-level overview for stakeholders  
**Key Sections**:
- Why: Original docs mentioned scroll mode but it was never implemented
- What: Two reading modes with full feature compatibility
- Impact: Affected files, no breaking changes, dependencies satisfied
- Migration: Conservative default (page mode), users opt-in

### 2. design.md
**Purpose**: Technical design document for implementation team  
**Key Decisions**:
- Default mode: `page` (conservative approach)
- Current page logic: Highest visible area (IntersectionObserver)
- Virtual scrolling: react-window's VariableSizeList
- Zoom behavior: Simplified - maintain current page, scroll to top
- Navigation: Prev/Next buttons scroll to page top in scroll mode

**Architecture**: Conditional rendering at PdfViewer level, enhanced VirtualPdfList for scroll mode

### 3. tasks.md
**Purpose**: Implementation checklist
**Structure**: 15 major phases broken into 95+ subtasks

**Phase Highlights**:
1. Foundation & Types
2. Core Scroll Mode Rendering
3. Current Page Tracking (IntersectionObserver)
4. Mode Toggle UI
5. PdfViewer Integration
6. Navigation Integration
7-9. Sticker, Region, AI Integration
10. Zoom & Scale Handling
11. Performance & Virtual Scrolling
12. Testing & Validation
13. Browser Compatibility
14. UX Polish
15. Documentation

### 4. specs/pdf-reader-modes/spec.md
**Purpose**: NEW capability specification
**Requirements**: 13 total, 59 scenarios

**Requirement Categories**:
- Reading mode types (page vs scroll characteristics)
- Mode toggle control (UI, switching behavior, ARIA)
- Current page definition (visibility-based tracking)
- Navigation in scroll mode (prev/next/jump)
- Mode preference persistence (localStorage + URL state)
- Last read page in scroll mode (debounced updates)
- Zoom behavior (anchor point preservation)
- Virtual scrolling performance (always on, consistent implementation)
- Feature compatibility (text selection, stickers, regions, AI)
- **NEW**: Keyboard accessibility (Tab, Enter/Space, native scroll keys)
- **NEW**: URL state management (shareable context with ?mode parameter)
- **NEW**: Error handling & fallbacks (graceful degradation)

### 5. specs/pdf-viewer-interaction/spec.md (DELTA)
**Purpose**: Modifications to existing spec for scroll mode integration  

**ADDED Requirements**:
1. Sticker Click Navigation in Scroll Mode
2. Region Overlay Rendering in Scroll Mode (visible pages only)
3. Sticker Hover Highlighting in Scroll Mode

**MODIFIED Requirements**:
1. Selection Mode Persists Across Page Navigation (extended for scroll mode support)

## ✅ Validation Status

**Version 2.0 Updates** (2026-01-12):
- ✅ Integrated stakeholder feedback on accessibility, URL state, and zoom behavior
- ✅ Added 3 new requirements: Keyboard Accessibility, URL State Management, Error Handling
- ✅ Added 16 new scenarios (43 → 59 total)
- ✅ Updated 20+ tasks across 10 phases
- ✅ 10 design decisions documented with rationale
- ✅ All 4 core documents present and updated (proposal, design, tasks, specs)
- ✅ Spec deltas properly structured (ADDED/MODIFIED headers)
- ✅ All scenarios use correct format (`#### Scenario:`)
- ✅ All requirements have at least one scenario
- ✅ Normative language used (SHALL/MUST)
- ✅ No conflicts with existing specs
- ✅ Dependencies satisfied (react-window already installed)
- ✅ WCAG 2.1 Level AA accessibility requirements specified
- ✅ Graceful degradation strategies defined

**Recommendation**: Ready for final stakeholder approval and implementation

## 🚀 Implementation Overview

### Timeline Estimate
- **Phase 1-5** (Foundation + Accessibility): 4-5 days
- **Phase 6-9** (Integration): 3-4 days
- **Phase 10-11** (Performance + Zoom): 3-4 days (anchor preservation adds complexity)
- **Phase 12-15** (Testing & Polish): 4-5 days (includes accessibility testing)
- **Total**: ~2.5-3 weeks (single developer, full-time)

### Technical Approach
1. Add `ReaderMode` type, constants, and state management utilities
2. Build enhanced PdfScrollList with IntersectionObserver (+ scrollTop fallback)
3. Conditional rendering in PdfViewer
4. URL state management with priority: URL > localStorage > default
5. Mode-aware navigation functions with smooth scrolling
6. Zoom anchor preservation (offsetRatio calculation)
7. ARIA structure: radiogroup toggle, live regions, keyboard support
8. Integration with existing sticker/region/AI systems
9. Virtual scrolling for all document sizes (no threshold)
10. Comprehensive testing (unit, integration, E2E, accessibility)

### Risk Mitigation
- **Performance**: Virtual scrolling always on + conditional overlay rendering
- **Compatibility**: IntersectionObserver well-supported (Chrome 51+, Safari 12.1+, Edge 15+), scrollTop fallback for older browsers
- **Zoom jumps**: Anchor point preservation (offsetRatio) maintains reading position
- **State complexity**: Clear mode separation, shared utilities
- **localStorage unavailable**: In-memory fallback, feature continues to work
- **URL state fails**: Try/catch wrapper, continue without URL sync
- **Accessibility**: WCAG 2.1 Level AA compliance with native keyboard support

## 📊 Key Metrics for Success

### Functional Requirements
- [ ] Both modes render correctly
- [ ] Mode toggle works and persists preference
- [ ] Current page tracking accurate in scroll mode
- [ ] All navigation methods work in both modes
- [ ] Stickers, regions, AI features integrate seamlessly
- [ ] No regressions in page mode

### Performance Requirements
- [ ] 60fps scrolling in 100+ page docs
- [ ] Virtual scrolling activates for >50 pages
- [ ] Memory usage controlled
- [ ] No layout jank during scale changes

### UX Requirements
- [ ] Smooth scroll animations
- [ ] Intuitive mode toggle placement
- [ ] Consistent page indicator behavior
- [ ] Proper visual feedback (loading, errors)

### Accessibility Requirements
- [ ] Keyboard navigation works (Tab, Enter/Space, PageUp/Down, arrows, Home/End)
- [ ] Visible focus indicators on all interactive elements
- [ ] Screen reader announces mode changes and current page
- [ ] ARIA structure correct (radiogroup, live regions)
- [ ] WCAG 2.1 Level AA compliance

## 🎓 Learning & Context

### Why This Matters
Modern PDF viewers (Adobe Acrobat, browser PDF viewers) all support continuous scrolling as the primary interaction mode. Users expect this behavior. The original product documents mentioned this feature but it was deferred during initial implementation.

### Design Philosophy
- **Conservative rollout**: Default to page mode (current behavior)
- **User empowerment**: Let users choose their preferred mode
- **Shareable context**: URL state enables sharing preferred reading mode
- **No breaking changes**: Everything works in both modes
- **Performance first**: Virtual scrolling prevents memory issues (always on)
- **Accessibility first**: WCAG 2.1 Level AA compliance with native keyboard support
- **Graceful degradation**: Feature works even when browser APIs unavailable

### Integration Points
This change touches:
- PDF rendering (multi-page vs single-page)
- Navigation (scroll vs page switch)
- State management (current page definition, URL state)
- Event handling (IntersectionObserver, keyboard events)
- Sticker system (mode-aware highlighting/navigation)
- AI features (current page context)
- URL/localStorage persistence (priority hierarchy)
- Zoom behavior (anchor point preservation)
- Accessibility layer (ARIA, screen readers)
- Error handling (graceful degradation)

## 📞 Stakeholder Review Checklist

### For Product Owners
- [ ] Review `proposal.md` - scope aligns with product vision
- [ ] Review default mode decision (conservative: page mode)
- [ ] Approve non-goals (no mobile optimization, no custom keyboard shortcuts, no per-document mode)
- [ ] Confirm feature compatibility requirements
- [ ] Approve URL state management for shareable context
- [ ] Approve timeline extension (2.5-3 weeks vs original 2 weeks)

### For Technical Leads
- [ ] Review `design.md` - technical approach sound (10 documented decisions)
- [ ] Approve architecture decisions (IntersectionObserver + fallback, react-window always on)
- [ ] Confirm no backend changes required
- [ ] Validate performance optimization strategy (virtual scrolling, conditional rendering)
- [ ] Approve zoom anchor preservation implementation
- [ ] Review error handling and graceful degradation strategies
- [ ] Validate accessibility approach (native keyboard support, ARIA)

### For QA Engineers
- [ ] Review spec scenarios - testable and complete (59 scenarios across 13 requirements)
- [ ] Identify test data needs (10/60/150 page PDFs, variable page sizes)
- [ ] Plan browser compatibility testing (Chrome, Safari, Edge with keyboard navigation)
- [ ] Prepare E2E test scenarios (mode switching, navigation, zoom, stickers)
- [ ] Plan accessibility testing (keyboard navigation, screen readers: NVDA/VoiceOver)
- [ ] Plan error handling tests (localStorage disabled, IntersectionObserver unavailable)

### For Development Team
- [ ] Review `tasks.md` - estimate effort and timeline (15 phases, 95+ tasks)
- [ ] Identify any blockers or unknowns
- [ ] Confirm dependencies available (react-window, react-pdf, pdfjs-dist)
- [ ] Plan sprint allocation (2.5-3 weeks estimated)
- [ ] Review complexity additions: zoom anchor, URL state, accessibility, error handling

## 🔄 Next Steps

1. **Stakeholder Review** (this stage)
   - Product, Tech Lead, QA review documents
   - Gather feedback and questions
   - Make any necessary adjustments

2. **Approval Gate**
   - All stakeholders sign off
   - Change status: Approved

3. **Implementation** (after approval)
   - Follow tasks.md sequentially
   - Daily standup progress updates
   - PR reviews at phase completion

4. **Testing**
   - Unit tests during implementation
   - Integration tests at milestones
   - E2E tests before deployment

5. **Deployment**
   - Feature flag (optional)
   - Gradual rollout
   - Monitor metrics and feedback

6. **Archive**
   - Deploy successfully
   - Run `openspec archive add-pdf-continuous-scroll`
   - Update main specs directory
   - Document lessons learned

## 📚 References

- Original requirement doc: `补丁文档：P5 PDF 阅读器支持上下滚动（Continuous Scroll）`
- Existing spec: `openspec/specs/pdf-viewer-interaction/spec.md`
- Current implementation: `src/features/reader/components/pdf-viewer.tsx`
- Virtual list component: `src/features/reader/components/virtual-pdf-list.tsx`

## 🤝 Questions?

If you have questions about this proposal:
1. Check the relevant document (proposal.md for scope, design.md for technical details)
2. Review the specs for specific behavior scenarios
3. Consult the validation summary for format/structure confirmation
4. Reach out to the proposal author for clarification

---

**Proposal Author**: AI Assistant (Antigravity)
**Date Created**: 2026-01-12
**Last Updated**: 2026-01-12
**Status**: Updated with Stakeholder Feedback - Awaiting Final Approval
**Version**: 2.0

---

## 📝 Version History

### Version 2.0 (2026-01-12)
**Major Updates**:
- Added keyboard accessibility (WCAG 2.1 Level AA)
- Added URL state management (?mode=scroll|page)
- Changed zoom behavior to anchor point preservation
- Changed virtual scrolling strategy (always on, no threshold)
- Added error handling and graceful degradation
- Added 3 new requirements, 16 new scenarios
- Updated 20+ tasks across 10 phases
- Extended timeline estimate to 2.5-3 weeks

### Version 1.0 (2026-01-12)
Initial proposal with core scroll mode functionality
