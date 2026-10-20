const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function recommendationOutput(overrides = {}) {
  return {
    summary: "适合作为开书底座。",
    genreId: "genre-a",
    genreReason: "题材匹配。",
    primaryStoryModeId: "mode-a",
    primaryStoryModeReason: "推进稳定。",
    secondaryStoryModeId: null,
    secondaryStoryModeReason: null,
    powerSystemMode: "none",
    powerSystemReason: "无需等级体系。",
    caution: null,
    ...overrides,
  };
}

function recommendationInput(overrides = {}) {
  return {
    userIntentSummary: "测试开书",
    powerSystemPreference: "ai_recommend",
    genreCatalogText: "",
    storyModeCatalogText: "",
    allowedGenreIds: ["genre-a", "genre-b"],
    allowedStoryModeIds: ["mode-a", "mode-b", "mode-c"],
    ...overrides,
  };
}

test("resource recommendation records user and AI selection sources", () => {
  const shared = read("../shared/types/novelResourceRecommendation.ts");
  const service = read("src/services/novel/NovelCreateResourceRecommendationService.ts");

  assert.match(shared, /"user_selected" \| "ai_recommended"/);
  assert.match(service, /source: selectedGenre \? "user_selected" : "ai_recommended"/);
  assert.match(service, /source: selectedPrimary \? "user_selected" : "ai_recommended"/);
  assert.match(service, /source: selectedSecondary \? "user_selected" : "ai_recommended"/);
});

test("AI secondary mode cannot duplicate the resolved primary mode", () => {
  const service = read("src/services/novel/NovelCreateResourceRecommendationService.ts");

  assert.match(service, /selectedGenre && selectedPrimary && selectedSecondary/);
  assert.match(service, /item\.id !== primary\?\.id/);
});

test("resource recommendation resolves structured catalog ordinals without accepting arbitrary ids", () => {
  const { novelCreateResourceRecommendationPrompt } = require(
    "../dist/prompting/prompts/novel/resourceRecommendation.prompts.js"
  );
  const validate = novelCreateResourceRecommendationPrompt.postValidate;
  assert.equal(typeof validate, "function");

  const resolved = validate(
    recommendationOutput({
      genreId: "2",
      primaryStoryModeId: "3",
      secondaryStoryModeId: "1",
      secondaryStoryModeReason: "补充关系推进。",
    }),
    recommendationInput(),
    {},
  );
  assert.equal(resolved.genreId, "genre-b");
  assert.equal(resolved.primaryStoryModeId, "mode-c");
  assert.equal(resolved.secondaryStoryModeId, "mode-a");

  assert.throws(
    () => validate(recommendationOutput({ genreId: "genre-missing" }), recommendationInput(), {}),
    /题材推荐结果包含非法 ID/,
  );
  assert.throws(
    () => validate(recommendationOutput({ genreId: "3" }), recommendationInput(), {}),
    /题材推荐结果包含非法 ID/,
  );
  for (const invalidOrdinal of ["0", "-1", "02", "2.0"]) {
    assert.throws(
      () => validate(recommendationOutput({ genreId: invalidOrdinal }), recommendationInput(), {}),
      /题材推荐结果包含非法 ID/,
    );
  }
});

test("resource recommendation normalizes numeric catalog ordinals before semantic validation", () => {
  const { novelCreateResourceRecommendationSchema } = require(
    "../dist/prompting/prompts/novel/resourceRecommendation.promptSchemas.js"
  );
  const { novelCreateResourceRecommendationPrompt } = require(
    "../dist/prompting/prompts/novel/resourceRecommendation.prompts.js"
  );
  const parsed = novelCreateResourceRecommendationSchema.parse(recommendationOutput({
    genreId: 2,
    primaryStoryModeId: 3,
    secondaryStoryModeId: 1,
    secondaryStoryModeReason: "补充关系推进。",
  }));
  const resolved = novelCreateResourceRecommendationPrompt.postValidate(
    parsed,
    recommendationInput(),
    {},
  );

  assert.equal(resolved.genreId, "genre-b");
  assert.equal(resolved.primaryStoryModeId, "mode-c");
  assert.equal(resolved.secondaryStoryModeId, "mode-a");
  assert.throws(
    () => novelCreateResourceRecommendationPrompt.postValidate(
      novelCreateResourceRecommendationSchema.parse(recommendationOutput({ genreId: 0 })),
      recommendationInput(),
      {},
    ),
    /题材推荐结果包含非法 ID/,
  );
});

test("resource recommendation prefers an exact numeric id and rejects duplicate normalized modes", () => {
  const { novelCreateResourceRecommendationPrompt } = require(
    "../dist/prompting/prompts/novel/resourceRecommendation.prompts.js"
  );
  const validate = novelCreateResourceRecommendationPrompt.postValidate;

  const exact = validate(
    recommendationOutput({ genreId: "2" }),
    recommendationInput({ allowedGenreIds: ["2", "genre-b"] }),
    {},
  );
  assert.equal(exact.genreId, "2");

  assert.throws(
    () => validate(
      recommendationOutput({
        primaryStoryModeId: "1",
        secondaryStoryModeId: "mode-a",
        secondaryStoryModeReason: "重复项。",
      }),
      recommendationInput(),
      {},
    ),
    /副推进模式不能与主推进模式相同/,
  );
});

