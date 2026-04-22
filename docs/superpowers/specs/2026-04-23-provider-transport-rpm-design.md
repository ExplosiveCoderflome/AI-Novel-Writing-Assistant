# Provider Transport And RPM Control Design

## Context

The system settings page currently allows each model provider to configure API key, base URL, active model, and a few provider-specific runtime options. It does not yet allow operators to:

1. explicitly choose which transport contract a provider should use at runtime;
2. cap request rate per provider to contain runaway request volume.

This gap became important after abnormal loops caused excessive provider traffic. The product requirement is:

- each provider must expose a configurable transport mode: `openai` or `anthropic`;
- each provider must expose a configurable RPM limit, defaulting to `120`;
- when a provider is over its RPM limit, requests must wait in a queue instead of failing immediately;
- auto director flows must continue by waiting rather than being interrupted by the limiter;
- manual requests should prefer an existing fallback path when one already exists, and otherwise wait.

The implementation for this slice is intentionally **single-instance scoped**. RPM is enforced per running server process, not globally across multiple pods.

## Goals

- Add two provider-level settings in system settings:
  - transport mode
  - RPM limit
- Persist those settings alongside existing provider runtime configuration.
- Make transport resolution honor explicit operator configuration first.
- Add provider-level in-memory RPM throttling with wait queues.
- Ensure auto director requests are queued instead of failing on rate pressure.
- Preserve the current structured fallback mechanism and let it remain the first fallback for structured flows.

## Non-Goals

- No distributed/global RPM coordination across pods.
- No token-per-minute or cost-based throttling.
- No new generic fallback-routing system for all manual chat requests.
- No persisted queue recovery across restarts.
- No attempt to hide AI routing misses with hard-coded keyword fallbacks.

## User-Facing Behavior

### System Settings

Each provider editor gains:

- `调用方式`
  - control type: select
  - options:
    - `OpenAI`
    - `Anthropic`
- `RPM`
  - control type: numeric input
  - default: `120`
  - allowed range:
    - min: `1`
    - max: `6000`

Default transport behavior:

- built-in `anthropic` provider defaults to `anthropic`
- all other built-in providers default to `openai`
- custom providers default to `openai`

### Runtime Request Behavior

- If a provider is under its configured RPM limit, requests continue immediately.
- If a provider reaches its RPM limit:
  - auto director requests enter the provider queue and wait for the next available slot;
  - manual requests use an existing fallback path if that code path already supports one;
  - if no fallback exists, the manual request also waits in the provider queue.
- Requests are released in FIFO order within a provider queue.
- If the process restarts, the in-memory queue is lost.

## Design Choice

The approved design uses **single-instance local throttling**.

Why:

- it is substantially simpler and safer to ship quickly;
- it avoids distributed locking or shared token-bucket coordination;
- it still reduces runaway volume per pod and protects providers from local loops;
- it matches the explicitly approved requirement for this iteration.

Tradeoff:

- with multiple web replicas, effective global RPM can exceed the configured value because each instance enforces its own local limit.

## Data Model

The existing `APIKey` model is the correct persistence location because these are provider runtime settings, not independent global settings.

### Schema Change

Add fields to `APIKey`:

- `transportMode String @default("openai")`
- `rpmLimit Int @default(120)`

### Type-Level Additions

Add a shared transport mode type:

- `ProviderTransportMode = "openai" | "anthropic"`

Extend provider status payloads and provider write payloads to include:

- `transportMode`
- `rpmLimit`

## Backend Architecture

### 1. Provider Settings Persistence

Files affected:

- `server/src/prisma/schema.prisma`
- `server/src/services/settings/secretStore/SecretStore.ts`
- `server/src/services/settings/secretStore/DatabaseSecretStore.ts`
- `server/src/routes/settings.ts`
- `server/src/llm/factory.ts`

Changes:

- extend secret-store read/write contracts with `transportMode` and `rpmLimit`;
- include both fields when listing providers, reading a single provider, and upserting provider settings;
- keep backward compatibility by normalizing missing values to:
  - default transport for the provider
  - RPM `120`

### 2. Explicit Transport Resolution

Current transport logic is inferred from provider/model heuristics. That becomes secondary.

New priority order:

1. explicit provider setting `transportMode`
2. old heuristic fallback for legacy or missing data

This keeps older records safe while allowing operators to override provider behavior explicitly.

Implementation direction:

- extend `ResolvedLLMClientOptions` to carry `transportMode`;
- update transport resolution helpers so they accept an optional explicit override;
- use explicit override in both plain and structured invocations.

### 3. Provider RPM Limiter

Add a dedicated local runtime limiter service, for example:

- `server/src/llm/providerRateLimiter.ts`

Responsibilities:

- maintain per-provider limiter state;
- maintain per-provider FIFO queues;
- track request admission timestamps in a rolling 60-second window or equivalent paced scheduling;
- hand out execution slots asynchronously;
- support cancellation for abandoned requests where practical.

