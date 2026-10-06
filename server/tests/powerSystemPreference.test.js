const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  novelCreateResourceRecommendationSchema,
} = require("../dist/prompting/prompts/novel/resourceRecommendation.promptSchemas.js");
const {
  novelCreateResourceRecommendationPrompt,
} = require("../dist/prompting/prompts/novel/resourceRecommendation.prompts.js");
const {
  buildWorkflowSeedPayload,
} = require("../dist/services/novel/director/runtime/novelDirectorHelpers.js");

const recommendation = {
  summary: "适合当前故事",
  genreId: "genre-1",
  genreReason: "题材匹配",
  primaryStoryModeId: "mode-1",
  primaryStoryModeReason: "推进稳定",
  secondaryStoryModeId: null,
  secondaryStoryModeReason: null,
  powerSystemMode: "none",
  powerSystemReason: "故事依靠关系与信息推进",
  caution: null,
};

const promptInput = {
  userIntentSummary: "现实悬疑故事",
  powerSystemPreference: "ai_recommend",
  genreCatalogText: "1. ID=genre-1",
  storyModeCatalogText: "1. ID=mode-1",
  allowedGenreIds: ["genre-1"],
  allowedStoryModeIds: ["mode-1"],
};

test("power system recommendation accepts none, soft and ranked", () => {
  for (const mode of ["none", "soft", "ranked"]) {
    assert.equal(novelCreateResourceRecommendationSchema.parse({
      ...recommendation,
      powerSystemMode: mode,
    }).powerSystemMode, mode);
  }
});

test("explicit power system preference is a prompt constraint and a deterministic service override", () => {
  const promptMessages = novelCreateResourceRecommendationPrompt.render({
    ...promptInput,
    powerSystemPreference: "none",
  });
  assert.match(promptMessages.map((message) => message.content).join("\n"), /战力体系偏好：none/);

  const serviceSource = fs.readFileSync(path.join(
    __dirname,
    "../src/services/novel/NovelCreateResourceRecommendationService.ts",
  ), "utf8");
  assert.match(serviceSource, /input\.powerSystemPreference !== "ai_recommend"/);
  assert.match(serviceSource, /\? input\.powerSystemPreference\s*:\s*parsed\.powerSystemMode/);
});

test("old workflow seeds default to AI recommendation and explicit choices persist", () => {
  const oldSeed = buildWorkflowSeedPayload({ idea: "旧任务" });
  const explicitSeed = buildWorkflowSeedPayload({ idea: "新任务", powerSystemPreference: "ranked" });

  assert.equal(oldSeed.powerSystemPreference, "ai_recommend");
  assert.equal(oldSeed.basicForm.powerSystemPreference, "ai_recommend");
  assert.equal(explicitSeed.powerSystemPreference, "ranked");
  assert.equal(explicitSeed.basicForm.powerSystemPreference, "ranked");
});

test("world and character prompts preserve the three-mode contract", () => {
  const root = path.resolve(__dirname, "..");
  const worldPrompt = fs.readFileSync(path.join(root, "src/prompting/prompts/world/world.prompts.ts"), "utf8");
  const characterPrompt = fs.readFileSync(path.join(root, "src/prompting/prompts/novel/characterPreparation.prompts.ts"), "utf8");
  const planningRuntime = fs.readFileSync(path.join(root, "src/services/novel/director/workflowStepRuntime/directorPlanningStepModules.ts"), "utf8");

  assert.match(worldPrompt, /none 不得生成境界、等级或升级线/);
  assert.match(worldPrompt, /soft 只生成定性强弱、代价与克制/);
  assert.match(worldPrompt, /ranked 才能生成有序等级及跨级边界/);
  assert.match(characterPrompt, /不设战力体系时 powerLevel、realm 必须留空/);
  assert.match(planningRuntime, /buildPowerSystemConstraint/);
  assert.match(planningRuntime, /storyInput: \[input\.request\.idea, buildPowerSystemConstraint/);
});