test("resource recommendation prompt distinguishes candidate ordinals from stable ids", () => {
  const service = read("src/services/novel/NovelCreateResourceRecommendationService.ts");
  const prompt = read("src/prompting/prompts/novel/resourceRecommendation.prompts.ts");
  const loaders = read("src/prompting/registry/promptAssetLoaderEntries.ts");

  assert.match(service, /候选序号（仅用于定位）/);
  assert.match(service, /ID（选择后必须原样返回）/);
  assert.match(prompt, /version: "v3"/);
  assert.match(prompt, /绝对不能把 1、2、3 等候选序号写进任何 ID 字段/);
  assert.match(loaders, /novel\.create\.resource_recommendation@v3/);
});

function recommendationInputWithCatalogOptions() {
  return recommendationInput({
    allowedGenreIds: [
      "genre_history_root",
      "genre_urban_root",
      "genre_urban_superpower",
      "genre_urban_workplace",
      "genre_urban_life",
    ],
    genreCatalogOptions: [
      { id: "genre_history_root", name: "历史", path: "历史" },
      { id: "genre_urban_root", name: "都市", path: "都市" },
      { id: "genre_urban_superpower", name: "都市异能", path: "都市 / 都市异能" },
      { id: "genre_urban_workplace", name: "都市职场", path: "都市 / 都市职场" },
      { id: "genre_urban_life", name: "都市生活", path: "都市 / 都市生活" },
    ],
    storyModeCatalogOptions: [
      { id: "mode-a", name: "模式甲", path: "模式甲" },
      { id: "mode-b", name: "模式乙", path: "模式乙" },
      { id: "mode-c", name: "模式丙", path: "模式丙" },
    ],
  });
}

test("resource recommendation resolves annotated catalog titles instead of trusting the annotated ordinal (#198)", () => {
  const { novelCreateResourceRecommendationPrompt } = require(
    "../dist/prompting/prompts/novel/resourceRecommendation.prompts.js"
  );
  const validate = novelCreateResourceRecommendationPrompt.postValidate;
  const input = recommendationInputWithCatalogOptions();

  // The #198 report: the model returned "都市生活（1）". The annotated "1" is
  // not the catalog ordinal of 都市生活 (name-sorted flattening puts it last
  // in this list), so resolution must follow the exact catalog title and
  // must not fall back to allowedIds[0].
  assert.equal(
    validate(recommendationOutput({ genreId: "都市生活（1）" }), input, {}).genreId,
    "genre_urban_life",
  );
  // Half-width parentheses and a stray space resolve the same way.
  assert.equal(
    validate(recommendationOutput({ genreId: "都市生活 (2)" }), input, {}).genreId,
    "genre_urban_life",
  );
  // A full catalog path in front of the annotation also resolves by title.
  assert.equal(
    validate(recommendationOutput({ genreId: "都市 / 都市生活（3）" }), input, {}).genreId,
    "genre_urban_life",
  );
  // The annotated title wins over a conflicting ordinal for root entries too.
  assert.equal(
    validate(recommendationOutput({ genreId: "都市（4）" }), input, {}).genreId,
    "genre_urban_root",
  );
  // Story mode fields share the same resolver.
  assert.equal(
    validate(
      recommendationOutput({ genreId: "genre_urban_root", primaryStoryModeId: "模式乙（1）" }),
      input,
      {},
    ).primaryStoryModeId,
    "mode-b",
  );
});

test("resource recommendation keeps annotated ids deterministic when the title is unknown (#198)", () => {
  const { novelCreateResourceRecommendationPrompt } = require(
    "../dist/prompting/prompts/novel/resourceRecommendation.prompts.js"
  );
  const validate = novelCreateResourceRecommendationPrompt.postValidate;
  const input = recommendationInputWithCatalogOptions();

  // Unknown title: fall back to the annotated ordinal, mirroring the bare
  // ordinal rule that already exists.
  assert.equal(
    validate(recommendationOutput({ genreId: "不存在的题材（2）" }), input, {}).genreId,
    "genre_urban_root",
  );
  // Out-of-range annotated ordinals still fail validation.
  assert.throws(
    () => validate(recommendationOutput({ genreId: "不存在的题材（99）" }), input, {}),
    /题材推荐结果包含非法 ID/,
  );
  assert.throws(
    () => validate(recommendationOutput({ genreId: "不存在的题材（02）" }), input, {}),
    /题材推荐结果包含非法 ID/,
  );
  // Without catalog options the annotated form stays invalid, exactly as before.
  assert.throws(
    () => validate(recommendationOutput({ genreId: "都市生活（1）" }), recommendationInput(), {}),
    /题材推荐结果包含非法 ID/,
  );
});

