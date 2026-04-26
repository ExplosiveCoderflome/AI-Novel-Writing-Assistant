# Safety Rules

## Data Protection (Highest Priority)

- Never execute any destructive data operation without a verified backup first.
- Destructive operations include (but are not limited to): deleting database files, `prisma migrate reset`, `db reset`, truncation, dropping tables, or any command that can remove existing data.
- Before any such operation, require:
  - explicit user approval for the destructive step;
  - a completed backup with a concrete backup path;
  - a quick restore validation (or at minimum a backup file existence/size check).
- If backup is missing or unverified, stop and do not proceed.

## AI-First System Rules (Highest Priority)

- This project is an AI-native application. For intent recognition, task classification, planning, routing, tool selection, and similar decision-making paths, AI-based structured understanding must be the primary implementation.
- Do not implement product-facing core behavior with fixed keyword matching, hard-coded regex routing, manual branch tables, or any non-AI fallback path when the problem is intended to be handled by AI.
- If AI intent recognition fails, treat it as an AI capability/problem to be fixed. Do not add fallback matching to hide the miss.
- Fixed judgments are only allowed as:
  - input validation or safety guards;
  - deterministic post-processing of already-structured AI output.
- When adding a new capability, first extend the AI schema / structured output / tool contract. Do not patch behavior by stacking special-case string rules.

## Product Context (Highest Priority)

- The primary target users of this project are complete writing beginners who do not understand fiction craft, structure, or novel production workflows.
- The product should help these users finish a full novel through AI guidance, AI-first decision support, or fully automated planning when appropriate.
- When making product, UX, planning, or agent behavior decisions, optimize for:
  - low cognitive load;
  - strong step-by-step guidance;
  - clear defaults and automatic recommendations;
  - end-to-end completion of a full-length novel, not just isolated writing assistance.
- Do not assume the primary user can manually repair structure, pacing, character arcs, or chapter planning without substantial AI support.
- If there is a tradeoff between expert-oriented flexibility and beginner completion rate, prefer the path that better helps a novice user successfully produce a complete novel.

## UI Copy Rules

- All user-facing UI copy must explain the function from the user's perspective: what the user can do, what the system is helping with, or what the next step is.
- Do not write UI copy as implementation commentary, migration commentary, refactor commentary, or change-history commentary.
- Avoid product-facing copy that uses process/meta wording such as `现在`, `不再`, `已经`, `之前`, `原本`, `迁回`, `升级为`, or similar "we changed this" narration when the text is visible to end users.
- Prefer direct task wording such as:
  - entry point guidance;
  - action guidance;
  - expected effect;
  - current selection or current result.
- If a workflow belongs in another module, explain the correct user entry point directly, for example "从小说基础信息设置书级默认写法", rather than "书级默认写法已经迁回小说页".
- Before finishing UI work, review newly added copy and rewrite any sentence that sounds like it is talking to the developer or describing the modification process.

## Architecture Rules

- If a single source file becomes too long, it must be split into functional modules.
- Preferred threshold: keep a single source file around 600 lines.
- Floating range: 500-700 lines is acceptable when module cohesion is still clear and the file is not becoming hard to maintain.
- Hard threshold: when a source file exceeds 700 lines, refactoring and modularization are mandatory before continuing feature expansion.

## Development Branch Workflow

- When developing a new feature that may affect the end-to-end product flow, default workflow, shared contracts, or other major system links, do not develop directly on `main`.
- In these cases, first create or switch to a dedicated feature development branch, complete implementation and functional verification there, then merge into the pre-release `beta` branch for integration verification. Merge back to `main` only after `beta` has been tested and stable enough for release.
- After the feature branch has been successfully merged into `beta` and no longer needs follow-up work, clean up that development branch so old feature branches do not accumulate indefinitely.
- This rule applies in particular to changes that touch cross-stage workflows, shared runtime/prompting/context contracts, automatic director chains, chapter execution chains, data migration behavior, or other changes that can impact the overall chain.
- Small isolated fixes, copy changes, low-risk UI polish, or documentation-only updates can still be handled without requiring a separate feature development branch unless the user explicitly asks otherwise. If the change is release-facing, still prefer passing through `beta` before `main`.

### Pre-release Beta Branch Workflow

