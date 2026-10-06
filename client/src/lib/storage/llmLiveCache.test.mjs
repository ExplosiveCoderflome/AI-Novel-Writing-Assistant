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

test('old snapshots keep legacy absence and new cache fields survive storage selection',()=>{const usage={promptTokens:1000,completionTokens:100,totalTokens:1100};const old={context:{interactionId:'old'},phase:'completed',updatedAt:new Date().toISOString(),tokenUsage:usage};const fresh={...old,context:{interactionId:'new'},tokenUsage:{...usage,inputCache:{cacheHitTokens:800,cacheMissTokens:200,cacheWriteTokens:null,cacheUsageStatus:'reported'}}};const [a,b]=selectRecentLlmLiveSessions([old,fresh]);assert.equal(a.tokenUsage.inputCache,undefined);assert.equal(b.tokenUsage.inputCache.cacheHitTokens,800)});
