const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolvePromptContextBlocksForAsset,
} = require("../dist/prompting/context/promptContextResolution.js");
const {
  chapterWriterPrompt,
} = require("../dist/prompting/prompts/novel/chapterWriter.prompts.js");
const {
  directorWorkspaceAnalysisPrompt,
} = require("../dist/prompting/prompts/novel/directorWorkspaceAnalysis.prompts.js");

function buildChapterWriteContext() {
  return {
    bookContract: {
      title: "测试小说",
      genre: "都市",
      targetAudience: "新手读者",
      sellingPoint: "高压开局后的反压",
      first30ChapterPromise: "尽快兑现压迫、反压和更大悬念",
      narrativePov: "limited-third-person",
      pacePreference: "fast",
      emotionIntensity: "high",
      toneGuardrails: ["直接进入冲突"],
      hardConstraints: ["不要跳过反压结果"],
    },
    macroConstraints: {
      sellingPoint: "高压反压",
      coreConflict: "主角在压迫中夺回主动权",
      mainHook: "幕后势力逐步显形",
      progressionLoop: "每次反压都会引来更强反扑",
      growthPath: "从被动求生到主动设局",
      endingFlavor: "阶段胜利后保留更大危机",
      hardConstraints: ["不能用总结替代行动"],
    },
    volumeWindow: {
      volumeId: "volume-1",
      sortOrder: 1,
      title: "第一卷",
      missionSummary: "建立压迫源并完成首次反击",
      adjacentSummary: "无",
      pendingPayoffs: ["伏笔A"],
      softFutureSummary: "第二卷扩大冲突",
    },
    chapterMission: {
      chapterId: "chapter-1",
      chapterOrder: 1,
      title: "旧街反压",
      objective: "让主角完成第一次有效反击",
      expectation: "推进压迫、选择和反压结果",
      targetWordCount: 2800,
      planRole: "pressure",
      hookTarget: "留下幕后追踪者线索",
      mustAdvance: ["主角拿到反压筹码"],
      mustPreserve: ["幕后身份仍隐藏"],
      riskNotes: ["不要解释终局机制"],
    },
    nextAction: "draft_chapter",
    chapterStateGoal: null,
    protectedSecrets: [],
    lengthBudget: null,
    scenePlan: null,
    participants: [{
      id: "char-1",
      name: "主角",
      role: "主角",
      personality: "倔强",
      currentState: "受压",
      currentGoal: "翻盘",
    }],
    characterBehaviorGuides: [],
    activeRelationStages: [],
    pendingCandidateGuards: [],
    localStateSummary: "主角刚被逼到旧街角落。",
    openConflictSummaries: ["第一次反压尚未真正落地。"],
    ledgerPendingItems: [],
    ledgerUrgentItems: [],
    ledgerOverdueItems: [],
    ledgerSummary: null,
    characterResourceContext: null,
    recentChapterSummaries: ["上一章主角被对手堵在旧街。"],
    openingAntiRepeatHint: "不要再用环境铺陈开头。",
    styleContract: null,
    styleConstraints: [],
    continuationConstraints: [],
    ragFacts: [],
  };
}

function buildWorkspaceInventory() {
  return {
    novelId: "novel-1",
    novelTitle: "测试小说",
    hasBookContract: true,
    hasStoryMacro: true,
    hasCharacters: true,
    hasVolumeStrategy: true,
    hasChapterPlan: true,
    chapterCount: 10,
    draftedChapterCount: 3,
    approvedChapterCount: 2,
    pendingRepairChapterCount: 1,
    hasActivePipelineJob: false,
    hasActiveDirectorRun: true,
    hasWorldBinding: true,
    hasSourceKnowledge: false,
    hasContinuationAnalysis: false,
    missingArtifactTypes: [],
    staleArtifacts: [],
    protectedUserContentArtifacts: [],
    needsRepairArtifacts: [],
    artifacts: [],
  };
}

test("chapter writer runtime path resolves standard broker context groups", async () => {
  const resolved = await resolvePromptContextBlocksForAsset({
    asset: chapterWriterPrompt,
    executionContext: {
      entrypoint: "chapter_pipeline",
      novelId: "novel-1",
      chapterId: "chapter-1",
      metadata: {
        chapterWriteContext: buildChapterWriteContext(),
      },
    },
  });

  const groups = new Set(resolved.blocks.map((block) => block.group));
  assert.deepEqual(resolved.brokerResolution.missingRequiredGroups, ["style_contract"]);
  assert.equal(groups.has("book_contract"), true);
  assert.equal(groups.has("story_macro"), true);
  assert.equal(groups.has("chapter_mission"), true);
  assert.equal(groups.has("volume_window"), true);
  assert.equal(groups.has("participant_subset"), true);
  assert.equal(groups.has("local_state"), true);
});

test("workspace analysis prompt resolves inventory through context broker", async () => {
  const resolved = await resolvePromptContextBlocksForAsset({
    asset: directorWorkspaceAnalysisPrompt,
    executionContext: {
      entrypoint: "auto_director",
      novelId: "novel-1",
      metadata: {
        workspaceInventory: buildWorkspaceInventory(),
      },
    },
  });

  assert.deepEqual(resolved.brokerResolution.missingRequiredGroups, []);
  assert.deepEqual(resolved.blocks.map((block) => block.group), ["workspace_inventory"]);
  assert.match(resolved.blocks[0].content, /"novelId": "novel-1"/);
});
