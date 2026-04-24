# Mobile Site Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every registered frontend page a usable mobile layout while keeping desktop behavior unchanged.

**Architecture:** Add a mobile-only application shell that replaces the desktop sidebar with a compact top bar and bottom navigation. Keep page-specific mobile changes close to each routed page, using mobile-only class names and shared helper functions for route metadata. Avoid card nesting deeper than one layer on mobile by flattening nested card shells and converting complex desktop grids into stacked modules, accordions, or horizontal segmented controls.

**Tech Stack:** React 19, React Router, TypeScript, Tailwind CSS, existing shadcn-style UI primitives, Node-based helper tests, pnpm builds.

---

## Scope

Registered pages to land:

1. `/` Home
2. `/novels` Novel list
3. `/novels/create` Novel create
4. `/novels/:id/edit` Novel editor mobile workspace compatibility
5. `/novels/:id/chapters/:chapterId` Mobile chapter editor compatibility
6. `/creative-hub` Creative hub
7. `/chat-legacy` Legacy chat
8. `/book-analysis` Book analysis
9. `/tasks` Task center
10. `/auto-director/follow-ups` Auto director follow-ups
11. `/knowledge` Knowledge base
12. `/genres` Genre management
13. `/story-modes` Story mode management
14. `/titles` Title studio
15. `/settings/model-routes` Model routes
16. `/settings` Settings
17. `/worlds` World list
18. `/worlds/generator` World generator
19. `/worlds/:id/workspace` World workspace
20. `/style-engine` Writing formula / style engine
21. `/base-characters` Character library

Redirect routes inherit the destination mobile experience.

## Mobile Constraints

- Desktop class behavior must stay visually unchanged.
- Mobile pages must not render desktop sidebar.
- Bottom navigation must not cover page actions; all mobile pages need safe bottom padding.
- Avoid horizontal page overflow; intentional local horizontal scrolling is only allowed for tabs/segmented controls.
- Avoid card-in-card nesting deeper than one nested layer; mobile should prefer section headings, lightweight rows, and dashed/soft panels.
- Mobile forms should use single-column field groups and full-width primary actions.
- Mobile dialogs should be near-full-width with internal scrolling and safe viewport height.

## File Map

- Create `client/src/components/layout/mobile/mobileSiteNavigation.ts`: route metadata, page title resolution, primary nav groups, more-menu groups.
- Create `client/src/components/layout/mobile/MobileSiteShell.tsx`: top bar, bottom navigation, more drawer, mobile content container.
- Create `client/tests/mobileSiteNavigation.test.js`: route metadata and coverage checks.
- Modify `client/src/components/layout/AppLayout.tsx`: use mobile shell for all non-novel-workspace mobile routes, preserve existing mobile novel workspace bypass.
- Modify `client/src/index.css`: shared mobile helpers for page containers, tabs, dialogs, card flattening, safe bottom spacing.
- Modify routed pages and high-risk child components to add mobile-only layout classes.
- Modify `README.md` and `docs/releases/release-notes.md` before commit because the change is user-facing.

## Tasks

### Task 1: Mobile route metadata and shell

**Files:**
- Create: `client/src/components/layout/mobile/mobileSiteNavigation.ts`
- Create: `client/src/components/layout/mobile/MobileSiteShell.tsx`
- Modify: `client/src/components/layout/AppLayout.tsx`
- Test: `client/tests/mobileSiteNavigation.test.js`

- [ ] Write failing navigation helper tests for every registered route.
- [ ] Run `node client/tests/mobileSiteNavigation.test.js` and confirm it fails because helper file is missing.
- [ ] Implement route metadata, active group resolution, and mobile shell.
- [ ] Wire `AppLayout` so mobile non-novel-workspace routes use `MobileSiteShell`.
- [ ] Run `node client/tests/mobileSiteNavigation.test.js` and confirm it passes.

### Task 2: Shared mobile CSS and primitives

**Files:**
- Modify: `client/src/index.css`
- Test: `client/tests/mobileSiteNavigation.test.js`

