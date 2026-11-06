# Issue #219

- Root cause: #217 added chapter-split progress to the manual “节奏 / 章节导航” workspace. The reported “正在生成「生成卷拆章列表」6/7 阶段” is the V2 director panel, whose chapter-list adapter did not forward those existing progress notifications.
- Fix: forward actual batch counts through the existing Run event log and dashboard projection, then show the label, generated/total chapters, and existing `WorkflowProgressBar` directly below the stage headline. Keep the final validation/save message until the stage finishes. Scope progress to the active control version so retries and later stages do not show old counts.
- Documentation: updated the progress contract and same-date release notes/README. No database migration or novel-data changes.
- Verification: 17 relevant client tests and 46 server tests passed (director rendering/follow, SSE progress, chapter-list adapter, production composition, and projection). Shared/server builds, client typecheck, client production build, and `git diff --check` passed.
- Non-blocking output: Vite reported old Browserslist data and a large vendor chunk; an existing quality-loop composition test logged a missing `Chapter` table in the empty local database but passed. Browser/UI acceptance is left to the user, per repository instructions.
