const test = require("node:test");
const assert = require("node:assert/strict");

const {
  RagContextualChunkService,
  buildSearchText,
} = require("../dist/services/rag/RagContextualChunkService.js");
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

test("buildSearchText prepends context prefix without changing original chunk text", () => {
  assert.equal(buildSearchText("原始正文", ""), "原始正文");
  assert.equal(buildSearchText("原始正文", "角色定位"), "角色定位\n\n原始正文");
});

test("RagContextualChunkService keeps original text when contextual retrieval is disabled", () => withRagConfig({
  contextualRetrievalEnabled: false,
  contextualRetrievalVersion: 3,
}, async () => {
  const service = new RagContextualChunkService(async () => {
    throw new Error("prompt should not run");
  });
  const output = await service.buildContextPrefix({
    document: { ownerType: "novel", ownerId: "novel-1", title: "测试小说" },
    chunkOrder: 0,
    chunkText: "主角拿到铜钥匙。",
  });

  assert.equal(output.contextPrefix, undefined);
  assert.equal(output.contextVersion, 3);
  assert.equal(output.searchText, "主角拿到铜钥匙。");
  assert.equal(output.contextSourceHash.length, 24);
}));

test("RagContextualChunkService stores context metadata and searchText on candidates", () => withRagConfig({
  contextualRetrievalEnabled: true,
  contextualRetrievalVersion: 2,
  contextualRetrievalConcurrency: 1,
}, async () => {
  const service = new RagContextualChunkService(async ({ promptInput }) => ({
    output: {
      contextPrefix: `《${promptInput.title}》角色事实：主角持有后门铜钥匙。`,
    },
    meta: {},
    context: {},
  }));
  const candidates = [{
    id: "chunk-1",
    ownerType: "novel",
    ownerId: "novel-1",
    tenantId: "default",
    title: "测试小说",
    chunkText: "他把铜钥匙收进袖中。",
    chunkHash: "hash",
    chunkOrder: 0,
    tokenEstimate: 12,
    language: "zh",
    metadataJson: JSON.stringify({ chapterOrder: 3 }),
    embedProvider: "test",
    embedModel: "test",
    embedVersion: 1,
  }];

  await service.applyToCandidates({
    candidates,
    documentsByOwner: new Map([[
      "novel:novel-1",
      {
        ownerType: "novel",
        ownerId: "novel-1",
        title: "测试小说",
      },
    ]]),
  });

  const metadata = JSON.parse(candidates[0].metadataJson);
  assert.match(candidates[0].contextPrefix, /铜钥匙/);
  assert.match(candidates[0].searchText, /测试小说/);
  assert.equal(candidates[0].contextVersion, 2);
  assert.equal(metadata.chapterOrder, 3);
  assert.equal(metadata.contextVersion, 2);
  assert.equal(metadata.searchText, candidates[0].searchText);
}));