- [ ] Add mobile-only utility classes for page surface, compact cards, action bars, tabs, dialogs, and safe bottom spacing.
- [ ] Add CSS rules that flatten nested cards only under explicit mobile page classes.
- [ ] Run navigation helper tests and a client typecheck/build after page changes.

### Task 3: Home and novel entry pages

**Files:**
- Modify: `client/src/pages/Home.tsx`
- Modify: `client/src/pages/novels/NovelList.tsx`
- Modify: `client/src/pages/novels/NovelCreate.tsx`
- Modify: existing novel mobile workspace files only if shell safe area conflicts appear.

- [ ] Adapt homepage into mobile priority flow: next project, compact metrics, start-book CTA, recent list.
- [ ] Adapt novel list into compact mobile project rows with full-width actions.
- [ ] Adapt novel create into mobile single-column sections and full-width actions.
- [ ] Verify existing novel editor and chapter editor mobile shells are not covered by the new global shell.

### Task 4: Workflow pages

**Files:**
- Modify: `client/src/pages/creativeHub/CreativeHubPage.tsx`
- Modify: `client/src/pages/bookAnalysis/BookAnalysisPage.tsx`
- Modify: `client/src/pages/tasks/TaskCenterPage.tsx`
- Modify: `client/src/pages/autoDirectorFollowUps/AutoDirectorFollowUpCenterPage.tsx`
- Modify: `client/src/pages/chat/ChatPage.tsx`

- [ ] Convert multi-column desktop grids to mobile stacked modules.
- [ ] Make filters/setup panels compact and fold naturally above lists.
- [ ] Ensure details are visible directly after selection without requiring horizontal scrolling.
- [ ] Reduce card nesting to one level on mobile.

### Task 5: Asset pages

**Files:**
- Modify: `client/src/pages/knowledge/KnowledgePage.tsx`
- Modify: `client/src/pages/genres/GenreManagementPage.tsx`
- Modify: `client/src/pages/storyModes/StoryModeManagementPage.tsx`
- Modify: `client/src/pages/titles/TitleStudioPage.tsx`
- Modify: `client/src/pages/writingFormula/WritingFormulaPage.tsx`
- Modify: `client/src/pages/characters/CharacterLibrary.tsx`
- Modify relevant dialogs/components under these page folders.

- [ ] Make tabs and category controls mobile-scrollable or wrapped.
- [ ] Make lists and editors single-column on mobile.
- [ ] Convert wide dialogs to near-full-width mobile dialogs.
- [ ] Ensure image grids and generated result lists do not overflow.

### Task 6: World and settings pages

**Files:**
- Modify: `client/src/pages/worlds/WorldList.tsx`
- Modify: `client/src/pages/worlds/WorldGenerator.tsx`
- Modify: `client/src/pages/worlds/WorldWorkspace.tsx`
- Modify: `client/src/pages/settings/ModelRoutesPage.tsx`
- Modify: `client/src/pages/settings/SettingsPage.tsx`
- Modify related world/settings components where needed.

- [ ] Make world list and generator mobile single-column.
- [ ] Make world workspace tabs mobile-friendly and sections stacked.
- [ ] Make settings forms single-column with full-width save actions.
- [ ] Convert large configuration cards into mobile-friendly sections without deep nesting.

### Task 7: Verification, docs, commit, preview readiness

**Files:**
- Modify: `README.md`
- Modify: `docs/releases/release-notes.md`

- [ ] Run focused node tests.
- [ ] Run existing mobile tests.
- [ ] Run `pnpm --filter @ai-novel/client build`.
- [ ] Update release notes from the user's perspective.
- [ ] Commit on `dev/mobile-site-shell`.
- [ ] If requested, build and deploy only the web image to internal K8s.

## Self-Review Notes

- Every registered page is assigned to exactly one implementation task.
- Redirect routes inherit destination pages and do not need standalone UI.
- The plan avoids backend changes.
- The mobile card-depth constraint is included in shared CSS and each page task.
