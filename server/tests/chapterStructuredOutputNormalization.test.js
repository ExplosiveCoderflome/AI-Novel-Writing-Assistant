const test = require("node:test");
const assert = require("node:assert/strict");

const {
  chapterAcceptanceAssessmentSchema,
  chapterAcceptanceAssessmentPrompt,
} = require("../dist/prompting/prompts/novel/chapterAcceptance.prompts.js");
const {
  chapterArtifactDeltaOutputSchema,
  chapterArtifactDeltaPrompt,
} = require("../dist/prompting/prompts/novel/chapterArtifactDelta.prompts.js");
const {
  characterResourceExtractionOutputSchema,
} = require("../dist/prompting/prompts/novel/characterResource.promptSchemas.js");
const {
  timelineExtractorOutputSchema,
} = require("../dist/prompting/prompts/novel/timelineExtractor.prompts.js");
const {
  createChapterExecutionContractSchema,
} = require("../dist/services/novel/volume/volumeGenerationSchemas.js");

test("chapter execution contract requires reader experience and scene experience fields", () => {
  const schema = createChapterExecutionContractSchema();
  const scene = (index) => ({
    key: `scene_${index}`,
    title: `场景${index}`,
    purpose: "推进本章任务。",
    mustAdvance: ["形成可见推进"],
    mustPreserve: ["保持主线连续"],
    entryState: `入口${index}`,
    exitState: `出口${index}`,
    forbiddenExpansion: ["不要越过下一章"],
    targetWordCount: 1000,
    resistance: "敌方施加具体阻力。",
    turn: "主角改变策略并夺回一步主动。",
    emotionalShift: "压迫转为反击期待。",
    readerValue: "读者获得推进和局部回报。",
  });
  const base = {
    purpose: "完成第一次反压。",
    exclusiveEvent: "主角第一次迫使敌方后退。",
    endingState: "主角获得局部主动。",
    nextChapterEntryState: "敌方准备升级反扑。",
    conflictLevel: 70,
    revealLevel: 40,
    targetWordCount: 3000,
    mustAvoid: "不要提前揭露幕后黑手。",
    payoffRefs: [],
    taskSheet: "让主角主动试探并拿到可见收益。",
    sceneCards: [scene(1), scene(2), scene(3)],
  };
  assert.equal(schema.safeParse(base).success, false);
  assert.equal(schema.safeParse({
    ...base,
    readerExperience: {
      readerQuestion: "主角能否完成第一次反压？",
      promisedReward: "主角拿到第一次可见主动权。",
      rewardLevel: "partial",
      protagonistWant: "迫使敌方后退。",
      primaryResistance: "敌方掌握资源优势。",
      keyTurn: "主角识破并利用敌方漏洞。",
      emotionalShift: "受压转为反击快感。",
      informationReveal: "敌方封锁存在漏洞。",
      netChange: "主角从被动转为局部主动。",
      inheritedHookResponsibilities: ["回应上一章留下的钥匙"],
      endingHook: "敌方启动更强反扑。",
    },
  }).success, true);
});

function makeResourceDelta(index = 1) {
  return {
    resourceName: `关键资源${index}`,
    resourceType: "credential",
    updateType: "introduced",
    holderCharacterName: "主角",
    ownerType: "character",
    ownerName: "主角",
    statusAfter: "available",
    readerKnows: true,
    holderKnows: true,
    knownByCharacterNames: ["主角"],
    narrativeFunction: "key",
    summary: `主角获得关键资源${index}。`,
    narrativeImpact: "影响后续行动边界。",
    evidence: [`主角收起关键资源${index}。`],
    confidence: 0.9,
    riskLevel: "low",
  };
}

test("character resource extraction schemas cap resource deltas at eight items", () => {
  const nineDeltas = Array.from({ length: 9 }, (_, index) => makeResourceDelta(index + 1));

  assert.throws(() => {
    characterResourceExtractionOutputSchema.parse({
      updates: nineDeltas,
      continuityRisks: [],
    });
  });

  assert.throws(() => {
    chapterArtifactDeltaOutputSchema.parse({
      summary: "本章产生过多资源变化。",
      stateDeltas: {
        summary: "状态无变化。",
        characterStates: [],
        relationStates: [],
        informationStates: [],
        foreshadowStates: [],
      },
      characterResourceDeltas: nineDeltas,
      payoffDeltas: [],
      relationDynamics: [],
      factionUpdates: [],
      characterCandidates: [],
      syncPlan: {
        stateSnapshot: "skip",
        characterResources: "write",
        payoffLedger: "skip",
        characterDynamics: "skip",
        reason: "只测试资源上限。",
      },
      confidence: 0.9,
      requiresFullReconcile: false,
    });
  });
});

