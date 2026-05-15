const test = require("node:test");
const assert = require("node:assert/strict");

const {
  chapterAcceptanceAssessmentSchema,
} = require("../dist/prompting/prompts/novel/chapterAcceptance.prompts.js");
const {
  chapterArtifactDeltaOutputSchema,
} = require("../dist/prompting/prompts/novel/chapterArtifactDelta.prompts.js");

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
      statusAfter: "available",
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