- Use `beta` as the stable pre-release integration branch between feature development branches and `main`.
- The normal release path is: feature branch -> self-test / targeted verification -> merge into `beta` -> integration testing / regression checks / packaging verification -> merge into `main` -> public release or packaging upload.
- `main` is the stable release branch. Do not merge a feature branch directly into `main` when the change affects product flow, shared contracts, runtime behavior, data migration, desktop packaging, or other end-to-end links.
- `beta` should represent the next candidate release. Keep it buildable, runnable, and suitable for acceptance testing; do not use it as a dumping ground for unfinished experiments.
- If multiple feature branches are merged into `beta`, test the combined behavior on `beta` before promoting the batch to `main`, especially around automatic director flow, chapter execution, prompt/runtime contracts, migrations, and desktop startup or packaging.
- If `beta` validation fails, fix the issue on the original feature branch when the fault is isolated, or on a short-lived `beta-fix` branch when the failure is caused by integration between multiple features. Merge the fix back into `beta` and rerun the failed checks before promoting.
- Only promote `beta` to `main` when the release candidate has passed the required functional checks, build checks, and any packaging verification relevant to the release. After promotion, keep `beta` aligned with `main` so the next pre-release cycle starts from the released state.
- For urgent production hotfixes, it is acceptable to branch from `main`, verify narrowly, merge back to `main`, and then immediately merge or cherry-pick the hotfix into `beta` so the pre-release branch does not lose the production fix.
- Public desktop packaging and release upload should be performed from `main` or from a release tag created after `beta` has been promoted to `main`, not directly from a feature branch or an unverified `beta` state.
- The branch name is `beta`. Do not create a separate `bate` branch; if such a typo branch appears, migrate any useful work to `beta` and remove the typo branch after confirming nothing is lost.

### Desktop Branch Completion Workflow

- Desktop feature development on `desktop-dev` is considered complete. Do not start new desktop feature work directly on `desktop-dev` unless the user explicitly reopens desktopization as an active development phase.
- Treat `desktop-dev` as a completion candidate that must move through stabilization, pre-release verification, and branch retirement.
- Before promoting desktop work, sync any required stable changes from `main` into `desktop-dev` when they affect shared contracts, runtime/state logic, build/dependency setup, desktop startup, packaging, or release verification.
- Run desktop-focused verification on `desktop-dev` first, including development startup, first-run configuration, core web flow compatibility, build checks, and packaging checks relevant to the target release.
- After `desktop-dev` passes its focused verification, merge it into `beta` for combined pre-release testing with the rest of the next release candidate.
- Do not promote desktop work from `desktop-dev` directly to `main`. `beta` must pass integration testing and release packaging verification before the desktop work reaches `main`.
- If `beta` exposes desktop integration failures, fix them on a short-lived desktop stabilization branch or directly on `desktop-dev` if the desktop branch has not yet been retired, then merge the fix back into `beta` and rerun the failed checks.
- Once `beta` has been promoted to `main` and the released `main` contains the completed desktop work, retire `desktop-dev` so future desktop changes follow the normal feature branch -> `beta` -> `main` workflow.
- After retirement, `desktop-dev` should not be reused as a long-lived integration branch. Create short-lived feature branches for future desktop fixes or improvements, and promote them through `beta`.

## Desktop Packaging Upload Rules

- Public desktop package upload to GitHub Releases is allowed only when the release version is driven by `desktop/package.json` and the Git tag is exactly `vX.Y.Z`.
- Before any public desktop upload, verify that `desktop/package.json` `version` is a stable semver like `0.2.3`, with no `desktop-` prefix, no `-r1` style suffix, and no branch-only naming mixed into the version field.
- The pushed release tag must match `desktop/package.json` exactly after adding the `v` prefix. Example: `desktop/package.json` is `0.2.3`, then the only allowed public release tag is `v0.2.3`.
- Do not use `desktop-vX.Y.Z-rN`, `desktop-v*`, branch names, workflow dispatch on `main`, or any other non-matching ref as the identifier for a public desktop GitHub Release upload.
- If a build is triggered manually or from a non-matching tag, treat it as verification or packaging only. It must not be treated as a valid public release upload.
- If the required `vX.Y.Z` tag and `desktop/package.json` version are not aligned, stop before upload, fix the version/tag pair first, and then rerun the release flow.

## Prompt Governance

