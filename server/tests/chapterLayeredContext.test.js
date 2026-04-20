const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildChapterWriteContext,
  buildChapterReviewContext,
  buildChapterRepairContext,
  buildChapterWriterContextBlocks,
  buildChapterReviewContextBlocks,
  buildChapterRepairContextBlocks,
} = require("../dist/prompting/prompts/novel/chapterLayeredContext.js");

function createContextPackage() {
  const now = new Date().toISOString();
  return {
    chapter: {
      id: "chapter-5",
      title: "第5章 反压落点",
      order: 5,
      content: null,
      expectation: "完成第一次明确反压",
      targetWordCount: 3000,
      sceneCards: JSON.stringify({
        targetWordCount: 3000,
        lengthBudget: {
          targetWordCount: 3000,
          softMinWordCount: 2550,
          softMaxWordCount: 3450,
          hardMaxWordCount: 3750,
        },
        scenes: [
          {
            key: "scene_1",
            title: "接住情报",
            purpose: "让女二带来的情报成为反压支点。",
            mustAdvance: ["情报到手"],
            mustPreserve: ["压迫感"],
            entryState: "主角暂时被压制。",
            exitState: "主角确认反压入口。",
            forbiddenExpansion: ["不要提前揭露幕后黑手"],
            targetWordCount: 900,
          },
          {
            key: "scene_2",
            title: "第一次反压",
            purpose: "把情报转成可见收益。",
            mustAdvance: ["第一次反压兑现"],
            mustPreserve: ["资源差距还在"],
            entryState: "主角拿到情报准备落子。",
            exitState: "敌方被迫应对。",
            forbiddenExpansion: ["不要直接大决战"],
            targetWordCount: 1200,
          },
          {
            key: "scene_3",
            title: "尾段钩子",
            purpose: "抛出更大威胁，拉向下一章。",
            mustAdvance: ["新的威胁出现"],
            mustPreserve: ["本章反压收益有效"],
            entryState: "主角刚拿到阶段性主动权。",
            exitState: "读者知道下一章压力更高。",
            forbiddenExpansion: ["不要展开下章战斗"],
            targetWordCount: 900,
          },
        ],
      }),
      supportingContextText: "",
    },
    plan: {
      id: "plan-5",
      chapterId: "chapter-5",
      planRole: "pressure",
      phaseLabel: "反压前夜",
      title: "第5章计划",
      objective: "完成第一次明确反压",
      participants: ["主角"],
      reveals: ["女二手里还有半份情报"],
      riskNotes: ["不要抢跑幕后黑手"],
      mustAdvance: ["完成第一次明确反压"],
      mustPreserve: ["压迫感和资源差距"],
      sourceIssueIds: [],
      replannedFromPlanId: null,
      hookTarget: "把交换情报做成新的悬念",
      rawPlanJson: null,
      scenes: [],
      createdAt: now,
      updatedAt: now,
    },
    nextAction: "write_chapter",
    chapterStateGoal: {
      chapterId: "chapter-5",
      chapterOrder: 5,
      summary: "Push the counterattack into a visible gain.",
      targetConflicts: ["The first counterattack must land."],
      targetRelationships: ["Protagonist: tentative alliance"],
      targetPayoffs: ["First payoff after securing the key intel."],
      protectedSecrets: ["Hidden mastermind identity"],
    },
    protectedSecrets: ["Hidden mastermind identity"],
    pendingReviewProposalCount: 0,
    stateSnapshot: {
      id: "snapshot-4",
      novelId: "novel-1",
      sourceChapterId: "chapter-4",
      summary: "主角暂时被压制，女二失联但仍掌握关键线索。",
      rawStateJson: null,
      characterStates: [],
      relationStates: [],
      informationStates: [],
      foreshadowStates: [],
      createdAt: now,
      updatedAt: now,
    },
    openConflicts: [{
      id: "conflict-1",
      novelId: "novel-1",
      chapterId: "chapter-4",
      sourceSnapshotId: null,
      sourceIssueId: null,
      sourceType: "state",
      conflictType: "plot",
      conflictKey: "first-counterattack",
      title: "第一次反压仍未落地",
      summary: "主角还没有把反击落成实际收益，压迫感正在透支。",
      severity: "high",
      status: "open",
      evidence: ["上一章只拿到半份情报。"],
      affectedCharacterIds: ["char-2"],
      resolutionHint: "让女二带来的情报成为反压支点。",
      lastSeenChapterOrder: 4,
      createdAt: now,
      updatedAt: now,
    }],
    storyWorldSlice: null,
    characterRoster: [
      {
        id: "char-1",
        name: "主角",
        role: "主角",
        personality: "谨慎但不服输",
        currentState: "被压制",
        currentGoal: "抢回主动权",
      },
      {
        id: "char-2",
        name: "女二",
        role: "盟友",
        personality: "冷静克制",
        currentState: "暂时失联",
        currentGoal: "把关键情报送到主角手里",
      },
    ],
    creativeDecisions: [],
    openAuditIssues: [{
      id: "issue-1",
      reportId: "report-1",
      auditType: "plot",
      severity: "high",
      code: "plot_payoff_missing",
      description: "上一轮没有完成预期兑现。",
      evidence: "反压只停留在口头层面。",
      fixSuggestion: "必须给读者一个明确的反压结果。",
      status: "open",
      createdAt: now,
      updatedAt: now,
    }],
    previousChaptersSummary: [
      "上一章：主角踩进陷阱，但确认女二仍掌握关键情报。",
    ],
    openingHint: "Recent openings: none.",
    continuation: {
      enabled: false,
      sourceType: null,
      sourceId: null,
      sourceTitle: "",
      systemRule: "",
      humanBlock: "",
      antiCopyCorpus: [],
    },
    styleContext: null,
    characterDynamics: {
      novelId: "novel-1",
      currentVolume: {
        id: "volume-1",
        title: "第一卷",
        sortOrder: 1,
        startChapterOrder: 1,
        endChapterOrder: 10,
        currentChapterOrder: 5,
      },
      summary: "当前卷需要完成第一次反压，女二缺席风险已经升高。",
      pendingCandidateCount: 1,
      characters: [
        {
          characterId: "char-1",
          name: "主角",
          role: "主角",
          castRole: "lead",
          currentState: "被压制",
          currentGoal: "抢回主动权",
          volumeRoleLabel: "破局者",
          volumeResponsibility: "完成第一次反压",
          isCoreInVolume: true,
          plannedChapterOrders: [5],
          appearanceCount: 4,
          lastAppearanceChapterOrder: 4,
          absenceSpan: 0,
          absenceRisk: "none",
          factionLabel: "主角方",
          stanceLabel: "主动反扑",
        },
        {
          characterId: "char-2",
          name: "女二",
          role: "盟友",
          castRole: "support",
          currentState: "暂时失联",
          currentGoal: "把关键情报送到主角手里",
          volumeRoleLabel: "暗线持钥者",
          volumeResponsibility: "补足情报链并触发反压机会",
          isCoreInVolume: true,
          plannedChapterOrders: [3, 5, 6],
          appearanceCount: 2,
          lastAppearanceChapterOrder: 2,
          absenceSpan: 3,
          absenceRisk: "high",
          factionLabel: "主角方",
          stanceLabel: "隐线支援",
        },
      ],
      relations: [{
        id: "rel-1",
        novelId: "novel-1",
        relationId: "pair-1",
        sourceCharacterId: "char-1",
        targetCharacterId: "char-2",
        sourceCharacterName: "主角",
        targetCharacterName: "女二",
        volumeId: "volume-1",
        volumeTitle: "第一卷",
        chapterId: null,
        chapterOrder: 5,
        stageLabel: "互试探合作",
        stageSummary: "双方都要靠交换信息来建立基本信任。",
        nextTurnPoint: "交换关键情报",
        sourceType: "projection",
        confidence: 0.9,
        isCurrent: true,
        createdAt: now,
        updatedAt: now,
      }],
      candidates: [{
        id: "candidate-1",
        novelId: "novel-1",
        sourceChapterId: "chapter-4",
        sourceChapterOrder: 4,
        proposedName: "林策",
        proposedRole: "情报商",
        summary: "可能承接黑市情报链。",
        evidence: ["第四章提到一个只闻其名的黑市联系人。"],
        matchedCharacterId: null,
        status: "pending",
        confidence: 0.72,
        createdAt: now,
        updatedAt: now,
      }],
      factionTracks: [],
      assignments: [],
    },
    bookContract: {
      title: "测试小说",
      genre: "都市",
      targetAudience: "新手向男频读者",
      sellingPoint: "高压开局与持续反压",
      first30ChapterPromise: "前三十章稳定兑现压迫与反压快感",
      narrativePov: "limited-third-person",
      pacePreference: "fast",
      emotionIntensity: "high",
      toneGuardrails: ["不写空泛鸡汤"],
      hardConstraints: ["主线必须持续升级"],
    },
    macroConstraints: {
      sellingPoint: "高压开局与持续反压",
      coreConflict: "主角在压迫中夺回主动权",
      mainHook: "更大的幕后势力正在浮现",
      progressionLoop: "每次反压都会引来更强反扑",
      growthPath: "从被动求生到主动设局",
      endingFlavor: "阶段性大胜但保留更大战场",
      hardConstraints: ["不能跳过压迫链兑现"],
    },
    volumeWindow: {
      volumeId: "volume-1",
      sortOrder: 1,
      title: "第一卷",
      missionSummary: "建立压迫源并完成第一次反压",
      adjacentSummary: "下一卷升级敌我盘面",
      pendingPayoffs: ["伏笔A"],
      softFutureSummary: "第二卷会引出更高层势力。",
    },
    ledgerPendingItems: [{
      id: "ledger-1",
      novelId: "novel-1",
      ledgerKey: "intel-key",
      title: "女二情报钥匙",
      summary: "女二带来的情报必须转成第一次反压的具体动作。",
      scopeType: "volume",
      currentStatus: "pending_payoff",
      targetStartChapterOrder: 5,
      targetEndChapterOrder: 6,
      firstSeenChapterOrder: 3,
      lastTouchedChapterOrder: 4,
      lastTouchedChapterId: "chapter-4",
      setupChapterId: "chapter-3",
      payoffChapterId: null,
      lastSnapshotId: "snapshot-4",
      sourceRefs: [],
      evidence: [{
        summary: "第四章已经说明女二手上掌握关键情报。",
        chapterId: "chapter-4",
        chapterOrder: 4,
      }],
      riskSignals: [],
      statusReason: "本章需要把女二情报转成实际反压动作。",
      confidence: 0.93,
      createdAt: now,
      updatedAt: now,
    }],
    ledgerUrgentItems: [{
      id: "ledger-2",
      novelId: "novel-1",
      ledgerKey: "black-market-account",
      title: "黑市账户异常",
      summary: "黑市账户的异常波动必须在本章被主角明确触碰。",
      scopeType: "chapter",
      currentStatus: "setup",
      targetStartChapterOrder: 5,
      targetEndChapterOrder: 5,
      firstSeenChapterOrder: 4,
      lastTouchedChapterOrder: 4,
      lastTouchedChapterId: "chapter-4",
      setupChapterId: "chapter-4",
      payoffChapterId: null,
      lastSnapshotId: "snapshot-4",
      sourceRefs: [],
      evidence: [{
        summary: "第四章提到账本上有一笔异常转账。",
        chapterId: "chapter-4",
        chapterOrder: 4,
      }],
      riskSignals: [{
        code: "payoff_missing_progress",
        severity: "medium",
        summary: "已经进入应触碰窗口。",
      }],
      statusReason: "窗口已经压到第5章，不能继续只提不动。",
      confidence: 0.88,
      createdAt: now,
      updatedAt: now,
    }],
    ledgerOverdueItems: [{
      id: "ledger-3",
      novelId: "novel-1",
      ledgerKey: "missing-payoff",
      title: "第一次反压收益",
      summary: "读者承诺的第一次反压收益还没有真正兑现。",
      scopeType: "volume",
      currentStatus: "overdue",
      targetStartChapterOrder: 4,
      targetEndChapterOrder: 4,
      firstSeenChapterOrder: 2,
      lastTouchedChapterOrder: 4,
      lastTouchedChapterId: "chapter-4",
      setupChapterId: "chapter-2",
      payoffChapterId: null,
      lastSnapshotId: "snapshot-4",
      sourceRefs: [],
      evidence: [{
        summary: "前四章一直在铺垫，但还没有形成读者可感知的收益。",
        chapterId: "chapter-4",
        chapterOrder: 4,
      }],
      riskSignals: [{
        code: "payoff_overdue",
        severity: "high",
        summary: "已经超过目标窗口。",
      }],
      statusReason: "第4章承诺的反压收益仍未落地。",
      confidence: 0.95,
      createdAt: now,
      updatedAt: now,
    }],
    ledgerSummary: {
      totalCount: 3,
      pendingCount: 1,
      urgentCount: 1,
      overdueCount: 1,
      paidOffCount: 0,
      failedCount: 0,
      updatedAt: now,
    },
    chapterMission: null,
    chapterWriteContext: null,
    chapterReviewContext: null,
    chapterRepairContext: null,
    promptBudgetProfiles: [],
  };
}

