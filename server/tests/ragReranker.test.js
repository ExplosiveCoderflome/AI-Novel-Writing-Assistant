const test = require("node:test");
const assert = require("node:assert/strict");

const {
  RagRerankerService,
  resolveRerankerCandidateLimit,
} = require("../dist/services/rag/RagRerankerService.js");
const {
  HybridRetrievalService,
} = require("../dist/services/rag/HybridRetrievalService.js");
const { ragConfig } = require("../dist/config/rag.js");

function withRagConfig(patch, run) {
  const previous = {};
  for (const key of Object.keys(patch)) {
    previous[key] = ragConfig[key];
    ragConfig[key] = patch[key];
  }
  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const key of Object.keys(previous)) {
        ragConfig[key] = previous[key];
      }
    });
}

function makeChunk(id, score, chunkOrder = 1) {
  return {
    id,
    ownerType: "novel",
    ownerId: "novel-1",
    score,
    title: "测试小说",
    chunkText: `chunk ${id}`,
    chunkOrder,
    source: "vector",
  };
}

test("resolveRerankerCandidateLimit follows override, config, then finalTopK heuristic", () => withRagConfig({
  rerankerCandidateLimit: 0,
}, () => {
  assert.equal(resolveRerankerCandidateLimit(8), 40);
  assert.equal(resolveRerankerCandidateLimit(2), 30);
  assert.equal(resolveRerankerCandidateLimit(30), 80);
  assert.equal(resolveRerankerCandidateLimit(8, 12), 12);
}));

test("RagRerankerService.applyResults supports id and index matches without duplicating chunks", () => {
  const service = new RagRerankerService();
  const rows = [
    makeChunk("a", 0.1, 1),
    makeChunk("b", 0.2, 2),
    makeChunk("c", 0.3, 3),
  ];

  const reranked = service.applyResults(rows, [
    { id: "c", relevanceScore: 0.98 },
    { index: 0, relevanceScore: 0.88 },
    { id: "missing", relevanceScore: 0.77 },
    { index: 0, relevanceScore: 0.66 },
  ]);

  assert.deepEqual(reranked.map((item) => item.id), ["c", "a", "b"]);
  assert.equal(reranked[0].source, "reranked");
  assert.equal(reranked[0].score, 0.98);
  assert.equal(reranked[1].score, 0.88);
});

test("RagRerankerService.rerank fail-opens on endpoint errors", () => withRagConfig({
  rerankerEnabled: true,
  rerankerEndpoint: "https://reranker.local/rerank",
  rerankerApiKey: "",
}, async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 503,
    text: async () => "unavailable",
  });
  try {
    const output = await new RagRerankerService().rerank({
      query: "角色目标",
      topK: 2,
      documents: [{ id: "a", text: "A", ownerType: "novel", ownerId: "n1" }],
    });
    assert.equal(output.used, false);
    assert.equal(output.results.length, 0);
    assert.match(output.error, /503/);
  } finally {
    global.fetch = previousFetch;
  }
}));

test("HybridRetrievalService runs vector/RRF before reranker and returns reranked topK", () => withRagConfig({
  enabled: true,
  rerankerEnabled: true,
  rerankerCandidateLimit: 3,
}, async () => {
  const embeddingService = {
    embedTexts: async () => ({ vectors: [[1, 2, 3]], provider: "test", model: "test-embed" }),
  };
  const vectorStoreService = {
    ensureCollection: async () => {},
    search: async () => [
      {
        id: "a",
        score: 0.9,
        payload: {
          ownerType: "novel",
          ownerId: "novel-1",
          title: "测试小说",
          chunkText: "A",
          chunkOrder: 1,
        },
      },
      {
        id: "b",
        score: 0.8,
        payload: {
          ownerType: "novel",
          ownerId: "novel-1",
          title: "测试小说",
          chunkText: "B",
          chunkOrder: 2,
          contextPrefix: "角色状态上下文",
        },
      },
      {
        id: "c",
        score: 0.7,
        payload: {
          ownerType: "novel",
          ownerId: "novel-1",
          title: "测试小说",
          chunkText: "C",
          chunkOrder: 3,
        },
      },
    ],
  };
  const rerankerService = {
    rerank: async (input) => {
      assert.deepEqual(input.documents.map((item) => item.id), ["a", "b", "c"]);
      assert.match(input.documents[1].text, /角色状态上下文/);
      return {
        used: true,
        results: [
          { id: "b", relevanceScore: 0.99 },
          { id: "a", relevanceScore: 0.88 },
        ],
      };
    },
    applyResults: (chunks, results) => new RagRerankerService().applyResults(chunks, results),
  };

  const service = new HybridRetrievalService(embeddingService, vectorStoreService, rerankerService);
  const rows = await service.retrieve("问", {
    ownerTypes: ["novel"],
    finalTopK: 2,
  });

  assert.deepEqual(rows.map((item) => item.id), ["b", "a"]);
  assert.equal(rows[0].source, "reranked");
  assert.equal(rows[0].score, 0.99);
}));
