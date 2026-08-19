# Regression Test Discovered Issues

The following issues were discovered during the regression test execution. Per user instructions, all mocks were disabled, and the test suite was stopped upon encountering a blocking failure.

---

## Issue 1: RAG Qdrant Service Offline (Blocking Failure)

### Description
The RAG indexing health check fails because the backend Qdrant vector database is offline (unreachable at `http://127.0.0.1:6333`).

### Severity
**BLOCKER** (Stops regression testing at Step 5.1 - Knowledge Base Upload)

### Steps to Reproduce
1. Reset database and configure LLM/embedding routing to local Ollama.
2. Start the dev server (`pnpm dev:raw`).
3. Query the RAG health endpoint:
   ```bash
   curl http://localhost:3000/api/rag/health
   ```
4. Observe the response:
   ```json
   {
     "success": false,
     "data": {
       "embedding": {
         "ok": true,
         "provider": "ollama",
         "model": "embeddinggemma:latest"
       },
       "qdrant": {
         "ok": false,
         "detail": "fetch failed"
       },
       "ok": false
     },
     "message": "RAG health check failed."
   }
   ```

### Impact
Since Qdrant is offline, any attempt to upload `红楼梦.txt` to the knowledge base will fail to index (its `RagIndexJob` status will permanently fail), which blocks worldview generation and subsequent novel/comic/video creation steps that rely on knowledge base context retrieval.

### Action Plan / Recommended Solution
1. Ensure a local Qdrant container is started before running regression tests:
   ```bash
   docker run -p 6333:6333 -p 6334:6334 -v qdrant_storage:/qdrant/storage qdrant/qdrant
   ```
2. Once Qdrant is running, re-run the regression test suite.

---

## Issue 2: Test Automation File Upload Limitation (UI Tooling)

### Description
The browser subagent environment (Jetski/Playwright) is unable to interact with custom or hidden file input zones to upload `红楼梦.txt` programmatically. Attempts to simulate text entry of the file path failed because of non-ASCII unicode characters in `红楼梦` causing key entry errors in the automation tool (`playwright: Unknown key: "红"`).

### Severity
**HIGH** (Blocks automated UI simulation of file uploads)

### Steps to Reproduce
1. Spawn a browser subagent to click the upload button on `/knowledge`.
2. Try to type `c:/Users/lilin/GeneralAgent/红楼梦.txt` or simulate file choosing.
3. Observe key mapping error from Playwright automation driver.

### Action Plan / Recommended Solution
Provide a dedicated CLI testing script or backend API endpoint simulation for automated regression test suites rather than relying entirely on browser subagent GUI clicks, or rename test assets to use ASCII characters (e.g. `hongloumeng.txt`) and mount file inputs explicitly.

---

## Issue 3: UI Fallback Status Label Rendering Bug (Resolved)

### Description
The left-panel badge above "驾驶舱" (Cockpit) and under "版本历史" (Version History) rendered raw React/JSX code `{fallbackStatusLabel ?? "未开启"}` instead of the evaluated value. Similarly, the circuit breaker error container rendered `{circuitBreaker.message || "..."}` as literal text.

### Severity
**MEDIUM** (Visual regression in workspace layout)

### Status
**RESOLVED** - Cleaned up the hardcoded code string in `client/src/locales/zh/translation.json` and implemented correct JSX ternary/fallback logic in `AICockpit.tsx`. Verified to show "空闲" (Idle) correctly via live screenshot.

---

## Issue 4: Auto-Director Pipeline Failure under local Ollama constraint (Blocking Failure)

### Description
The automated regression testing is blocked at Step 4.3 (Chapter Drafting) due to two cascading failures:
1. **Schema Validation Constraint**: The local Ollama `gemma4:e4b` model generated too few chapters (6 chapters) for the rhythm outline split, which violated the database schema constraint (`chapters: Too small: expected array to have >=20 items`). This caused the automatic task `cmrra7uyw0016rgi9wlhm0hmr` to fail.
2. **Model Availability Circuit Breaker Fallback**: When the task failed, the Auto-Director's circuit breaker attempted to switch to fallback models (`deepseek-r1:8b`, `qwen3:8b`, `gemma4:latest`, `llama3.2`) in the provider list. Because these models do not exist in the local Ollama environment, they immediately failed with `404 model not found` transport errors, terminating the autopilot run and requiring manual takeover.

### Severity
**BLOCKER** (Stops regression testing at Step 5.3 - Outline Planning and Draft Generation)

### Steps to Reproduce
1. Start the auto-director autopilot mode under a local-only Ollama configuration containing only `gemma4:e4b`.
2. Let the director run the "节奏 / 拆章" stage.
3. Observe the task failing with schema constraints and then immediately throwing `404 model not found` errors.

### Action Plan / Recommended Solution
1. **Adjust Chapter Count Thresholds**: Make chapter list generation count constraints configurable or dynamic based on the project size/settings (e.g. allowing shorter novels with < 20 chapters for regression testing / beginners).
2. **Handle Missing Fallback Models**: Prevent the circuit breaker from switching to models not present in the local Ollama registry when the environment is configured as local-only, or gracefully fall back to the primary model after warning the user.