test("chapter acceptance schema normalizes common review category and repair target aliases", () => {
  const parsed = chapterAcceptanceAssessmentSchema.parse({
    status: "repairable",
    score: {
      coherence: 85,
      pacing: 80,
      repetition: 88,
      engagement: 82,
      voice: 83,
      overall: 84,
    },
    summary: "本章可继续，但需要局部轻修。",
    blockingIssues: [{
      severity: "low",
      category: "pacing",
      code: "transition_abrupt",
      evidence: "过渡较快。",
      fixSuggestion: "补一段跟踪铺垫。",
    }],
    repairDirectives: [{
      mode: "patch",
      target: "middle",
      instruction: "在中段增加被跟踪的细节。",
    }, {
      mode: "patch",
      target: "ending_tone",
      instruction: "把结尾总结腔改成角色行动。",
    }],
    riskTags: ["pacing"],
    assetSyncRecommendation: {
      priority: "normal",
      reason: "只需要普通资产同步。",
      requiresFullPayoffReconcile: false,
    },
    continuePolicy: "repair_once",
  });

  assert.equal(parsed.blockingIssues[0].category, "plot");
  assert.equal(parsed.repairDirectives[0].target, "plot");
  assert.equal(parsed.repairDirectives[1].target, "voice");
  assert.deepEqual(parsed.missingObligations, []);
  assert.equal(parsed.repairability, "none");
});

test("chapter acceptance schema normalizes common status aliases", () => {
  const base = {
    score: {
      coherence: 85,
      pacing: 80,
      repetition: 88,
      engagement: 82,
      voice: 83,
      overall: 84,
    },
    summary: "本章可以继续。",
    blockingIssues: [],
    repairDirectives: [],
    missingObligations: [],
    riskTags: [],
    assetSyncRecommendation: {
      priority: "normal",
      reason: "普通同步即可。",
      requiresFullPayoffReconcile: false,
    },
    continuePolicy: "continue",
  };

  assert.equal(chapterAcceptanceAssessmentSchema.parse({
    ...base,
    status: "acceptable",
  }).status, "accepted");
  assert.equal(chapterAcceptanceAssessmentSchema.parse({
    ...base,
    status: "repair",
  }).status, "repairable");
  assert.equal(chapterAcceptanceAssessmentSchema.parse({
    ...base,
    status: "manual",
  }).status, "needs_manual_review");
  assert.equal(chapterAcceptanceAssessmentSchema.parse({
    ...base,
    status: "proceed",
  }).status, "continue_with_risk");
});

test("chapter acceptance prompt forbids status alias values", () => {
  const messages = chapterAcceptanceAssessmentPrompt.render({
    novelTitle: "测试小说",
    chapterOrder: 1,
    chapterTitle: "测试章节",
    targetWordCount: 3000,
    content: "主角完成本章任务。",
  }, {
    blocks: [],
    selectedBlockIds: [],
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  });
  const systemText = String(messages[0].content);

  assert.match(systemText, /status 只能使用 accepted、repairable、needs_manual_review、continue_with_risk/);
  assert.match(systemText, /不得输出 acceptable、pass、passed、ok、approved/);
});

