const test = require("node:test");
const assert = require("node:assert/strict");

const {
  chapterAcceptanceAssessmentSchema,
} = require("../dist/prompting/prompts/novel/chapterAcceptance.prompts.js");
const {
  chapterArtifactDeltaOutputSchema,
} = require("../dist/prompting/prompts/novel/chapterArtifactDelta.prompts.js");
const {
  characterResourceExtractionOutputSchema,
} = require("../dist/prompting/prompts/novel/characterResource.promptSchemas.js");
const {
  timelineExtractorOutputSchema,
} = require("../dist/prompting/prompts/novel/timelineExtractor.prompts.js");

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
