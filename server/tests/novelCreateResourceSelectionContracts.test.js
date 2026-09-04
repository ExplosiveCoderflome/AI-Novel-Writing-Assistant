const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

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
  const service = read("src/services/novel/director/NovelDirectorIdeaInspirationService.ts");
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
