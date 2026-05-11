const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");
const { StyleCompiler } = require("../dist/services/styleEngine/StyleCompiler.js");
const { buildStyleExtractionSourceInput } = require("../dist/services/styleEngine/StyleExtractionSourceInput.js");
const { StyleProfileService } = require("../dist/services/styleEngine/StyleProfileService.js");
const { styleExtractionTaskService } = require("../dist/services/styleEngine/StyleExtractionTaskService.js");
const { StyleBindingService } = require("../dist/services/styleEngine/StyleBindingService.js");
const { StyleDetectionService } = require("../dist/services/styleEngine/StyleDetectionService.js");
const { AntiAiRuleService } = require("../dist/services/styleEngine/AntiAiRuleService.js");
const { AntiAiPolicyResolver } = require("../dist/services/styleEngine/AntiAiPolicyResolver.js");
const { prisma } = require("../dist/db/prisma.js");
const styleEngineSeedService = require("../dist/services/styleEngine/StyleEngineSeedService.js");
const { KnowledgeService } = require("../dist/services/knowledge/KnowledgeService.js");
const { taskCenterService } = require("../dist/services/task/TaskCenterService.js");

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
    globalBaselineEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function buildAntiAiRuleRow(id, overrides = {}) {
  return {
    id,
    key: `rule-${id}`,
    name: `Rule ${id}`,
    type: "forbidden",
    severity: "high",
    description: "禁止直接解释人物心理。",
    detectPatternsJson: "[]",
    rewriteSuggestion: "改成动作与对白。",
    promptInstruction: `Rule ${id} instruction.`,
    autoRewrite: true,
    enabled: true,
    globalBaselineEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildStyleProfileRow(id, antiAiRules = []) {
  return {
    id,
    name: `Profile ${id}`,
    description: null,
    category: null,
    tagsJson: "[]",
    applicableGenresJson: "[]",
    sourceType: "manual",
    sourceRefId: null,
    sourceContent: null,
    extractedFeaturesJson: "[]",
    extractionPresetsJson: "[]",
    extractionAntiAiRuleKeysJson: "[]",
    selectedExtractionPresetKey: null,
    analysisMarkdown: null,
    status: "active",
    narrativeRulesJson: "{}",
    characterRulesJson: "{}",
    languageRulesJson: "{}",
    rhythmRulesJson: "{}",
    antiAiBindings: antiAiRules.map((antiAiRule) => ({ antiAiRule })),
    createdAt: new Date(),
    updatedAt: new Date(),
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

  assert.match(strong.antiAi, /Forbidden:/);
  assert.match(strong.antiAi, /forbid: 直接解释人物心理/);
  assert.match(medium.antiAi, /avoid: 直接解释人物心理/);
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

  assert.match(compiled.context, /Style source stack:/);
  assert.match(compiled.context, /Task -> 临时任务覆盖/);
  assert.match(compiled.style, /narrative\.summary: must keep 动作先行/);
  assert.match(compiled.character, /character\.emotionExpression: keep when natural 克制外露/);
});

test("StyleBindingService uses explicit global anti-ai baseline flag", async () => {
  const originalEnsure = styleEngineSeedService.ensureStyleEngineSeedData;
  const originalFindBindings = prisma.styleBinding.findMany;
  const originalFindAntiAiRules = prisma.antiAiRule.findMany;
  let capturedAntiAiWhere = null;

  styleEngineSeedService.ensureStyleEngineSeedData = async () => ({});
  prisma.styleBinding.findMany = async () => [];
  prisma.antiAiRule.findMany = async (args) => {
    capturedAntiAiWhere = args.where;
    return [buildAntiAiRuleRow("global-baseline")];
  };

  try {
    const resolved = await new StyleBindingService().resolveForGeneration({ novelId: "novel-1" });
    assert.deepEqual(capturedAntiAiWhere, {
      enabled: true,
      globalBaselineEnabled: true,
    });
    assert.equal(resolved.usesGlobalAntiAiBaseline, true);
    assert.deepEqual(resolved.globalAntiAiRuleIds, ["global-baseline"]);
    assert.match(resolved.compiledBlocks.antiAi, /Rule global-baseline instruction/);
  } finally {
    styleEngineSeedService.ensureStyleEngineSeedData = originalEnsure;
    prisma.styleBinding.findMany = originalFindBindings;
    prisma.antiAiRule.findMany = originalFindAntiAiRules;
  }
});

test("StyleBindingService keeps style-bound anti-ai rules outside global baseline", async () => {
  const originalEnsure = styleEngineSeedService.ensureStyleEngineSeedData;
  const originalFindBindings = prisma.styleBinding.findMany;
  const originalFindAntiAiRules = prisma.antiAiRule.findMany;
  const styleRule = buildAntiAiRuleRow("style-only", {
    globalBaselineEnabled: false,
    promptInstruction: "Style-only anti-AI instruction.",
  });

  styleEngineSeedService.ensureStyleEngineSeedData = async () => ({});
  prisma.antiAiRule.findMany = async () => [];
  prisma.styleBinding.findMany = async () => [{
    id: "binding-1",
    styleProfileId: "profile-1",
    targetType: "novel",
    targetId: "novel-1",
    priority: 1,
    weight: 1,
    enabled: true,
    styleProfile: buildStyleProfileRow("profile-1", [styleRule]),
    createdAt: new Date(),
    updatedAt: new Date(),
  }];

  try {
    const resolved = await new StyleBindingService().resolveForGeneration({ novelId: "novel-1" });
    assert.equal(resolved.usesGlobalAntiAiBaseline, false);
    assert.deepEqual(resolved.globalAntiAiRuleIds, []);
    assert.deepEqual(resolved.styleAntiAiRuleIds, ["style-only"]);
    assert.match(resolved.compiledBlocks.antiAi, /Style-only anti-AI instruction/);
  } finally {
    styleEngineSeedService.ensureStyleEngineSeedData = originalEnsure;
    prisma.styleBinding.findMany = originalFindBindings;
    prisma.antiAiRule.findMany = originalFindAntiAiRules;
  }
});

test("AntiAiRuleService defaults new custom rules outside global baseline", async () => {
  const originalCreate = prisma.antiAiRule.create;
  let capturedData = null;
  prisma.antiAiRule.create = async (args) => {
    capturedData = args.data;
    return buildAntiAiRuleRow("custom-rule", args.data);
  };

  try {
    const created = await new AntiAiRuleService().createRule({
      key: "custom-rule",
      name: "自定义规则",
      type: "forbidden",
      severity: "medium",
      description: "自定义禁用表达。",
    });
    assert.equal(capturedData.globalBaselineEnabled, false);
    assert.equal(created.globalBaselineEnabled, false);
  } finally {
    prisma.antiAiRule.create = originalCreate;
  }
});

test("AntiAiPolicyResolver separates global baseline and style-specific sources", async () => {
  const originalEnsure = styleEngineSeedService.ensureStyleEngineSeedData;
  const originalFindAntiAiRules = prisma.antiAiRule.findMany;
  const globalRule = buildAntiAiRuleRow("global-rule", {
    globalBaselineEnabled: true,
    promptInstruction: "Global anti-AI instruction.",
  });
  const styleRule = buildAntiAiRuleRow("style-rule", {
    globalBaselineEnabled: false,
    promptInstruction: "Style-bound anti-AI instruction.",
  });

  styleEngineSeedService.ensureStyleEngineSeedData = async () => ({});
  prisma.antiAiRule.findMany = async () => [globalRule];

  try {
    const resolved = await new AntiAiPolicyResolver().resolveFromBindings({
      matchedBindings: [{
        id: "binding-1",
        styleProfileId: "profile-1",
        targetType: "novel",
        targetId: "novel-1",
        priority: 1,
        weight: 0.8,
        enabled: true,
        styleProfile: {
          ...buildStyleProfileRow("profile-1", [styleRule]),
          antiAiRules: [{
            id: "style-rule",
            key: "rule-style-rule",
            name: "Rule style-rule",
            type: "forbidden",
            severity: "high",
            description: "禁止直接解释人物心理。",
            detectPatterns: [],
            rewriteSuggestion: "改成动作与对白。",
            promptInstruction: "Style-bound anti-AI instruction.",
            autoRewrite: true,
            enabled: true,
            globalBaselineEnabled: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
      effectiveStyleProfileId: "profile-1",
    });

    assert.deepEqual(resolved.globalBaselineRules.map((item) => item.rule.id), ["global-rule"]);
    assert.deepEqual(resolved.styleSpecificRules.map((item) => item.rule.id), ["style-rule"]);
    assert.deepEqual(resolved.effectiveRules.map((item) => item.rule.id), ["global-rule", "style-rule"]);
    assert.equal(resolved.effectiveStyleProfileId, "profile-1");
    assert.equal(resolved.usesGlobalAntiAiBaseline, true);
    assert.equal(resolved.styleSpecificRules[0].source, "style_profile");
  } finally {
    styleEngineSeedService.ensureStyleEngineSeedData = originalEnsure;
    prisma.antiAiRule.findMany = originalFindAntiAiRules;
  }
});

test("knowledge document style extraction uses representative sample by default", () => {
  const sourceText = Array.from({ length: 90 }, (_, index) =>
    `第${index + 1}段：${"人物对话和场景推进。".repeat(160)}`).join("\n");

  const sampled = buildStyleExtractionSourceInput({
    sourceText,
    sourceType: "from_knowledge_document",
    sourceProcessingMode: "representative_sample",
  });
  assert.equal(sampled.sourceProcessingMode, "representative_sample");
  assert.equal(sampled.sourceInputCharLimit, 60000);
  assert.ok(sampled.sourceInputText.length <= 60000);
  assert.ok(sampled.sourceInputText.length < sourceText.length);
  assert.equal(sampled.sourceInputCharCount, sampled.sourceInputText.length);
  assert.match(sampled.sourceInputText, /系统抽样说明/);

  const fullText = buildStyleExtractionSourceInput({
    sourceText,
    sourceType: "from_text",
  });
  assert.equal(fullText.sourceProcessingMode, "full_text");
  assert.equal(fullText.sourceInputText, null);
  assert.equal(fullText.sourceInputCharCount, sourceText.length);
});

test("style engine routes return mocked payloads", async () => {
  const originalMethods = {
    listProfiles: StyleProfileService.prototype.listProfiles,
    extractFromText: StyleProfileService.prototype.extractFromText,
    createFromText: StyleProfileService.prototype.createFromText,
    createProfileFromExtraction: StyleProfileService.prototype.createProfileFromExtraction,
    createFromBookAnalysis: StyleProfileService.prototype.createFromBookAnalysis,
    createExtractionTask: styleExtractionTaskService.createTask,
    createBinding: StyleBindingService.prototype.createBinding,
    resolveEffectiveRules: AntiAiPolicyResolver.prototype.resolveEffectiveRules,
    check: StyleDetectionService.prototype.check,
    getKnowledgeDocumentById: KnowledgeService.prototype.getDocumentById,
    getTaskDetail: taskCenterService.getTaskDetail,
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
    }],
  };

  StyleProfileService.prototype.listProfiles = async () => [fakeProfile];
  StyleProfileService.prototype.extractFromText = async () => fakeDraft;
  StyleProfileService.prototype.createFromText = async () => fakeExtractedProfile;
  StyleProfileService.prototype.createProfileFromExtraction = async () => fakeProfile;
  StyleProfileService.prototype.createFromBookAnalysis = async () => fakeProfile;
  let capturedKnowledgeExtractionInput = null;
  KnowledgeService.prototype.getDocumentById = async (documentId) => ({
    id: documentId,
    title: "知识库小说",
    fileName: "novel.txt",
    status: "enabled",
    activeVersionId: "knowledge-version-1",
    activeVersionNumber: 1,
    latestIndexStatus: "idle",
    latestIndexError: null,
    lastIndexedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    bookAnalysisCount: 0,
    versions: [{
      id: "knowledge-version-1",
      documentId,
      versionNumber: 1,
      content: "  第一版活动正文  ",
      contentHash: "hash-1",
      charCount: 11,
      createdAt: new Date(),
      isActive: true,
    }],
  });
  styleExtractionTaskService.createTask = async (input) => {
    capturedKnowledgeExtractionInput = input;
    return { id: "style-task-knowledge" };
  };
  taskCenterService.getTaskDetail = async (kind, id) => ({
    id,
    kind,
    title: "写法提取：知识库写法",
    status: "queued",
    progress: 0,
    currentStage: "queued",
    currentItemKey: id,
    currentItemLabel: "知识库写法",
    attemptCount: 0,
    maxAttempts: 1,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    heartbeatAt: null,
    ownerId: id,
    ownerLabel: "知识库写法",
    sourceRoute: "/writing-formula",
    tokenUsage: null,
    sourceResource: null,
    targetResources: [],
    provider: "deepseek",
    model: null,
    startedAt: null,
    finishedAt: null,
    retryCountLabel: "0/1",
    meta: {
      sourceType: capturedKnowledgeExtractionInput?.sourceType,
      sourceRefId: capturedKnowledgeExtractionInput?.sourceRefId,
    },
    steps: [],
    failureDetails: null,
  });
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
  AntiAiPolicyResolver.prototype.resolveEffectiveRules = async (input) => ({
    globalBaselineRules: [{
      rule: buildRule("global-preview"),
      source: "global_baseline",
      sourceLabel: "全局默认",
      styleProfileId: null,
      styleProfileName: null,
      bindingTargetType: null,
      bindingTargetId: null,
      weight: 1,
    }],
    styleSpecificRules: input.styleProfileId ? [{
      rule: { ...buildRule("style-preview"), globalBaselineEnabled: false },
      source: "style_profile",
      sourceLabel: "现实流",
      styleProfileId: input.styleProfileId,
      styleProfileName: "现实流",
      bindingTargetType: "task",
      bindingTargetId: input.styleProfileId,
      weight: 1,
    }] : [],
    effectiveRules: input.styleProfileId
      ? [{
        rule: buildRule("global-preview"),
        source: "global_baseline",
        sourceLabel: "全局默认",
        styleProfileId: null,
        styleProfileName: null,
        bindingTargetType: null,
        bindingTargetId: null,
        weight: 1,
      }, {
        rule: { ...buildRule("style-preview"), globalBaselineEnabled: false },
        source: "style_profile",
        sourceLabel: "现实流",
        styleProfileId: input.styleProfileId,
        styleProfileName: "现实流",
        bindingTargetType: "task",
        bindingTargetId: input.styleProfileId,
        weight: 1,
      }]
      : [{
        rule: buildRule("global-preview"),
        source: "global_baseline",
        sourceLabel: "全局默认",
        styleProfileId: null,
        styleProfileName: null,
        bindingTargetType: null,
        bindingTargetId: null,
        weight: 1,
      }],
    effectiveStyleProfileId: input.styleProfileId ?? null,
    usesGlobalAntiAiBaseline: true,
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

    const knowledgeTaskResponse = await fetch(`http://127.0.0.1:${port}/api/style-extraction-tasks/from-knowledge-document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: "knowledge-doc-1",
        name: "知识库写法",
        presetKey: "transfer",
      }),
    });
    assert.equal(knowledgeTaskResponse.status, 202);
    const knowledgeTaskPayload = await knowledgeTaskResponse.json();
    assert.equal(knowledgeTaskPayload.data.id, "style-task-knowledge");
    assert.equal(capturedKnowledgeExtractionInput.sourceType, "from_knowledge_document");
    assert.equal(capturedKnowledgeExtractionInput.sourceRefId, "knowledge-doc-1");
    assert.equal(capturedKnowledgeExtractionInput.sourceProcessingMode, "representative_sample");
    assert.equal(capturedKnowledgeExtractionInput.sourceText, "  第一版活动正文  ");
    assert.equal(capturedKnowledgeExtractionInput.presetKey, "transfer");

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

    const effectiveRulesResponse = await fetch(`http://127.0.0.1:${port}/api/anti-ai-rules/effective?styleProfileId=${fakeProfile.id}`);
    assert.equal(effectiveRulesResponse.status, 200);
    const effectiveRulesPayload = await effectiveRulesResponse.json();
    assert.equal(effectiveRulesPayload.data.effectiveStyleProfileId, fakeProfile.id);
    assert.deepEqual(
      effectiveRulesPayload.data.effectiveRules.map((item) => item.source),
      ["global_baseline", "style_profile"],
    );

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
    styleExtractionTaskService.createTask = originalMethods.createExtractionTask;
    Object.assign(StyleBindingService.prototype, {
      createBinding: originalMethods.createBinding,
    });
    Object.assign(AntiAiPolicyResolver.prototype, {
      resolveEffectiveRules: originalMethods.resolveEffectiveRules,
    });
    Object.assign(StyleDetectionService.prototype, {
      check: originalMethods.check,
    });
    Object.assign(KnowledgeService.prototype, {
      getDocumentById: originalMethods.getKnowledgeDocumentById,
    });
    taskCenterService.getTaskDetail = originalMethods.getTaskDetail;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
