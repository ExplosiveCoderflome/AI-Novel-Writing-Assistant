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

## Architecture Rules

- If a single source file becomes too long, it must be split into functional modules.
- Preferred threshold: keep a single source file around 600 lines.
- Floating range: 500-700 lines is acceptable when module cohesion is still clear and the file is not becoming hard to maintain.
- Hard threshold: when a source file exceeds 700 lines, refactoring and modularization are mandatory before continuing feature expansion.

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