test("chapter acceptance schema accepts obligation diagnostics", () => {
  const parsed = chapterAcceptanceAssessmentSchema.parse({
    status: "repairable",
    score: {
      coherence: 82,
      pacing: 80,
      repetition: 88,
      engagement: 82,
      voice: 83,
      overall: 83,
    },
    summary: "正文可修，但缺少本章必须兑现的角色行动。",
    blockingIssues: [],
    repairDirectives: [{
      mode: "patch",
      target: "plot",
      instruction: "补写娄晓娥出场并推动关系变化。",
    }],
    missingObligations: [{
      kind: "character_appearance",
      summary: "娄晓娥必须出场并形成关系推进。",
      evidence: "正文未出现娄晓娥。",
    }],
    repairability: "patchable_obligation_gap",
    decisionReason: "局部补写即可修复，不需要重排章节。",
    riskTags: ["missing_character_appearance"],
    assetSyncRecommendation: {
      priority: "normal",
      reason: "修复后可继续普通同步。",
      requiresFullPayoffReconcile: false,
    },
    continuePolicy: "repair_once",
  });

  assert.equal(parsed.missingObligations[0].kind, "character_appearance");
  assert.equal(parsed.repairability, "patchable_obligation_gap");
});

test("chapter acceptance schema normalizes obligation and policy aliases", () => {
  const parsed = chapterAcceptanceAssessmentSchema.parse({
    status: "repairable",
    score: {
      coherence: 82,
      pacing: 80,
      repetition: 88,
      engagement: 82,
      voice: 83,
      overall: 83,
    },
    summary: "正文缺少关键义务。",
    blockingIssues: [],
    repairDirectives: [{
      mode: "fix",
      target: "plot",
      instruction: "补出敌方试探和主角识破。",
    }],
    missingObligations: [{
      obligationType: "required_character_appearance",
      target: "春桃必须出场并执行观察任务。",
      reason: "正文未出现春桃。",
    }, {
      type: "required_payoff_touch",
      fixSuggestion: "必须推进药渣陷害伏笔。",
      evidence: "正文没有触碰药渣线索。",
    }],
    repairability: "patchable_obligation_gap",
    decisionReason: "局部补写即可。",
    riskTags: [],
    assetSyncRecommendation: {
      priority: "normal",
      reason: "修复后可继续普通同步。",
      requiresFullPayoffReconcile: false,
    },
    continuePolicy: "repair",
  });

  assert.equal(parsed.repairDirectives[0].mode, "patch");
  assert.equal(parsed.missingObligations[0].kind, "character_appearance");
  assert.equal(parsed.missingObligations[0].summary, "春桃必须出场并执行观察任务。");
  assert.equal(parsed.missingObligations[0].evidence, "正文未出现春桃。");
  assert.equal(parsed.missingObligations[1].kind, "payoff_touch");
  assert.equal(parsed.continuePolicy, "repair_once");
});

test("timeline extractor schema normalizes enum aliases and hook shorthand", () => {
  const parsed = timelineExtractorOutputSchema.parse({
    timeAnchor: { storyDayIndex: 2, label: "第二日夜" },
    addressedHookIds: [],
    resolvedHookIds: [],
    events: [{
      title: "主角识破试探",
      summary: "主角发现敌方留下的药渣线索。",
      type: "剧情",
      participantNames: ["武曌"],
      locationName: "寝殿",
      stateChanges: [{
        targetType: "角色",
        targetId: "武曌",
        field: "认知",
        before: "不确定敌方手段",
        after: "确认药渣陷害方向",
        certainty: "confirmed",
      }],
      possibleHooks: ["敌方眼线尚未暴露"],
      occurred: true,
      confidence: 0.9,
      matchedPlannedEventIds: [],
    }],
    hooks: [{
      hook: "春桃下一章追踪眼线",
      summary: "春桃需要继续追踪可疑宫女。",
      severity: "高",
      mode: "短线",
    }],
    stateChanges: [{
      targetType: "地点",
      targetId: "寝殿",
      field: "风险",
      after: "已被敌方眼线渗透",
      certainty: "likely",
    }],
  });

  assert.equal(parsed.events[0].type, "plot");
  assert.equal(parsed.events[0].stateChanges[0].targetType, "character");
  assert.equal(parsed.events[0].possibleHooks[0].title, "敌方眼线尚未暴露");
  assert.equal(parsed.events[0].possibleHooks[0].priority, "medium");
  assert.equal(parsed.hooks[0].title, "春桃下一章追踪眼线");
  assert.equal(parsed.hooks[0].priority, "high");
  assert.equal(parsed.hooks[0].resolveMode, "short_arc");
  assert.equal(parsed.stateChanges[0].targetType, "location");
});

