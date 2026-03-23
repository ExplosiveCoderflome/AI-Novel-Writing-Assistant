# LLM Schema Refactor Checkpoint

Date: 2026-03-23

## Purpose

This checkpoint marks the current codebase changes as part of a repo-wide LLM schema refactor rather than a set of isolated feature patches.

The goal of this refactor is to move structured LLM output handling onto a shared foundation:

- shared schema definitions per domain
- shared structured invoke / repair flow
- provider capability awareness for JSON output
- less ad-hoc `JSON.parse + try/catch + local normalization` scattered across services

## Why This Needs A Special Record

This batch touches multiple domains at the same time:

- planner
- novel core / chapter summary
- world / world visualization / world reference
- audit
- book analysis
- character
- genre
- style detection
- title generation
- Creative Hub and route entry points

Because the change is horizontal and architectural, a normal feature note is not enough. Future changes should recognize this commit as a migration checkpoint for the overall LLM schema layer.

## Main Structural Changes

### 1. Shared structured invoke path

New shared entry points have been introduced under `server/src/llm/`:

- `structuredInvoke.ts`
- `schemaHelpers.ts`

These files centralize:

- structured output invocation
- JSON extraction
- truncated JSON repair
- Zod validation
- one-step repair retry through LLM when schema validation fails

### 2. Provider JSON capability layer

`server/src/llm/capabilities.ts` now acts as the capability gate for provider/model JSON behavior, instead of leaving each service to guess whether a model supports forced JSON output.

This is intended to become the single place that answers:

- whether a provider supports `json_object`
- whether a provider supports schema-level JSON output
- whether a specific model family needs extra guarding

### 3. Domain schema split

Schema files are being extracted from business services into dedicated schema modules, including but not limited to:

- `server/src/services/audit/auditSchemas.ts`
- `server/src/services/bookAnalysis/bookAnalysisSchemas.ts`
- `server/src/services/character/characterSchemas.ts`
- `server/src/services/genre/genreSchemas.ts`
- `server/src/services/novel/chapterSummarySchemas.ts`
- `server/src/services/novel/novelCoreSchemas.ts`
- `server/src/services/planner/plannerSchemas.ts`
- `server/src/services/state/stateSchemas.ts`
- `server/src/services/title/titleSchemas.ts`
- `server/src/services/world/worldSchemas.ts`
- `server/src/services/world/worldReferenceSchema.ts`
- `server/src/services/world/worldVisualizationSchema.ts`

The intended direction is:

- business services own prompts, orchestration and persistence
- schema modules own structured output contracts

### 4. Service migration away from local parsing

Several services have been moved away from domain-local LLM parsing helpers and toward the shared schema/invoke path. This is visible in book analysis, planner, novel core, title generation, world-related services, style detection and related route wiring.

## Current Status

This checkpoint should be treated as:

- an in-progress architectural migration
- not the final stable end state
- suitable to commit as a milestone boundary

What is already true:

- the repo now has a visible shared LLM schema layer
- multiple domains have started migrating onto it
- provider capability handling is no longer fully scattered

What is not fully finished yet:

- some old normalization paths still coexist with the new schema path
- not every service has been migrated to the same strictness level
- some schema files are intentionally tolerant and will still need tightening after more real-output validation

## Guardrail For Follow-up Work

After this checkpoint, new LLM-facing development should prefer:

1. define or extend a schema module first
2. route generation through shared structured invoke
3. keep deterministic cleanup as post-processing only
4. avoid adding new one-off JSON parsing branches inside business services

If a later change needs structured output in a new domain, it should build on this layer instead of reintroducing local ad-hoc parsing.

## Commit Intent

This checkpoint exists so the current code can be recognized later as:

- the start of the repo-wide LLM schema migration
- a deliberate architectural boundary
- a safe point for continued migration in later commits