test("chapter layered contexts carry volume mission, character duties and repair guardrails", () => {
  const contextPackage = createContextPackage();
  const writeContext = buildChapterWriteContext({
    bookContract: contextPackage.bookContract,
    macroConstraints: contextPackage.macroConstraints,
    volumeWindow: contextPackage.volumeWindow,
    contextPackage,
  });
  const reviewContext = buildChapterReviewContext(writeContext, contextPackage);
  const repairContext = buildChapterRepairContext({
    writeContext,
    contextPackage,
    issues: [{
      severity: "high",
      category: "pacing",
      evidence: "上一轮没有把女二情报落成反压结果。",
      fixSuggestion: "让女二的情报直接推动第一次反压兑现。",
    }],
  });

  assert.ok(writeContext.participants.some((item) => item.name === "女二"));
  assert.ok(writeContext.characterBehaviorGuides.some((item) => item.volumeResponsibility.includes("反压机会")));
  assert.ok(writeContext.characterBehaviorGuides.some((item) => item.absenceRisk === "high"));
  assert.ok(writeContext.pendingCandidateGuards.some((item) => item.proposedName === "林策"));
  assert.ok(writeContext.openConflictSummaries.some((item) => item.includes("第一次反压仍未落地")));
  assert.equal(writeContext.ledgerSummary.overdueCount, 1);
  assert.equal(writeContext.chapterMission.targetWordCount, 3000);
  assert.equal(writeContext.nextAction, "write_chapter");
  assert.equal(writeContext.lengthBudget.targetWordCount, 3000);
  assert.equal(writeContext.scenePlan.scenes.length, 3);
  assert.equal(writeContext.scenePlan.scenes[1].title, "第一次反压");
  assert.ok(writeContext.chapterStateGoal.summary.includes("visible gain"));
  assert.ok(reviewContext.structureObligations.includes("volume mission: 建立压迫源并完成第一次反压"));
  assert.ok(reviewContext.structureObligations.some((item) => item.includes("pending payoff: 女二情报钥匙")));
  assert.ok(reviewContext.structureObligations.some((item) => item.includes("urgent payoff: 黑市账户异常")));
  assert.ok(reviewContext.structureObligations.some((item) => item.includes("overdue payoff: 第一次反压收益")));
  assert.ok(repairContext.allowedEditBoundaries.some((item) => item.includes("Pending character candidates remain read-only")));
  assert.ok(repairContext.allowedEditBoundaries.some((item) => item.includes("女二")));
  assert.ok(repairContext.allowedEditBoundaries.some((item) => item.includes("urgent payoff thread: 黑市账户异常")));
  assert.ok(repairContext.allowedEditBoundaries.some((item) => item.includes("overdue payoff pressure: 第一次反压收益")));

  const writerBlocks = buildChapterWriterContextBlocks(writeContext);
  const reviewBlocks = buildChapterReviewContextBlocks(reviewContext);
  const repairBlocks = buildChapterRepairContextBlocks(repairContext);

  assert.ok(writerBlocks.some((block) => (
    block.id === "scene_plan"
    && /Scene count: 3/.test(block.content)
    && /第一次反压 \[1200\]/.test(block.content)
  )));
  assert.ok(writerBlocks.some((block) => (
    block.id === "payoff_ledger"
    && /Payoff ledger summary: pending=1, urgent=1, overdue=1, paid_off=0/.test(block.content)
    && /Canonical pending payoffs/.test(block.content)
    && /Overdue payoffs/.test(block.content)
  )));
  assert.ok(reviewBlocks.some((block) => (
    block.id === "character_dynamics"
    && /Character behavior guidance/.test(block.content)
    && /Pending candidate guardrails/.test(block.content)
  )));
  assert.ok(reviewBlocks.some((block) => (
    block.id === "structure_obligations"
    && /urgent payoff: 黑市账户异常/.test(block.content)
    && /overdue payoff: 第一次反压收益/.test(block.content)
  )));
  assert.ok(reviewBlocks.some((block) => (
    block.id === "chapter_mission"
    && /Target length: around 3000 Chinese characters/.test(block.content)
    && /State-driven next action: write_chapter/.test(block.content)
    && /2550-3450/.test(block.content)
  )));
  assert.ok(writerBlocks.some((block) => (
    block.id === "state_goal"
    && /Protected secrets/.test(block.content)
  )));
  assert.ok(repairBlocks.some((block) => block.id === "structure_obligations" && /volume mission/.test(block.content)));
  assert.ok(repairBlocks.some((block) => block.id === "repair_boundaries" && /read-only/.test(block.content)));
  assert.ok(repairBlocks.some((block) => block.id === "repair_boundaries" && /do not disclose/.test(block.content)));
});
