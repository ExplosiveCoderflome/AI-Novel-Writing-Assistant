# Director Structured Fallback Governance Design

**Context**

Portable runtime logs show the latest auto-director failure happens before `story_macro` and `book_contract`. The first failing structured prompt is `novel.director.candidates@v1`, which still runs with native `json_schema` and stops on `transport_error` without falling through to `prompt_json`.

Key runtime evidence:

- Packaged log path: `desktop/build/dist/@ai-noveldesktop-data/logs/desktop-main.log`
- Failing label: `novel.director.candidates@v1`
- Strategy at failure: `json_schema`
- Error category: `transport_error`
- Current diagnostics report `fallbackAvailable: false`

This confirms the problem is no longer a single prompt bug. It is a governance gap: director-chain structured prompts do not share a consistent fallback policy.

## Goal

Make the director candidate stage resilient to OpenAI-compatible native structured transport failures by applying the same fallback pattern already used for framing, story macro, and book contract, while keeping the change scoped to the director chain instead of globally changing all structured prompting.

## Scope

In scope:

- `novel.director.candidates`
- `novel.director.candidate_patch`
- shared fallback behavior used by director candidate generation and candidate patch flows
- targeted regression tests
- packaged runtime verification after rebuild

Out of scope:

- global changes to `server/src/llm/structuredInvoke.ts`
- unrelated structured prompts outside director flows
- title refinement flow if it does not rely on the same structured prompt path

## Approaches Considered

### Approach 1: Patch only `novel.director.candidates`

Add prompt-level `mode: "off"` and service-level fallback only for candidate generation.

Pros:

- Smallest change
- Fastest user-visible recovery

Cons:

- Leaves `candidate_patch` inconsistent
- Likely repeats the same incident on the next director sub-step

### Approach 2: Director-chain fallback governance

Introduce a shared fallback helper for director candidate structured calls, then apply it to both candidate generation and candidate patch.

Pros:

- Fixes the current failure and the next obvious recurrence point
- Keeps the behavior consistent within the director chain
- Avoids risky global behavior changes

Cons:

- Slightly larger implementation surface
- Requires tighter regression coverage

### Approach 3: Global structured transport fallback

Change `structuredInvoke.ts` so every `transport_error` automatically proceeds to `prompt_json`.

Pros:

- Broadest coverage

Cons:

- High blast radius
- Not justified by current evidence
- Can change behavior for unrelated providers and prompts

## Recommended Approach

Use Approach 2.

The evidence now shows the failure pattern is recurring across multiple director prompts, but it is still localized enough that a director-specific policy is safer than a global fallback rewrite.

## Design

### 1. Prompt policy alignment

The director candidate prompts should stop advertising native structured hints as the default path when running against the current OpenAI-compatible route behavior.

Design:

- Set `structuredOutputHint.mode = "off"` for `novel.director.candidates`
- Set `structuredOutputHint.mode = "off"` for `novel.director.candidate_patch`

This matches the pattern already used for `novel.director.book_contract` and avoids reinforcing native structured expectations in prompt scaffolding.

### 2. Shared director structured fallback helper

Create a helper inside the director service layer for structured candidate generation flows. The helper must:

1. Attempt the existing `runStructuredPrompt(...)` path first.
2. If the thrown category is `transport_error`, prepare prompt execution manually.
3. Retry using `invokeStructuredLlmDetailed(... structuredStrategy: "prompt_json")`.
4. If `prompt_json` also fails with `transport_error`, issue a direct OpenAI-compatible `/chat/completions` request with raw `fetch`.
5. Parse the returned JSON locally with `parseStructuredLlmRawContentDetailed(...)`.

This helper stays local to the director candidate stage and does not alter global structured invocation semantics.

### 3. Candidate-stage integration

Apply the shared helper to:

- `generateBatch(...)` for `novel.director.candidates`
- candidate patch flow for `novel.director.candidate_patch`

Do not change title refinement unless code inspection shows it depends on the same structured prompt path.

### 4. Testing

Regression coverage must prove:

- `novel.director.candidates` no longer hard-fails on first `transport_error`
- `novel.director.candidate_patch` follows the same fallback path
- prompt assets explicitly disable native structured hint
- existing director story macro and book contract behavior remains compatible

### 5. Runtime verification

After rebuild and repackaging, inspect packaged runtime logs and verify:

- candidate-stage label still matches the expected prompt id
- strategy sequence changes from immediate `json_schema` failure to a governed fallback path
- latest error text changes if the upstream problem moves deeper

## Files Expected To Change

- `server/src/prompting/prompts/novel/directorPlanning.prompts.ts`
- `server/src/services/novel/director/novelDirectorCandidateStage.ts`
- `server/tests/directorCandidateFallback.test.js`
- `server/tests/directorCandidatePrompt.test.js`

Optional only if required by decomposition:

- a new helper file under `server/src/services/novel/director/`

## Risks

- The upstream proxy may still fail even after fallback, but the failure point will become explicit and later in the chain.
- Candidate patch and candidate generation may not share identical prompt preparation needs; tests must cover both independently.
- The worktree is currently dirty; implementation must remain surgical and avoid touching unrelated pending changes.

## Success Criteria

- Auto-director candidate generation no longer dies immediately at `novel.director.candidates@v1` with native structured `transport_error`.
- Candidate patch path follows the same fallback policy.
- Regression tests pass for candidate-stage fallback behavior.
- Packaged runtime logs confirm the new strategy path is actually present in the rebuilt executable.

## Fresh Verification Notes

- Fresh desktop runtime on `127.0.0.1:54333` confirmed `planner.requestProtocol = openai_compatible` from `/api/llm/model-routes`.
- Shared structured governance is now visible in packaged runtime: `novel.character.castAuto@v1` resumed as `json_schema`, continued through repair, and no longer failed immediately at the old `prompt_json transport_error` layer.
- The resumed packaged auto-director run advanced past `character_setup`, completed `character_cast_apply`, and entered `volume_strategy` and `volume_skeleton`.
- The latest packaged-runtime failure layer changed from `character_setup -> [STRUCTURED_OUTPUT:transport_error] fetch failed` to a live running state in `volume_strategy` / `volume_skeleton` with no new packaged failure recorded yet.
