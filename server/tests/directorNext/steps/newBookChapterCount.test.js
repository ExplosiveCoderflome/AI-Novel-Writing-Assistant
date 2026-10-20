const test = require("node:test");
const assert = require("node:assert/strict");
const { loadRuntimeSource } = require("../../novelProduction/sourceHarness.cjs");

// Exercise the real normalizer without loading unrelated DB or model adapters.
const chapterCountHelpers = loadRuntimeSource("../director/runtime/novelDirectorHelpers.ts", {
  "node:crypto": require("node:crypto"),
  "@ai-novel/shared/types/novelDirector": require("@ai-novel/shared/types/novelDirector"),
  "@ai-novel/shared/types/autoDirectorApproval": require("@ai-novel/shared/types/autoDirectorApproval"),
  "@ai-novel/shared/types/directorCompletion": require("@ai-novel/shared/types/directorCompletion"),
  "../../../title/TitleGenerationService": {},
  "../../../title/titleGeneration.shared": {},
  "../../bookContract": {},
});

for (const scenario of [
  { name: "AI recommended count", candidateCount: 12, expected: 12 },
  { name: "author's explicit count", candidateCount: 12, explicitCount: 80, expected: 80 },
  { name: "default count when both counts are absent", expected: 80 },
]) {
  test(`new book and frozen execution share ${scenario.name}`, async () => {
    const created = [], commands = [];
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
          http: { commandService: { execute: async command => { commands.push(command); return { runId: "run" }; } } },
        }),
      },
      "../../middleware/errorHandler": { AppError: Error },
      "../../services/styleEngine/StyleBindingService": { StyleBindingService: class { async ensureNovelDefault() {} } },
      "../../modules/novel/director-routing": {},
      "../../services/novel/director/runtime/novelDirectorHelpers": chapterCountHelpers,
    });
    await launchNewDirectorBook({
      candidate: { workingTitle: "测试", logline: "故事", targetChapterCount: scenario.candidateCount },
      idea: "测试故事",
      runMode: "full_book_autopilot",
      estimatedChapterCount: scenario.explicitCount,
    }, "source", "original_opening");
    assert.equal(created.length, 1);
    assert.equal(commands.length, 1);
    assert.equal(created[0].estimatedChapterCount, scenario.expected);
    assert.equal(commands[0].launchInput.estimatedChapterCount, scenario.expected);
    assert.deepEqual(commands[0].launchInput.executionRange, { from: 1, to: scenario.expected });
  });
}
