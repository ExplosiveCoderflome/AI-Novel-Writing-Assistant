const test = require("node:test");
const assert = require("node:assert/strict");
const { creatorProfileService } = require("../dist/platform/profile/CreatorProfileService.js");
const { BUILTIN_CREATOR_PRESETS } = require("../dist/platform/profile/creatorProfileTypes.js");

test("PAI Insight 5: TELOS Creator Profile System & Aesthetic Presets", async (t) => {
  await t.test("loads builtin aesthetic preset xuanyi cleanly", async () => {
    const loaded = await creatorProfileService.loadPresetProfile("xuanyi");
    assert.equal(loaded.activePreset, "xuanyi");
    assert.equal(loaded.profile.mission, BUILTIN_CREATOR_PRESETS.xuanyi.profile.mission);
    assert.ok(loaded.profile.learnedTaboos.length > 0);
  });

  await t.test("formats TELOS Profile into standardized Context Block", async () => {
    await creatorProfileService.saveProfile({
      creatorName: "Test Creator",
      activePreset: null,
      profile: {
        narrativeTone: "冷峻克制、感官细节丰富",
        writingStrategies: ["前500字抛出线索钩子"],
        learnedTaboos: ["严禁机械降神", "少用说教语气"],
        mission: "讲述凡人逆天改命的过程",
      },
    });

    const formatted = await creatorProfileService.getFormattedCreatorProfileContext();
    assert.match(formatted, /=== \[CREATOR TELOS PROFILE - Personal Style & Learned Taboos\] ===/);
    assert.match(formatted, /冷峻克制/);
    assert.match(formatted, /严禁机械降神/);
    assert.match(formatted, /前500字抛出线索钩子/);
  });

  await t.test("parses natural language interview text into structured TELOS fields", () => {
    const input = `讨厌：严禁主角无脑圣母\n风格：霓虹阴冷、感官细节丰富\n习惯：开头必须出现可见冲突钩子`;
    const parsed = creatorProfileService.parseInterviewInput(input);

    assert.equal(parsed.narrativeTone, "霓虹阴冷、感官细节丰富");
    assert.ok(parsed.learnedTaboos.includes("严禁主角无脑圣母"));
    assert.ok(parsed.writingStrategies.includes("习惯：开头必须出现可见冲突钩子"));
  });

  await t.test("returns fallback empty string cleanly when no creator profile fields exist", async () => {
    await creatorProfileService.saveProfile({
      creatorName: "Empty Creator",
      activePreset: null,
      profile: {},
    });

    const formatted = await creatorProfileService.getFormattedCreatorProfileContext();
    assert.equal(formatted, "");
  });
});
