# Lucky Beta Selective Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `lucky-beta` from `beta` and selectively port user-visible lucky features and still-relevant fixes while preserving beta behavior.

**Architecture:** Use `beta` as the source of truth for already-merged behavior, especially character resource ledger changes. Port additive feature families from `lucky` by cherry-picking or file-level reconstruction, then resolve conflicts by preferring beta where lucky has only older or release-only changes. Validate with focused server/client checks.

**Tech Stack:** Git worktree, TypeScript, Prisma 7 dual PostgreSQL/SQLite schemas, Express routes, React client, Node test runner.

---

### Task 1: Branch And Commit Inventory

**Files:**
- Modify: none

- [x] **Step 1: Create `lucky-beta` from `beta` in an isolated worktree**

Run: `git worktree add ~/.config/superpowers/worktrees/AI-Novel-Writing-Assistant/lucky-beta -b lucky-beta beta`
Expected: worktree starts at `beta` commit `3fbdc3a`.

- [x] **Step 2: List `lucky` commits not in `beta`**

Run: `git log --reverse --right-only --cherry-pick --pretty=format:'%h%x09%ad%x09%s' --date=short beta...lucky`
Expected: identify feature commits, fix commits, and release/deploy-only commits.

### Task 2: Port Dual Database Support

**Files:**
- Modify/Create: `server/src/config/database.ts`
- Modify: `server/src/db/prisma.ts`
- Modify: `server/prisma.config.ts`
- Modify: `server/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `server/src/prisma/schema.prisma`
- Create/Modify: `server/src/prisma/schema.sqlite.prisma`
- Create/Modify: `server/src/prisma/migrations/`
- Create/Modify: `server/src/prisma/migrations.sqlite/`
- Test: `server/tests/databaseConfig.test.js`

- [ ] **Step 1: Bring over current dual database runtime configuration from `lucky`**

Use file-level checkout for database runtime files, then inspect schema differences against `beta` to preserve beta-only models.

- [ ] **Step 2: Ensure PostgreSQL migrations include beta-only character resource ledger changes**

Compare `server/src/prisma/schema.prisma` and `server/src/prisma/schema.sqlite.prisma` for models/fields around `CharacterResourceLedger` and latest beta migrations.

- [ ] **Step 3: Run focused config/type verification**

Run: `pnpm --filter @ai-novel/server typecheck`
Expected: TypeScript compiles and Prisma client generation uses selected schema.

### Task 3: Port WeCom / DingTalk Follow-Up Channels

**Files:**
- Create/Modify: `server/src/services/settings/AutoDirectorChannelSettingsService.ts`
- Create/Modify: `server/src/services/task/autoDirectorFollowUps/*`
- Create/Modify: `server/src/routes/autoDirectorChannelCallbacks.ts`
- Create/Modify: `server/src/routes/autoDirectorFollowUps.ts`
- Create/Modify: `server/src/routes/settingsAutoDirector.ts`
- Modify: server route registration files
- Create/Modify: `client/src/api/autoDirectorFollowUps.ts`
- Modify: `client/src/api/settings.ts`
- Modify: relevant follow-up UI components
- Test: `server/tests/autoDirector*test.js`

- [ ] **Step 1: Port channel settings and notification services**

Bring over service/routes/tests from `lucky`, resolving conflicts in favor of beta when beta already has follow-up action contracts.

- [ ] **Step 2: Port client channel settings UI**

Bring over additive UI/API files for WeCom/DingTalk settings while preserving beta sidebar/task center behavior.

- [ ] **Step 3: Run focused follow-up tests**

Run focused auto-director channel/follow-up tests after build.
Expected: focused tests pass or exact failures are documented.

### Task 4: Review Fix Commits For Applicability

**Files:**
- Modify: only files required by fixes still absent from `beta`

- [ ] **Step 1: Skip release/deploy image tag commits**

Do not port Kubernetes/image tag-only commits unless required for runtime wiring.

- [ ] **Step 2: Compare fix symptoms against beta**

For each lucky fix, check whether beta already contains equivalent code. If beta has equivalent or newer behavior, keep beta. If missing and low-risk, port the minimal fix.

- [ ] **Step 3: Record skipped fixes in final summary**

Report which categories were skipped because beta already had newer behavior or because they were deployment-only.

### Task 5: Verification And Handoff

**Files:**
- Modify: none beyond selected port

- [ ] **Step 1: Run status and diff review**

Run: `git status --short` and `git diff --stat beta...HEAD`.
Expected: changes match selected feature/fix scope.

- [ ] **Step 2: Run available focused checks**

Run focused tests/typecheck based on touched files. If dependencies are missing or tests fail from pre-existing issues, capture exact output.

- [ ] **Step 3: Provide final summary**

Summarize branch path, selected commits/features, skipped commits, verification output, and remaining risks.
