const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");
const { StyleCompiler } = require("../dist/services/styleEngine/StyleCompiler.js");
const { StyleProfileService } = require("../dist/services/styleEngine/StyleProfileService.js");
const { StyleBindingService } = require("../dist/services/styleEngine/StyleBindingService.js");
const { StyleDetectionService } = require("../dist/services/styleEngine/StyleDetectionService.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(server.address().port);
    });
  });
}

function buildRule(id) {
  return {
    id,
    key: `rule-${id}`,
    name: `Rule ${id}`,
    type: "forbidden",
    severity: "high",
    description: "禁止直接解释人物心理。",
    detectPatterns: [],
    rewriteSuggestion: "改成动作与对白。",
    promptInstruction: "直接解释人物心理。",
    autoRewrite: true,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

test("StyleCompiler changes anti-ai tone by weight", () => {
  const compiler = new StyleCompiler();
  const baseInput = {
    styleProfile: {
      narrativeRules: { summary: "动作先于解释" },
      characterRules: {},
      languageRules: {},
      rhythmRules: {},
    },
    antiAiRules: [buildRule("rule-1")],
  };

  const strong = compiler.compile({ ...baseInput, weight: 0.9 });
  const medium = compiler.compile({ ...baseInput, weight: 0.5 });

  assert.match(strong.antiAi, /禁止/);
  assert.match(medium.antiAi, /谨慎避免/);
});

test("StyleCompiler emits layered binding context and section-level strength", () => {
  const compiler = new StyleCompiler();
  const compiled = compiler.compile({
    styleProfile: {
      narrativeRules: { summary: "动作先行" },
      characterRules: { emotionExpression: "克制外露" },
      languageRules: {},
      rhythmRules: {},
    },
    antiAiRules: [buildRule("rule-2")],
    weight: 0.7,
    bindingSummaries: [
      {
        styleProfileId: "style-novel",
        styleProfileName: "底层写法",
        targetType: "novel",
        priority: 1,
        weight: 0.6,
      },
      {
        styleProfileId: "style-task",
        styleProfileName: "临时任务覆盖",
        targetType: "task",
        priority: 999,
        weight: 1,
      },
    ],
    sectionWeights: {
      narrativeRules: { summary: 1 },
      characterRules: { emotionExpression: 0.6 },
    },
    antiAiRuleWeights: {
      "rule-2": 1,
    },
  });

  assert.match(compiled.context, /写法生效层级/);
  assert.match(compiled.context, /本次生成 -> 临时任务覆盖/);
  assert.match(compiled.style, /叙事\.summary：必须保持 动作先行/);
  assert.match(compiled.character, /角色\.emotionExpression：可适度保留 克制外露/);
});

test("style engine routes return mocked payloads", async () => {
  const originalMethods = {
    listProfiles: StyleProfileService.prototype.listProfiles,
    extractFromText: StyleProfileService.prototype.extractFromText,
    createFromText: StyleProfileService.prototype.createFromText,
    createProfileFromExtraction: StyleProfileService.prototype.createProfileFromExtraction,
    createFromBookAnalysis: StyleProfileService.prototype.createFromBookAnalysis,
    createBinding: StyleBindingService.prototype.createBinding,
    check: StyleDetectionService.prototype.check,
  };

  const fakeProfile = {
    id: "style-1",
    name: "现实流",
    description: "测试写法",
    category: "现实",
    tags: ["口语"],
    applicableGenres: ["都市"],
    sourceType: "manual",
    sourceRefId: null,
    sourceContent: null,
    extractedFeatures: [],
    extractionPresets: [],
    extractionAntiAiRuleKeys: [],
    selectedExtractionPresetKey: null,
    analysisMarkdown: "分析",
    status: "active",
    narrativeRules: {},
    characterRules: {},
    languageRules: {},
    rhythmRules: {},
    antiAiRules: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const fakeDraft = {
    name: "现实流提取草稿",
    description: "高保真特征池",
    category: "现实",
    tags: ["口语", "压迫感"],
    applicableGenres: ["都市"],
    analysisMarkdown: "提取到了完整特征。",
    summary: "已提取全部特征，可按需保留。",
    antiAiRuleKeys: ["rule-1"],
    features: [{
      id: "feature-1",
      group: "language",
      label: "口语化短句",
      description: "语言更偏口语和短句推进。",
      evidence: "他抬手骂了一句，后半句没说完。",
      importance: 0.8,
      imitationValue: 0.9,
      transferability: 0.7,
      fingerprintRisk: 0.4,
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
    }],
    presets: [{
      key: "balanced",
      label: "平衡保留",
      summary: "默认平衡方案",
      decisions: [{ featureId: "feature-1", decision: "keep" }],
    }],
  };

  const fakeExtractedProfile = {
    ...fakeProfile,
    sourceType: "from_text",
    sourceContent: "娴嬭瘯鏂囨湰鍐呭",
    extractedFeatures: [{
      ...fakeDraft.features[0],
      enabled: true,
      selectedDecision: "keep",
    }],
    extractionPresets: fakeDraft.presets,
    extractionAntiAiRuleKeys: fakeDraft.antiAiRuleKeys,
    selectedExtractionPresetKey: null,
  };

  StyleProfileService.prototype.listProfiles = async () => [fakeProfile];
  StyleProfileService.prototype.extractFromText = async () => fakeDraft;
  StyleProfileService.prototype.createFromText = async () => fakeExtractedProfile;
  StyleProfileService.prototype.createProfileFromExtraction = async () => fakeProfile;
  StyleProfileService.prototype.createFromBookAnalysis = async () => fakeProfile;
  StyleBindingService.prototype.createBinding = async () => ({
    id: "binding-1",
    styleProfileId: fakeProfile.id,
    targetType: "chapter",
    targetId: "chapter-1",
    priority: 5,
    weight: 1,
    enabled: true,
    styleProfile: fakeProfile,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  StyleDetectionService.prototype.check = async () => ({
    riskScore: 72,
    summary: "存在解释型心理描写。",
    violations: [{
      ruleId: "rule-1",
      ruleName: "禁止解释型心理描写",
      ruleType: "forbidden",
      severity: "high",
      excerpt: "他感到一阵疲惫。",
      reason: "直接解释心理",
      suggestion: "改成动作表达",
      canAutoRewrite: true,
    }],
    canAutoRewrite: true,
    appliedRuleIds: ["rule-1"],
  });

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const listResponse = await fetch(`http://127.0.0.1:${port}/api/style-profiles`);
    assert.equal(listResponse.status, 200);
    assert.equal((await listResponse.json()).data[0].id, fakeProfile.id);

    const fromAnalysisResponse = await fetch(`http://127.0.0.1:${port}/api/style-profiles/from-book-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookAnalysisId: "analysis-1", name: "拆书写法" }),
    });
    assert.equal(fromAnalysisResponse.status, 201);
    assert.equal((await fromAnalysisResponse.json()).data.name, fakeProfile.name);

    const extractionResponse = await fetch(`http://127.0.0.1:${port}/api/style-extractions/from-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "提取写法", sourceText: "测试文本内容" }),
    });
    assert.equal(extractionResponse.status, 200);
    assert.equal((await extractionResponse.json()).data.features[0].id, "feature-1");

    const fromTextResponse = await fetch(`http://127.0.0.1:${port}/api/style-profiles/from-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "鎻愬彇鍐欐硶", sourceText: "娴嬭瘯鏂囨湰鍐呭" }),
    });
    assert.equal(fromTextResponse.status, 201);
    const fromTextPayload = await fromTextResponse.json();
    assert.equal(fromTextPayload.data.sourceContent, "娴嬭瘯鏂囨湰鍐呭");
    assert.equal(fromTextPayload.data.extractedFeatures[0].id, "feature-1");

    const fromExtractionResponse = await fetch(`http://127.0.0.1:${port}/api/style-profiles/from-extraction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "提取写法",
        sourceText: "测试文本内容",
        draft: fakeDraft,
        presetKey: "balanced",
        decisions: [{ featureId: "feature-1", decision: "keep" }],
      }),
    });
    assert.equal(fromExtractionResponse.status, 201);
    assert.equal((await fromExtractionResponse.json()).data.id, fakeProfile.id);

    const bindingResponse = await fetch(`http://127.0.0.1:${port}/api/style-bindings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        styleProfileId: fakeProfile.id,
        targetType: "chapter",
        targetId: "chapter-1",
        priority: 5,
        weight: 1,
      }),
    });
    assert.equal(bindingResponse.status, 201);
    assert.equal((await bindingResponse.json()).data.targetType, "chapter");

    const detectResponse = await fetch(`http://127.0.0.1:${port}/api/style-detection/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        styleProfileId: fakeProfile.id,
        content: "他感到一阵疲惫。",
      }),
    });
    assert.equal(detectResponse.status, 200);
    assert.equal((await detectResponse.json()).data.riskScore, 72);
  } finally {
    Object.assign(StyleProfileService.prototype, {
      listProfiles: originalMethods.listProfiles,
      extractFromText: originalMethods.extractFromText,
      createFromText: originalMethods.createFromText,
      createProfileFromExtraction: originalMethods.createProfileFromExtraction,
      createFromBookAnalysis: originalMethods.createFromBookAnalysis,
    });
    Object.assign(StyleBindingService.prototype, {
      createBinding: originalMethods.createBinding,
    });
    Object.assign(StyleDetectionService.prototype, {
      check: originalMethods.check,
    });
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