Recommended internal model:

- provider state:
  - `rpmLimit`
  - queue of waiters
  - timestamps of admitted requests within the last 60 seconds
  - current drain scheduling state

API shape:

- `acquireProviderSlot(input): Promise<ReleaseHandle | void>`
- input includes:
  - `provider`
  - `rpmLimit`
  - request classification metadata
  - optional cancellation signal

Important detail:

- the limiter gates **request start**, not request completion;
- no release callback is required for RPM accounting because admission count is time-window based.

### 4. Request Classification

The limiter needs to distinguish request origin only to explain behavior and to support queue/cancellation choices. It does not need separate rate budgets.

Classify requests as:

- `auto_director`
- `manual_structured`
- `manual_chat`
- `other`

Detection:

- auto director requests are identified from existing `taskType` and `promptMeta` usage in auto director flows;
- manual structured requests come through structured invocation code without auto director markers;
- manual chat comes from `/api/chat`;
- anything else falls back to `other`.

### 5. Fallback Behavior

The approved behavior is:

- auto director always queues when the selected provider is at capacity;
- manual requests should use fallback first only when a real fallback path already exists.

That means:

- `invokeStructuredLlmDetailed` keeps its current structured fallback-provider behavior;
- limiter waits happen after fallback choice resolves to the final provider for that attempt;
- `/api/chat` standard streaming does not gain a new invented provider fallback system;
- when `/api/chat` hits a saturated provider, it simply waits in the selected provider queue.

This keeps the implementation aligned with current architecture instead of silently introducing a second routing system.

### 6. Integration Points

The limiter must sit just before the outbound provider call begins.

Primary integration points:

- OpenAI-compatible request path in `createLLMFromResolvedOptions`
- Anthropic transport invocation path in `createAnthropicMessagesTransport`

Preferred integration rule:

- gate at the highest common request entry that reliably covers:
  - plain invoke
  - stream
  - batch
  - structured invoke paths

Practical approach:

- decorate the LLM/transport object with a rate-limited wrapper around `invoke`, `stream`, and `batch`;
- wrapper resolves provider config from already-resolved options and acquires a limiter slot before delegating.

This avoids duplicating queue logic in every route and prompt runner.

## Queue And Wait Policy

### Ordering

- FIFO within each provider.

### Waiting

- auto director requests may wait for an extended period and should not fail merely because the provider is saturated;
- manual requests also wait when no existing fallback path is available.

### Cancellation

- if a manual HTTP request disconnects before admission, its pending queue entry should be cancelled where possible;
- auto director background tasks generally remain queued until admitted.

### Timeouts

Initial policy:

- no short limiter timeout for auto director;
- manual queue wait respects upstream request lifecycle and cancellation;
- internal implementation may include a generous safety timeout to avoid orphaned promises, but it must be long enough not to undermine auto director continuity.

## Validation Rules

### Backend Validation

- `transportMode` must be one of `openai | anthropic`
- `rpmLimit` must be an integer
- `rpmLimit` range:
  - minimum `1`
  - maximum `6000`

### Frontend Validation

- use select for transport mode;
- use number input for RPM;
- prevent empty or non-numeric save payloads;
- show persisted values on reopen.

## Testing Strategy

### Backend

Add tests for:

1. settings API exposes `transportMode` and `rpmLimit`
2. settings API persists both new fields
3. explicit transport mode overrides heuristic transport selection
4. provider limiter queues excess requests instead of failing
5. queued requests are released in FIFO order
6. structured fallback still works when the primary structured attempt cannot proceed
7. auto director-tagged requests wait instead of failing when provider RPM is saturated

Test style:

- unit tests for transport resolution and limiter behavior
- route tests for settings API payloads
- focused runtime tests for limiter queue behavior using deferred promises and controlled timing

### Frontend

Verify:

1. provider settings dialog renders transport mode select
2. provider settings dialog renders RPM input
3. current values are loaded from API response
4. save payload includes both new fields

## Risks

### Multi-Pod Mismatch

Configured RPM is per instance, not global. Operators must understand that two pods can effectively produce about double throughput.

### Queue Growth

If a provider is heavily saturated, local queue size can grow. This implementation intentionally accepts that tradeoff for the single-instance design.

### Long-Lived Manual Requests

Queued manual chat requests can tie up HTTP connections longer than before. Cancellation handling should minimize waste when clients disconnect.

## Rollout Notes

- migration must set defaults for existing provider rows;
- old providers with no explicit transport mode continue to work via normalized defaults;
- no release-note entry is required for the spec-only commit because it is internal design work.

## Acceptance Criteria

- system settings can read and save provider transport mode and RPM;
- runtime transport follows explicit provider setting;
- provider RPM is enforced locally per process;
- over-limit requests queue rather than fail;
- auto director continues through queueing;
- manual structured flows preserve existing fallback behavior;
- manual chat waits when no real fallback path exists;
- tests cover the new settings contract and limiter behavior.
