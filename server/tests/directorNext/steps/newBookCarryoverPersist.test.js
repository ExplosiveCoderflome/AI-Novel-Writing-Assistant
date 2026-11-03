const test = require("node:test");
const assert = require("node:assert/strict");
const { loadRuntimeSource } = require("../../novelProduction/sourceHarness.cjs");
const carryover = require("@ai-novel/shared/types/creativeCarryoverContract");

const chapterCountHelpers = loadRuntimeSource("../director/runtime/novelDirectorHelpers.ts", {
  "node:crypto": require("node:crypto"),
  "@ai-novel/shared/types/novelDirector": require("@ai-novel/shared/types/novelDirector"),
  "@ai-novel/shared/types/autoDirectorApproval": require("@ai-novel/shared/types/autoDirectorApproval"),
  "@ai-novel/shared/types/directorCompletion": require("@ai-novel/shared/types/directorCompletion"),
  "../../../title/TitleGenerationService": {},
  "../../../title/titleGeneration.shared": {},
  "../../bookContract": {},
});

function buildContract(adopted) {
  return {
    schemaVersion: 1,
    mode: "adaptation",
    bookAnalysisId: "analysis-1",
    documentId: "doc-1",
    documentVersionId: "doc-version-1",
    documentVersionNumber: 1,
    documentTitle: "参考小说",
    sourceTraits: ["冷峻叙事"],
    bookRealization: ["保留冷峻叙事，换成当代县城背景"],
    openingChapters: [
      { chapterNumber: 1, direction: "主角在雨夜发现第一处异常" },
      { chapterNumber: 2, direction: "异常牵出十年前的旧案" },
      { chapterNumber: 3, direction: "旧案指向主角家人" },
    ],
    basis: [{ sectionKey: "plot_structure", fieldKeys: ["structure"], summary: "三幕递进" }],
    adaptationFocus: {
      hooks: ["雨夜异常"],
      conflictLoops: ["旧案追查"],
      payoffRhythm: ["每三章一次反转"],
      conversionPlan: "把原著的都市悬疑转换为县城悬疑",
    },
    usedSectionKeys: ["plot_structure", "style_technique"],
    generatedAt: "2026-11-03T00:00:00.000Z",
    adopted,
  };
}

function launchWith(contract, created) {
  const { launchNewDirectorBook } = loadRuntimeSource("../../../app/director/newBook.ts", {
    "../../db/prisma": { prisma: { novel: { findUnique: async () => null, update: async () => {} } } },
    "../../services/novel/NovelCoreService": {
      NovelCoreService: class {
        async createNovel(input) { created.push(input); return { id: input.id }; }
      },
    },
    "../../services/settings/LLMSelectionSettingsService": {
      getLLMSelectionSettings: async () => ({ provider: "deepseek", model: "test" }),
    },
    "./services": {
      getDirectorProductionServices: () => ({
        http: { commandService: { execute: async () => ({ runId: "run" }) } },
      }),
    },
    "../../middleware/errorHandler": { AppError: Error },
    "../../services/styleEngine/StyleBindingService": { StyleBindingService: class { async ensureNovelDefault() {} } },
    "../../modules/novel/director-routing": {},
    "../../services/novel/director/runtime/novelDirectorHelpers": chapterCountHelpers,
    "@ai-novel/shared/types/creativeCarryoverContract": carryover,
  });
  return launchNewDirectorBook({
    candidate: { workingTitle: "测试", logline: "故事", targetChapterCount: 60 },
    idea: "测试故事",
    creativeCarryoverContract: contract,
  }, "source", "original_opening");
}

test("adopted carryover contract is persisted on the created novel", async () => {
  const created = [];
  await launchWith(buildContract(true), created);
  assert.equal(created.length, 1);
  assert.equal(created[0].creativeCarryoverContractSchemaVersion, carryover.CREATIVE_CARRYOVER_CONTRACT_SCHEMA_VERSION);
  assert.equal(typeof created[0].creativeCarryoverContractJson, "string");
  const parsed = carryover.parseCreativeCarryoverContract(JSON.parse(created[0].creativeCarryoverContractJson));
  assert.equal(parsed?.adopted, true);
  assert.equal(parsed?.bookAnalysisId, "analysis-1");
});

test("unadopted or missing carryover contract writes no contract fields", async () => {
  for (const contract of [buildContract(false), null]) {
    const created = [];
    await launchWith(contract, created);
    assert.equal(created[0].creativeCarryoverContractJson, null);
    assert.equal(created[0].creativeCarryoverContractSchemaVersion, null);
  }
});