test("candidate workflow persists the resolved production foundation for recovery", () => {
  const stage = read("src/services/novel/director/phases/novelDirectorCandidateStage.ts");
  const directorTypes = read("../shared/types/novelDirector.ts");

  assert.match(directorTypes, /productionFoundation\?: NovelCreateResourceRecommendation/);
  assert.match(stage, /productionFoundation: foundation\.recommendation/);
});

test("idea inspiration prompt treats readable creation foundations as fixed constraints", () => {
  const context = read("src/services/novel/director/idea/ideaContext.ts");
  const prompt = read("src/prompting/prompts/novel/ideaInspiration.prompts.ts");
  const route = read("src/services/novel/director/http/novelDirector.ts");

  assert.match(context, /line\("主推进模式", input\.primaryStoryModeLabel/);
  assert.match(context, /line\("主推进说明", input\.primaryStoryModeDescription\)/);
  assert.match(route, /primaryStoryModeDescription: z\.string\(\)\.trim\(\)\.max\(1000\)\.optional\(\)/);
  assert.match(prompt, /用户确认的固定创作基础，五条想法都必须遵守/);
  assert.match(prompt, /不得通过更换已确认的题材与推进方式制造差异/);
});

test("idea inspirations bound creative sampling and retry with the original context", () => {
  const service = read("src/services/novel/director/idea/NovelDirectorIdeaInspirationService.ts");
  const context = read("src/services/novel/director/idea/ideaContext.ts");
  const prompt = read("src/prompting/prompts/novel/ideaInspiration.prompts.ts");
  const schema = read("src/prompting/prompts/novel/ideaInspiration.promptSchemas.ts");
  const loaders = read("src/prompting/registry/promptAssetLoaderEntries.ts");

  assert.match(service, /Math\.min\(0\.8, Math\.max\(0\.55/);
  assert.match(service, /maxTokens: IDEA_INSPIRATION_MAX_TOKENS/);
  assert.match(context, /error instanceof StructuredOutputError && error\.category !== "transport_error"/);
  assert.match(service, /runIdeaInspirationPrompt\(input, IDEA_INSPIRATION_RETRY_TEMPERATURE\)/);
  assert.match(prompt, /version: "v3"/);
  assert.match(prompt, /maxAttempts: 0/);
  assert.match(prompt, /structuredOutputHint/);
  assert.match(schema, /z\.enum\(directorIdeaInspirationAngles\)/);
  assert.match(loaders, /novel\.director\.idea_inspiration@v3/);
});

test("idea constellation generates seven concrete web-novel material categories through AI", () => {
  const shared = read("../shared/types/novelDirector.ts");
  const service = read("src/services/novel/director/idea/NovelDirectorIdeaConstellationService.ts");
  const prompt = read("src/prompting/prompts/novel/ideaConstellation/ideaConstellation.prompts.ts");
  const schema = read("src/prompting/prompts/novel/ideaConstellation/ideaConstellation.promptSchemas.ts");
  const route = read("src/services/novel/director/http/novelDirector.ts");
  const loaders = read("src/prompting/registry/promptAssetLoaderEntries.ts");
  const controller = read("../client/src/pages/novels/autoDirector/useAutoDirectorCreateController.ts");
  const dialog = read("../client/src/pages/novels/autoDirector/ideaConstellation/StoryConstellationDialog.tsx");

  assert.match(shared, /"advantage"/);
  assert.match(schema, /options: z\.array\(directorIdeaConstellationOptionSchema\)\.length\(35\)/);
  assert.match(schema, /label: z\.string\(\)\.trim\(\)\.min\(2\)\.max\(48\)/);
  assert.match(schema, /count !== 5/);
  assert.match(route, /label: z\.string\(\)\.trim\(\)\.min\(2\)\.max\(48\)/);
  assert.match(route, /selectedOptions: z\.array\(ideaConstellationSelectionSchema\)\.min\(1\)\.max\(7\)/);
  assert.match(route, /categories\.size !== input\.selectedOptions\.length/);
  assert.match(prompt, /advantage 金手指或核心优势/);
  assert.match(prompt, /严禁输出“所有人活在谎言里/);
  assert.match(service, /buildDirectorIdeaContextSummary/);
  assert.match(service, /CONSTELLATION_OPTIONS_MAX_TOKENS = 5_000/);
  assert.match(service, /CONSTELLATION_RETRY_TEMPERATURE/);
  assert.match(loaders, /novel\.director\.idea_constellation_options@v3/);
  assert.match(loaders, /novel\.director\.idea_constellation_compose@v2/);
  assert.match(controller, /generateDirectorIdeaConstellationOptions\(buildIdeaContextPayload\(\)\)/);
  assert.doesNotMatch(controller, /buildStaticIdeaConstellationOptions/);
  assert.match(dialog, /const plotOptions = orderedOptions/);
  assert.match(dialog, /selected\.length}\/7 类开书素材/);
});
