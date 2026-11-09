# Issue #202

Branch: `fix/issue-202`, based on `origin/main` / `v0.7.1` (`ebee8eef`). Issue read through the GitHub REST API; no `gh` used.

## 修复

- Restrict name-based DeepSeek family/thinking defaults to the built-in DeepSeek provider on its official endpoint. Relay models, including `vendor/deepseek-v4.1-flash`, receive no inferred DeepSeek thinking/effort parameters.
- Turn request-level reasoning off for structured calls to unprobed custom endpoints, including overridden built-in endpoints, independently of known toggle support. Saved probes and user overrides retain priority; plain calls retain their reasoning setting.
- Add regression coverage for both defects, final SDK parameters, and probe overrides. Update the compatibility wiki/module boundary and user-facing release notes/README.

Validation: shared build, server typecheck, server build, and 77 tests across `modelCompatibility`, `reasoningHandling`, `llmProviders`, `structuredInvoke`, `llmFactoryRetryPolicy`, `llmStructuredMaxTokensRoute`, `llmTaskOutputBudget`, and `production/application/llmExecutionScope` all passed. Initial parallel testing hit SQLite WAL initialization locks; the complete selected suite passed serially with a unique temporary database URL and WAL initialization disabled.

No live-provider or UI acceptance performed. Unknown thinking controls are omitted rather than guessed; disabling an endpoint's own default thinking still requires confirmed controls. No data reset, migration, push, or branch merge. Existing `fix202-prompt.md` and `fix202.log` are excluded from the commit.