- `server/src/prompting/` is the only allowed entrypoint for adding new product-level prompts.
- Any new product-facing prompt must be implemented as a `PromptAsset` under `server/src/prompting/prompts/<family>/`.
- Any new product-facing prompt must be registered in `server/src/prompting/registry.ts` with explicit `id`, `version`, `taskType`, `mode`, `contextPolicy`, and `outputSchema` when structured.
- Do not add new business prompts by inlining `systemPrompt` / `userPrompt` inside service files and calling `invokeStructuredLlm`.
- Do not add new business prompts by calling raw `getLLM()` from service code unless the flow is an approved exception below.
- When touching an existing unregistered prompt path, default to migrating that prompt into `server/src/prompting/` instead of extending the old inline implementation.
- Approved exceptions are limited to:
  - JSON repair inside `server/src/llm/structuredInvoke.ts`
  - connectivity / probe prompts such as `server/src/llm/connectivity.ts`
  - phase-two flow adapters in `graphs/*`, `routes/chat.ts`, `services/novel/runtime/*`, and other stream bridge code explicitly kept outside the registry for now
- For naming and registration workflow, follow `server/src/prompting/README.md`.

## README Release Notes Workflow

- Before any commit, push, or PR step in this repository, use the `readme-release-updater` skill from `${CODEX_HOME:-~/.codex}/skills/readme-release-updater` to inspect the Git scope, summarize the user-visible changes, update `docs/releases/release-notes.md`, and refresh `README.md` `## 最新更新` when applicable.
- If the `readme-release-updater` skill does not exist in the expected Codex skills directory, create it first before any commit, push, or PR step instead of skipping the workflow.
- When creating that skill, place it under `${CODEX_HOME:-~/.codex}/skills/readme-release-updater/` with a `SKILL.md` that explicitly instructs the agent to:
  - inspect the pending Git scope for the intended commit, push, or PR, including enough status/diff context to understand the user-visible change;
  - decide whether the diff has clear user-facing impact or is purely internal;
  - update `docs/releases/release-notes.md` as the canonical full history, preserving older entries and merging multiple updates for the same date under one date heading;
  - refresh `README.md` `## 最新更新` so it shows only the newest merged date block plus a link to `docs/releases/release-notes.md`, instead of accumulating historical sections;
  - write release summaries from the user's perspective, focusing on visible capabilities, workflow improvements, and product behavior rather than file paths, refactors, or test-only details;
  - skip noisy release-note edits when the current diff is purely internal and clearly say that no user-facing release note update is needed.
- The `readme-release-updater` skill should also tell the agent to keep the repository's date-based release format, for example `### 2026-04-07`, and not introduce semantic versions unless the user explicitly requests a versioning transition.
- If the skill is newly created in another terminal, verify that its `SKILL.md` contains the workflow above before continuing with the Git write step.
- When the user asks to commit or push code, inspect the Git scope for that push and update `docs/releases/release-notes.md` first, then sync `README.md` before the Git write step if the change set has clear user-facing impact.
- `docs/releases/release-notes.md` is the complete user-facing update history and should preserve older entries.
- `README.md` is only the latest update surface and must keep a link to `docs/releases/release-notes.md`; do not let `README.md` accumulate multiple historical date blocks.
- When a new update is recorded, keep full history in `docs/releases/release-notes.md` and make `README.md` show only the newest merged date block plus the history link.
- If multiple user-visible updates are recorded on the same date, merge them under the same date heading in `docs/releases/release-notes.md`; `README.md` should keep only that date's latest merged summary.
- If the current diff is purely internal and has no clear user-facing impact, state that explicitly and skip both release-note updates instead of forcing a noisy entry.
- Write both release-note surfaces from the user's perspective: describe capabilities, workflow improvements, and visible product behavior instead of file names, route names, service names, tests, or refactor details.

## Release Identification Rules

- For now, this project continues to use `date-based` release/update identification. Do not introduce formal semantic version numbers unless the user explicitly decides to switch.
- `docs/releases/release-notes.md`, `README.md` `## 最新更新`, release summaries, and other user-facing update records should continue to use the existing date-first format, for example: `### 2026-04-07`.
- Keep the date as the primary update identifier until the product workflow, information architecture, and release cadence are stable enough to justify a formal versioning system.
- If multiple user-visible updates are recorded on the same date, keep them under the same date heading in `docs/releases/release-notes.md` and distinguish them by clear summary text instead of inventing temporary version numbers.

### Future Versioning Transition

- When the user later decides the product is stable enough for formal versions, versioning can transition from `date-only` to `version number + date`.
- Until that explicit transition happens, do not add `v0.x.y`, tags, or release naming conventions into README, changelog, or other product-facing release notes by default.