test("chapter artifact delta schema normalizes common LLM aliases from extraction output", () => {
  const parsed = chapterArtifactDeltaOutputSchema.parse({
    summary: "本章推进多条伏笔。",
    stateDeltas: {
      summary: "主角完成表白并发现陷害计划。",
      characterStates: [],
      relationStates: [],
      informationStates: [],
      foreshadowStates: [],
    },
    characterResourceDeltas: [{
      resourceName: "约见对头暗号纸条",
      resourceType: "credential",
      updateType: "created",
      holderCharacterName: "何雨柱",
      ownerType: "character",
      ownerName: "何雨柱",
      statusAfter: "active",
      readerKnows: true,
      holderKnows: true,
      knownByCharacterNames: ["何雨柱"],
      narrativeFunction: "key",
      summary: "傻柱写下暗号纸条。",
      narrativeImpact: "为明天抢先举报提供手段。",
      evidence: ["他写下暗号纸条。"],
      confidence: 0.85,
      riskLevel: "medium",
    }],
    payoffDeltas: [{
      ledgerKey: "zhao_de_zhu_zhang_wu",
      title: "赵德柱账目问题",
      summary: "从待兑现推进到具体行动计划。",
      scopeType: "chapter",
      currentStatus: "active",
      targetStartChapterOrder: 2,
      targetEndChapterOrder: 3,
      firstSeenChapterOrder: 2,
      lastTouchedChapterOrder: 2,
      setupChapterOrder: 2,
      sourceRefs: [],
      evidence: [{ summary: "傻柱决定明天举报赵德柱。", chapterOrder: 2 }],
      riskSignals: ["秦淮茹许大茂可能提前通风报信"],
      statusReason: "本章推进到具体行动。",
      confidence: 0.9,
    }],
    relationDynamics: [{
      character1Name: "何雨柱",
      character2Name: "娄晓娥",
      relationshipType: "romantic",
      phaseAfter: "pursuing",
      summary: "傻柱表白，娄晓娥表示考虑。",
      evidence: ["我想娶你当媳妇。"],
      confidence: 0.95,
    }],
    factionUpdates: [],
    characterCandidates: [{
      characterName: "李主任",
      narrativeRole: "可能成为傻柱的盟友。",
      appearanceSummary: "傻柱计划找李主任举报赵德柱。",
    }],
    syncPlan: {
      stateSnapshot: "write",
      characterResources: "write",
      payoffLedger: "delta",
      characterDynamics: "write",
      reason: "本章有状态、资源、伏笔和关系变化。",
    },
    confidence: 0.86,
    requiresFullReconcile: false,
  });

  assert.equal(parsed.characterResourceDeltas[0].updateType, "introduced");
  assert.equal(parsed.characterResourceDeltas[0].statusAfter, "available");
  assert.equal(parsed.payoffDeltas[0].currentStatus, "pending_payoff");
  assert.deepEqual(parsed.payoffDeltas[0].riskSignals[0], {
    code: "chapter_artifact_risk_1",
    severity: "medium",
    summary: "秦淮茹许大茂可能提前通风报信",
  });
  assert.equal(parsed.relationDynamics[0].sourceCharacterName, "何雨柱");
  assert.equal(parsed.relationDynamics[0].targetCharacterName, "娄晓娥");
  assert.equal(parsed.relationDynamics[0].stageLabel, "pursuing");
  assert.equal(parsed.characterCandidates[0].proposedName, "李主任");
});

