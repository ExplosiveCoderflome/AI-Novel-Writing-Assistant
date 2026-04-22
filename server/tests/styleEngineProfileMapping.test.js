const test = require("node:test");
const assert = require("node:assert/strict");
const { mapStyleProfileRow } = require("../dist/services/styleEngine/helpers.js");

test("mapStyleProfileRow derives extraction presets and rule set from selected feature decisions", () => {
  const profile = mapStyleProfileRow({
    id: "style-profile-1",
    name: "现实流",
    description: "测试写法",
    category: "现实",
    tagsJson: JSON.stringify(["口语"]),
    applicableGenresJson: JSON.stringify(["都市"]),
    sourceType: "from_text",
    sourceRefId: null,
    sourceContent: "测试文本内容",
    extractedFeaturesJson: JSON.stringify([
      {
        id: "feature-1",
        group: "language",
        label: "口语化短句",
        description: "语言更偏口语和短句推进。",
        evidence: "他抬手骂了一句，后半句没说完。",
        importance: 0.8,
        imitationValue: 0.7,
        transferability: 0.5,
        fingerprintRisk: 0.65,
        enabled: true,
        selectedDecision: "weaken",
        keepRulePatch: {
          languageRules: {
            register: "colloquial",
          },
        },
        weakenRulePatch: {
          languageRules: {
            summary: "保留轻度口语感",
          },
        },
      },
    ]),
    extractionPresetsJson: null,
    extractionAntiAiRuleKeysJson: JSON.stringify(["rule-1"]),
    selectedExtractionPresetKey: "balanced",
    analysisMarkdown: "分析结果",
    status: "active",
    narrativeRulesJson: null,
    characterRulesJson: null,
    languageRulesJson: null,
    rhythmRulesJson: null,
    antiAiBindings: [],
    createdAt: new Date("2026-04-22T10:00:00.000Z"),
    updatedAt: new Date("2026-04-22T10:05:00.000Z"),
  });

  assert.equal(profile.extractedFeatures.length, 1);
  assert.equal(profile.extractedFeatures[0].selectedDecision, "weaken");
  assert.equal(profile.languageRules.summary, "保留轻度口语感");
  assert.deepEqual(
    profile.extractionPresets.map((item) => item.key),
    ["imitate", "balanced", "transfer"],
  );
  assert.deepEqual(profile.extractionAntiAiRuleKeys, ["rule-1"]);
  assert.equal(profile.selectedExtractionPresetKey, "balanced");
});
