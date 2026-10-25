const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveEmbeddingInputTokenLimit,
  resolveEmbeddingChunkTokenBudget,
} = require("../dist/services/rag/embeddingModelLimits.js");
const {
  estimateTokenCount,
  splitRagChunks,
} = require("../dist/services/rag/utils.js");

test("embedding model limits expose the siliconflow bge-large-v1.5 input cap", () => {
  assert.equal(resolveEmbeddingInputTokenLimit("siliconflow", "BAAI/bge-large-zh-v1.5"), 512);
  assert.equal(resolveEmbeddingChunkTokenBudget("siliconflow", "BAAI/bge-large-zh-v1.5"), 435);
  assert.equal(resolveEmbeddingInputTokenLimit("openai", "text-embedding-3-small"), null);
});

test("estimateTokenCount keeps chinese-heavy text close to one token per char", () => {
  assert.equal(estimateTokenCount("深宫夜雨"), 4);
  assert.equal(estimateTokenCount("hello world"), 3);
});

test("splitRagChunks keeps long chinese chunks under the embedding token budget", () => {
  const source = "深宫夜雨，长灯未熄，旧怨与新局同时压来。".repeat(80);
  const maxTokens = resolveEmbeddingChunkTokenBudget("siliconflow", "BAAI/bge-large-zh-v1.5");
  const chunks = splitRagChunks(source, 800, 120, { maxTokens });

  assert.equal(chunks.length > 1, true);
  assert.equal(chunks.every((chunk) => estimateTokenCount(chunk) <= maxTokens), true);
});

test("multi-million-character input has no silent truncation or fixed chunk-count cap", () => {
  const source = "长篇资料".repeat(800_000);
  const chunks = splitRagChunks(source, 200, 0);
  assert.equal(chunks.length, 16_000);
  assert.equal(chunks.join(""), source);
  assert.ok(chunks.every((chunk) => chunk.length <= 200));
});
