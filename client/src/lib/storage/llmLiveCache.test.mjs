import test from "node:test";
import assert from "node:assert/strict";

import { llmLiveCacheKey, loadLlmLiveCache, selectRecentLlmLiveSessions } from "./llmLiveCache.ts";

test("AI 实况本地缓存按作用域隔离并只保留最近 30 次调用", () => {
  const sessions = Array.from({ length: 32 }, (_, index) => ({
    context: { interactionId: `session-${index}` },
    phase: "completed",
    updatedAt: new Date(index * 1_000).toISOString(),
  }));

  assert.equal(llmLiveCacheKey(null), "llm-live:global");
  assert.equal(llmLiveCacheKey(" task-1 "), "llm-live:task-1");
  assert.deepEqual(
    selectRecentLlmLiveSessions(sessions).map((session) => session.context.interactionId),
    sessions.slice(2).map((session) => session.context.interactionId),
  );
});

test("不支持 IndexedDB 的客户端会跳过缓存而不影响实况", async () => {
  assert.deepEqual(await loadLlmLiveCache("llm-live:test"), []);
});