test("chapter artifact delta schema normalizes enum drift from artifact extraction", () => {
  const parsed = chapterArtifactDeltaOutputSchema.parse({
    summary: "林越通过聚灵草套利突破练气一层。",
    stateDeltas: {
      summary: "林越突破练气一层，赵无极敌对升级。",
      characterStates: [],
      relationStates: [],
      informationStates: [],
      foreshadowStates: [{
        title: "赵无极报复",
        summary: "赵无极扬言报复。",
        status: "hinted",
        setupChapterId: 4,
      }],
    },
    characterResourceDeltas: [{
      resourceName: "聚灵丹",
      resourceType: "consumable",
      updateType: "produced",
      holderCharacterName: "林越",
      ownerType: "character",
      ownerName: "林越",
      statusAfter: "owned",
      readerKnows: true,
      holderKnows: true,
      knownByCharacterNames: ["林越"],
      narrativeFunction: "cultivation",
      summary: "林越炼制出聚灵丹。",
      narrativeImpact: "帮助突破练气一层。",
      evidence: ["聚灵丹入口，灵气冲开经脉。"],
      confidence: 0.9,
      riskLevel: "low",
    }, {
      resourceName: "聚灵草",
      resourceType: "material",
      updateType: "acquired",
      holderCharacterName: "林越",
      ownerType: "character",
      ownerName: "林越",
      statusAfter: "usable",
      readerKnows: true,
      holderKnows: true,
      knownByCharacterNames: ["林越"],
      narrativeFunction: "material",
      summary: "林越低价买入聚灵草。",
      narrativeImpact: "提供炼丹材料。",
      evidence: ["他买下二十多株聚灵草。"],
      confidence: 0.9,
      riskLevel: "low",
    }, {
      resourceName: "借据",
      resourceType: "credential",
      updateType: "acquired",
      holderCharacterName: "林越",
      ownerType: "character",
      ownerName: "林越",
      statusAfter: "broken",
      readerKnows: true,
      holderKnows: true,
      knownByCharacterNames: ["林越"],
      narrativeFunction: "finance",
      summary: "林越写下借据。",
      narrativeImpact: "形成还债约束。",
      evidence: ["王大力签字担保。"],
      confidence: 0.9,
      riskLevel: "low",
    }, {
      resourceName: "积分",
      resourceType: "currency",
      updateType: "acquired",
      holderCharacterName: "林越",
      ownerType: "character",
      ownerName: "林越",
      statusAfter: "used",
      readerKnows: true,
      holderKnows: true,
      knownByCharacterNames: ["林越"],
      narrativeFunction: "finance",
      summary: "借来的积分被用于购买聚灵草。",
      narrativeImpact: "完成套利投入。",
      evidence: ["五十积分全部花掉。"],
      confidence: 0.9,
      riskLevel: "low",
    }],
    payoffDeltas: [{
      ledgerKey: "resource_monopoly_doubt",
      title: "宗门资源垄断质疑",
      summary: "主角确认赵无极垄断聚灵草。",
      scopeType: "story",
      currentStatus: "setup",
      targetStartChapterOrder: 1,
      targetEndChapterOrder: 20,
      firstSeenChapterOrder: 1,
      lastTouchedChapterOrder: 4,
      setupChapterOrder: 1,
      sourceRefs: [],
      evidence: [{ summary: "林越推测赵无极控制聚灵草流通。", chapterOrder: 4 }],
      riskSignals: [],
      statusReason: "揭示现象但未触及根本。",
      confidence: 0.9,
    }],
    relationDynamics: [],
    factionUpdates: [],
    characterCandidates: [],
    syncPlan: {
      stateSnapshot: "write",
      characterResources: "write",
      payoffLedger: "delta",
      characterDynamics: "delta",
      reason: "本章状态、资源、伏笔和关系均有变化。",
    },
    confidence: 0.9,
    requiresFullReconcile: false,
  });

  assert.equal(parsed.stateDeltas.foreshadowStates[0].setupChapterId, "4");
  assert.equal(parsed.characterResourceDeltas[0].updateType, "introduced");
  assert.equal(parsed.characterResourceDeltas[0].statusAfter, "available");
  assert.equal(parsed.characterResourceDeltas[0].narrativeFunction, "tool");
  assert.equal(parsed.characterResourceDeltas[1].resourceType, "consumable");
  assert.equal(parsed.characterResourceDeltas[1].statusAfter, "available");
  assert.equal(parsed.characterResourceDeltas[1].narrativeFunction, "cost");
  assert.equal(parsed.characterResourceDeltas[2].statusAfter, "damaged");
  assert.equal(parsed.characterResourceDeltas[2].narrativeFunction, "proof");
  assert.equal(parsed.characterResourceDeltas[3].resourceType, "world_resource");
  assert.equal(parsed.characterResourceDeltas[3].statusAfter, "consumed");
  assert.equal(parsed.characterResourceDeltas[3].narrativeFunction, "cost");
  assert.equal(parsed.payoffDeltas[0].scopeType, "book");
  assert.equal(parsed.syncPlan.characterDynamics, "write");
});

