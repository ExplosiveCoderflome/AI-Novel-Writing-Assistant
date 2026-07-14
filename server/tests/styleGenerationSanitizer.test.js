const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectForbiddenStyleEntities,
  sanitizeStyleContextForGeneration,
} = require("../dist/services/styleEngine/styleGenerationSanitizer.js");
// No additional imports needed for runtimeContextBlocks

function section(key, text) {
  return {
    key,
    title: key,
    summary: text,
    lines: [text],
    text,
    hasContent: Boolean(text),
  };
}

function contractWithSourceEntity() {
  return {
    narrative: section("narrative", "保留强冲突推进，但不要照搬北凉王世子的身份梗。"),
    character: section("character", "人物以行动和对白表现压抑情绪。"),
    language: section("language", "短句推进，减少解释。"),
    rhythm: section("rhythm", "章尾保留悬念。"),
    antiAi: section("antiAi", "避免复用《雪中悍刀行》的角色、称谓和桥段。"),
    selfCheck: section("selfCheck", "确认没有源作品实体。"),
    meta: {
      effectiveStyleProfileId: "style-1",
      taskStyleProfileId: null,
      activeSourceTargets: ["novel"],
      activeSourceLabels: ["style profile"],
      writerIncludedSections: ["narrative", "character", "language", "rhythm", "antiAi", "selfCheck"],
      plannerIncludedSections: ["narrative", "character", "language", "antiAi"],
      droppedSections: [],
      maturity: "structured",
      usesGlobalAntiAiBaseline: false,
      globalAntiAiRuleIds: [],
      styleAntiAiRuleIds: [],
    },
  };
}

function styleContext() {
  return {
    matchedBindings: [{
      id: "binding-1",
      styleProfileId: "style-1",
      targetType: "novel",
      targetId: "novel-1",
      priority: 1,
      weight: 1,
      enabled: true,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      styleProfile: {
        id: "style-1",
        name: "雪中式强冲突写法",
        description: "参考北凉王世子的压迫感，但生成时必须剥离源作品实体。",
        category: "玄幻",
        tags: [],
        applicableGenres: [],
        sourceType: "from_text",
        sourceRefId: null,
        sourceContent: "徐凤年是北凉王世子，相关称谓不能进入新书正文。",
        analysisMarkdown: "禁止复用北凉王世子、徐凤年等源作品实体。",
        status: "active",
        extractedFeatures: [],
        extractionPresets: [],
        extractionAntiAiRuleKeys: [],
        narrativeRules: {},
        characterRules: {},
        languageRules: {},
        rhythmRules: {},
        antiAiRules: [],
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
    }],
    compiledBlocks: {
      context: "",
      style: "",
      character: "",
      antiAi: "",
      output: "",
      selfCheck: "",
      contract: contractWithSourceEntity(),
      mergedRules: {
        narrativeRules: {},
        characterRules: {},
        languageRules: {},
        rhythmRules: {},
      },
      appliedRuleIds: [],
    },
    effectiveStyleProfileId: "style-1",
    taskStyleProfileId: null,
    activeSourceTargets: ["novel"],
    activeSourceLabels: ["style profile"],
    maturity: "structured",
    usesGlobalAntiAiBaseline: false,
    globalAntiAiRuleIds: [],
    styleAntiAiRuleIds: [],
  };
}

test("sanitizeStyleContextForGeneration redacts source entities before writer context", () => {
  const sanitized = sanitizeStyleContextForGeneration(
    styleContext(),
    new Date("2026-05-01T00:00:00.000Z"),
  );

  assert.ok(sanitized.sanitizedGenerationProfile);
  assert.ok(sanitized.sanitizedGenerationProfile.forbiddenEntities.includes("北凉王世子"));
  assert.deepEqual(
    detectForbiddenStyleEntities("主角被误写成北凉王世子。", sanitized),
    ["北凉王世子"],
  );

  const block = sanitized.sanitizedGenerationProfile.writingGuidance.join("\n");
  assert.match(block, /\[source-entity\]/);
  assert.doesNotMatch(block, /北凉王世子/);
  assert.doesNotMatch(block, /徐凤年/);
});