function makeArtifactNormalizationInput(overrides = {}) {
  return {
    summary: "主角发现门后的线索。",
    stateDeltas: {},
    syncPlan: { reason: "按最终正文整理资料。" },
    confidence: 0.9,
    ...overrides,
  };
}

function makeMindDelta(confidence) {
  return { characterName: "主角", currentInterpretation: "门后可能有危险。", evidence: ["他停在门前。"], confidence };
}

test("artifact extraction accepts missing foreshadow titles and numeric-string mind confidence together", () => {
  const summary = "两条线索有相同开头但不同结尾，必须保留完整的门后线索。";
  const parsed = chapterArtifactDeltaOutputSchema.parse(makeArtifactNormalizationInput({
    stateDeltas: { foreshadowStates: [{ summary, status: "hinted", setupChapterId: 3 }] },
    characterMindDeltas: [makeMindDelta(" 0.8 ")],
  }));
  assert.equal(parsed.stateDeltas.foreshadowStates[0].title, summary);
  assert.equal(parsed.stateDeltas.foreshadowStates[0].setupChapterId, "3");
  assert.equal(parsed.characterMindDeltas[0].confidence, 0.8);
  assert.deepEqual(chapterArtifactDeltaOutputSchema.parse(parsed), parsed, "checkpoint parsing is idempotent");
});

test("foreshadow title normalization preserves explicit titles and supplied aliases", () => {
  const states = [
    { title: "明确标题", summary: "摘要不应覆盖标题" },
    { foreshadowTitle: "别名标题", summary: "摘要" },
    { name: "线索名称" },
    { label: "线索标识" },
    { title: " ", summary: "完整的已有线索" },
  ];
  const parsed = chapterArtifactDeltaOutputSchema.parse(makeArtifactNormalizationInput({stateDeltas: {foreshadowStates: states}}));
  assert.deepEqual(parsed.stateDeltas.foreshadowStates.map(item => item.title), ["明确标题", "别名标题", "线索名称", "线索标识", "完整的已有线索"]);
});

test("missing foreshadow content still requires AI repair instead of a fabricated title", () => {
  for (const state of [{status: "setup"}, {title: " ", summary: " "}, {title: 42}, null, []]) {
    assert.equal(chapterArtifactDeltaOutputSchema.safeParse(makeArtifactNormalizationInput({stateDeltas: {foreshadowStates: [state]}})).success, false);
  }
});

test("mind confidence accepts JSON numbers without inventing ambiguous or out-of-range scores", () => {
  for (const [input, expected] of [["0", 0], ["1", 1], ["8e-1", 0.8], [0.8, 0.8]]) {
    const parsed = chapterArtifactDeltaOutputSchema.parse(makeArtifactNormalizationInput({characterMindDeltas: [makeMindDelta(input)]}));
    assert.equal(parsed.characterMindDeltas[0].confidence, expected);
  }
  for (const input of ["", " ", "很高", "80%", "0.8%", "1.2", "-0.1", "null", "true", "{}", "[]", "0x1", "NaN", "Infinity", null, undefined, true, false, NaN, Infinity, -0.1, 1.2]) {
    const result = chapterArtifactDeltaOutputSchema.safeParse(makeArtifactNormalizationInput({characterMindDeltas: [makeMindDelta(input)]}));
    assert.equal(result.success, false, `must reject ${String(input)}`);
    assert.ok(result.error.issues.some(issue => issue.path.join(".") === "characterMindDeltas.0.confidence"));
  }
});

test("artifact format compatibility preserves the bounded repair policy and a complete wire example", () => {
  assert.equal(chapterArtifactDeltaPrompt.repairPolicy.maxAttempts, 1);
  assert.equal(chapterArtifactDeltaPrompt.fallbackRepairPolicy.maxAttempts, 0);
  const parsed = chapterArtifactDeltaOutputSchema.parse(chapterArtifactDeltaPrompt.structuredOutputHint.example);
  assert.ok(parsed.stateDeltas.foreshadowStates[0].title);
  assert.equal(typeof parsed.characterMindDeltas[0].confidence, "number");
  assert.equal(parsed.characterResourceDeltas[0].reviewDecision, "commit");
});
