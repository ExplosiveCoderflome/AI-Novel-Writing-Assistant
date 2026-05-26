const assert = require("node:assert/strict");
const test = require("node:test");
const promptRunner = require("../dist/prompting/core/promptRunner.js");
const { prisma } = require("../dist/db/prisma.js");
const { ChapterRuntimeCoordinator } = require("../dist/services/novel/runtime/ChapterRuntimeCoordinator.js");
const { PostGenerationStyleReviewRunner } = require("../dist/services/novel/runtime/PostGenerationStyleReviewRunner.js");
const { openConflictService } = require("../dist/services/state/OpenConflictService.js");

function createEmptyStream() {
  return {
    async *[Symbol.asyncIterator]() {},
  };
}

function createAssembledChapter() {
  return {
    novel: {
      title: "测试小说",
    },
    chapter: {
      id: "chapter-1",
      title: "第1章",
      order: 1,
      targetWordCount: 3000,
    },
    contextPackage: {
      chapter: {
        title: "第1章",
        targetWordCount: 3000,
        sceneCards: null,
        expectation: "主角完成第一次行动选择。",
      },
      characterRoster: [{ id: "character-1", name: "主角", role: "protagonist" }],
      nextAction: "write_chapter",
      pendingReviewProposalCount: 0,
      openAuditIssues: [],
      chapterWriteContext: {
        chapterMission: {
          objective: "主角完成第一次行动选择。",
          targetWordCount: 3000,
        },
      },
      continuation: {},
    },
  };
}

function createRepairAssembledChapter() {
  const now = new Date().toISOString();
  return {
    novel: {
      id: "novel-1",
      title: "测试小说",
    },
    chapter: {
      id: "chapter-1",
      title: "第1章",
      order: 1,
      content: "旧正文里有一段需要修复的内容。",
      expectation: "推进第一次反压。",
    },
    contextPackage: {
      chapter: {
        id: "chapter-1",
        title: "第1章",
        order: 1,
        content: "旧正文里有一段需要修复的内容。",
        expectation: "推进第一次反压。",
        supportingContextText: "",
      },
      plan: {
        id: "plan-1",
        chapterId: "chapter-1",
        planRole: "pressure",
        phaseLabel: "起势",
        title: "第1章计划",
        objective: "推进第一次反压。",
        participants: ["主角"],
        reveals: [],
        riskNotes: [],
        mustAdvance: ["推进反压结果"],
        mustPreserve: ["压迫感"],
        sourceIssueIds: [],
        replannedFromPlanId: null,
        hookTarget: "留下下一轮追击",
        rawPlanJson: null,
        scenes: [],
        createdAt: now,
        updatedAt: now,
      },
      stateSnapshot: null,
      openConflicts: [],
      storyWorldSlice: null,
      characterRoster: [{
        id: "char-1",
        name: "主角",
        role: "主角",
      }],
      creativeDecisions: [],
      openAuditIssues: [],
      previousChaptersSummary: [],
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
      ledgerPendingItems: [],
      ledgerUrgentItems: [],
      ledgerOverdueItems: [],
      ledgerSummary: null,
      characterDynamics: {
        novelId: "novel-1",
        currentVolume: {
          id: "volume-1",
          title: "第一卷",
          sortOrder: 1,
          startChapterOrder: 1,
          endChapterOrder: 10,
          currentChapterOrder: 1,
        },
        summary: "第一卷需要建立反压结果。",
        pendingCandidateCount: 0,
        characters: [],
        relations: [],
        candidates: [],
        factionTracks: [],
        assignments: [],
      },
      bookContract: {
        title: "测试小说",
        genre: "都市",
        targetAudience: "新手向男频读者",
        sellingPoint: "高压开局",
        first30ChapterPromise: "尽快兑现压迫与反压",
        narrativePov: "limited-third-person",
        pacePreference: "fast",
        emotionIntensity: "high",
        toneGuardrails: [],
        hardConstraints: [],
      },
      macroConstraints: null,
      volumeWindow: {
        volumeId: "volume-1",
        sortOrder: 1,
        title: "第一卷",
        missionSummary: "完成第一次反压",
        adjacentSummary: "",
        pendingPayoffs: [],
        softFutureSummary: null,
      },
      nextAction: "write_chapter",
      pendingReviewProposalCount: 0,
      chapterWriteContext: {
        bookContract: {
          title: "测试小说",
          genre: "都市",
          targetAudience: "新手向男频读者",
          sellingPoint: "高压开局",
          first30ChapterPromise: "尽快兑现压迫与反压",
          narrativePov: "limited-third-person",
          pacePreference: "fast",
          emotionIntensity: "high",
          toneGuardrails: [],
          hardConstraints: [],
        },
        macroConstraints: null,
        volumeWindow: {
          volumeId: "volume-1",
          sortOrder: 1,
          title: "第一卷",
          missionSummary: "完成第一次反压",
          adjacentSummary: "无",
          pendingPayoffs: [],
          softFutureSummary: "无",
        },
        chapterMission: {
          chapterId: "chapter-1",
          chapterOrder: 1,
          title: "第1章",
          objective: "推进第一次反压。",
          expectation: "推进第一次反压。",
          planRole: "pressure",
          hookTarget: "留下下一轮追击",
          mustAdvance: ["推进第一次反压。"],
          mustPreserve: ["压迫感"],
          riskNotes: [],
          targetWordCount: 3000,
        },
        nextAction: "write_chapter",
        chapterStateGoal: null,
        protectedSecrets: [],
        payoffDirectives: [],
        chapterBoundary: null,
        lengthBudget: null,
        scenePlan: null,
        participants: [{
          id: "char-1",
          name: "主角",
          role: "主角",
        }],
        characterBehaviorGuides: [],
        activeRelationStages: [],
        pendingCandidateGuards: [],
        ledgerPendingItems: [],
        ledgerUrgentItems: [],
        ledgerOverdueItems: [],
        ledgerSummary: null,
        localStateSummary: "主角正在准备第一次反压。",
        openConflictSummaries: ["第一次反压尚未真正落地。"],
        recentChapterSummaries: [],
        openingAntiRepeatHint: "Recent openings: none.",
        styleConstraints: [],
      },
    },
  };
}

function createAgentRuntime() {
  return {
    createChapterGenRun: async () => "run-1",
    finishChapterGenRun: async () => undefined,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("createChapterStream uses lightweight readiness without forcing execution contract", async () => {
  const calls = [];
  const assembled = createAssembledChapter();
  const validatedRequest = {
    model: "gpt-test",
    temperature: 0.4,
  };
  const coordinator = new ChapterRuntimeCoordinator({
    validateRequest: (input) => {
      calls.push("validate");
      return {
        ...input,
        ...validatedRequest,
      };
    },
    ensureNovelCharacters: async () => {
      calls.push("ensure_characters");
    },
    ensureChapterExecutionContract: async (novelId, chapterId, options) => {
      calls.push(["ensure_contract", novelId, chapterId, options]);
    },
    assembler: {
      assemble: async (novelId, chapterId, options) => {
        calls.push(["assemble", novelId, chapterId, options]);
        return assembled;
      },
    },
    chapterWritingGraph: {
      createChapterStream: async (input) => {
        calls.push(["writer", input.options]);
        return {
          stream: createEmptyStream(),
          onDone: async () => ({ finalContent: "正文草稿" }),
        };
      },
    },
    agentRuntime: createAgentRuntime(),
  });
  coordinator.markChapterStatus = async () => undefined;

  await coordinator.createChapterStream("novel-1", "chapter-1", { provider: "openai" });

  const ensureContractIndex = calls.findIndex((item) => Array.isArray(item) && item[0] === "ensure_contract");
  const assembleIndex = calls.findIndex((item) => Array.isArray(item) && item[0] === "assemble");
  const writerIndex = calls.findIndex((item) => Array.isArray(item) && item[0] === "writer");

  assert.notEqual(assembleIndex, -1);
  assert.notEqual(writerIndex, -1);
  assert.equal(ensureContractIndex, -1);
  assert.ok(assembleIndex < writerIndex);
});

test("finalizeChapterContent runs acceptance and timeline gates in parallel and caches repeated content", async () => {
  const coordinator = new ChapterRuntimeCoordinator({
    acceptanceAssessmentService: {
      assess: async () => {
        acceptanceCalls += 1;
        gateCalls.push(["acceptance-start", Date.now()]);
        await sleep(70);
        gateCalls.push(["acceptance-end", Date.now()]);
        return {
          assessment: {
            status: "accepted",
            score: {
              coherence: 98,
              pacing: 98,
              repetition: 98,
              engagement: 98,
              voice: 98,
              overall: 98,
            },
            blockingIssues: [],
            repairDirectives: [],
            missingObligations: [],
            repairability: "none",
            decisionReason: "ok",
            riskTags: [],
            assetSyncRecommendation: {
              priority: "normal",
              reason: "ok",
              requiresFullPayoffReconcile: false,
            },
            continuePolicy: "continue",
            summary: "ok",
          },
          score: {
            coherence: 98,
            pacing: 98,
            repetition: 98,
            engagement: 98,
            voice: 98,
            overall: 98,
          },
          issues: [],
          auditReports: [],
        };
      },
    },
    timelineFinalizer: {
      finalizeCurrentContent: async () => undefined,
      ensurePreviousChapterFinalized: async () => null,
    },
  });
  coordinator.markChapterStatus = async () => undefined;
  coordinator.finishTraceRun = async () => undefined;

  const gateCalls = [];
  let acceptanceCalls = 0;
  let timelineCalls = 0;
  const originalListOpenConflicts = openConflictService.listOpenConflicts;
  openConflictService.listOpenConflicts = async () => [];
  try {
    coordinator.qualityGateService.executeTimelineGate = async () => {
      timelineCalls += 1;
      gateCalls.push(["timeline-start", Date.now()]);
      await sleep(70);
      gateCalls.push(["timeline-end", Date.now()]);
      return {
        status: "passed",
        score: 0.98,
        issues: [],
      };
    };
    coordinator.buildRuntimePackage = () => ({
      audit: {
        score: {
          coherence: 98,
          pacing: 98,
          repetition: 98,
          engagement: 98,
          voice: 98,
          overall: 98,
        },
        openIssues: [],
        reports: [],
        hasBlockingIssues: false,
      },
      meta: {
        acceptanceStatus: "accepted",
        continuePolicy: "continue",
      },
      timelineCheck: {
        status: "passed",
      },
      context: {
        styleContext: null,
      },
    });

    const start = Date.now();
    await coordinator.finalizeChapterContent({
      novelId: "novel-1",
      chapterId: "chapter-1",
      request: {},
      contextPackage: {
        chapter: { id: "chapter-1", title: "第1章", order: 1, targetWordCount: 3000 },
        bookContract: null,
      },
      content: "正文",
      runId: null,
      startMs: null,
    });
    const duration = Date.now() - start;

    const firstAcceptanceStart = gateCalls.find((item) => item[0] === "acceptance-start")[1];
    const firstTimelineStart = gateCalls.find((item) => item[0] === "timeline-start")[1];
    const firstAcceptanceEnd = gateCalls.find((item) => item[0] === "acceptance-end")[1];
    const firstTimelineEnd = gateCalls.find((item) => item[0] === "timeline-end")[1];

    assert.equal(acceptanceCalls, 1);
    assert.equal(timelineCalls, 1);
    assert.ok(Math.abs(firstAcceptanceStart - firstTimelineStart) < 50);
    assert.ok(duration < 180);

    await coordinator.finalizeChapterContent({
      novelId: "novel-1",
      chapterId: "chapter-1",
      request: {},
      contextPackage: {
        chapter: { id: "chapter-1", title: "第1章", order: 1, targetWordCount: 3000 },
        bookContract: null,
      },
      content: "正文",
      runId: null,
      startMs: null,
    });

    assert.equal(acceptanceCalls, 1);
    assert.equal(timelineCalls, 1);
    assert.ok(firstAcceptanceEnd >= firstAcceptanceStart);
    assert.ok(firstTimelineEnd >= firstTimelineStart);
  } finally {
    openConflictService.listOpenConflicts = originalListOpenConflicts;
  }
});

test("finalizeChapterContent commits timeline only after chapter reaches a stable review result", async () => {
  let acceptanceMode = "repairable";
  const syncCalls = [];
  const finalizationCalls = [];
  const coordinator = new ChapterRuntimeCoordinator({
    acceptanceAssessmentService: {
      assess: async () => ({
        assessment: {
          status: acceptanceMode === "repairable" ? "repairable" : "accepted",
          score: {
            coherence: 95,
            pacing: 95,
            repetition: 95,
            engagement: 95,
            voice: 95,
            overall: 95,
          },
          blockingIssues: [],
          repairDirectives: [],
          missingObligations: [],
          repairability: acceptanceMode === "repairable" ? "rewrite_needed" : "none",
          decisionReason: acceptanceMode,
          riskTags: [],
          assetSyncRecommendation: {
            priority: "normal",
            reason: acceptanceMode,
            requiresFullPayoffReconcile: false,
          },
          continuePolicy: acceptanceMode === "repairable" ? "repair_once" : "continue",
          summary: acceptanceMode,
        },
        score: {
          coherence: 95,
          pacing: 95,
          repetition: 95,
          engagement: 95,
          voice: 95,
          overall: 95,
        },
        issues: [],
        auditReports: [],
      }),
    },
    artifactSyncService: {
      saveDraftAndArtifacts: async () => undefined,
      syncChapterArtifacts: async (...args) => {
        syncCalls.push(args);
      },
    },
    timelineFinalizer: {
      finalizeCurrentContent: async (input) => {
        finalizationCalls.push(input);
      },
      ensurePreviousChapterFinalized: async () => null,
    },
  });
  coordinator.markChapterStatus = async () => undefined;
  coordinator.finishTraceRun = async () => undefined;
  coordinator.qualityGateService.executeTimelineGate = async () => ({
    result: {
      status: "passed",
      score: 0.96,
      issues: [],
    },
    extractedEvents: [{
      title: "主角完成行动",
      summary: "本章关键推进",
      type: "plot",
      occurred: true,
      confidence: 0.96,
      stateChanges: [],
      possibleHooks: [],
    }],
    extractedHooks: [],
    timelineContext: {
      currentTime: {
        storyDayIndex: 1,
        label: "第一天",
      },
      openHooks: [],
      plannedEvents: [],
      forbiddenEvents: [],
      chapterObjective: null,
      mustAddressHooks: [],
      optionalHooks: [],
    },
  });
  coordinator.buildRuntimePackage = (input) => ({
    audit: {
      score: input.auditResult.score,
      openIssues: [],
      reports: [],
      hasBlockingIssues: false,
    },
    meta: {
      acceptanceStatus: input.acceptance.status,
      continuePolicy: input.acceptance.continuePolicy,
    },
    timelineCheck: input.timelineCheck,
    context: {
      styleContext: null,
    },
  });

  const originalListOpenConflicts = openConflictService.listOpenConflicts;
  openConflictService.listOpenConflicts = async () => [];

  try {
    await coordinator.finalizeChapterContent({
      novelId: "novel-1",
      chapterId: "chapter-1",
      request: {},
      contextPackage: {
        chapter: { id: "chapter-1", title: "第1章", order: 1, targetWordCount: 3000 },
        bookContract: null,
        timelineContext: {
          currentTime: {
            storyDayIndex: 1,
            label: "第一天",
          },
          openHooks: [],
          plannedEvents: [],
          forbiddenEvents: [],
          chapterObjective: null,
          mustAddressHooks: [],
          optionalHooks: [],
        },
      },
      content: "正文版本一",
      runId: null,
      startMs: null,
      deferArtifactBackgroundSync: true,
    });
    assert.equal(finalizationCalls.length, 0);
    assert.equal(syncCalls.length, 0);

    acceptanceMode = "accepted";
    await coordinator.finalizeChapterContent({
      novelId: "novel-1",
      chapterId: "chapter-1",
      request: {},
      contextPackage: {
        chapter: { id: "chapter-1", title: "第1章", order: 1, targetWordCount: 3000 },
        bookContract: null,
        timelineContext: {
          currentTime: {
            storyDayIndex: 1,
            label: "第一天",
          },
          openHooks: [],
          plannedEvents: [],
          forbiddenEvents: [],
          chapterObjective: null,
          mustAddressHooks: [],
          optionalHooks: [],
        },
      },
      content: "正文版本二",
      runId: null,
      startMs: null,
      deferArtifactBackgroundSync: true,
    });
    assert.equal(finalizationCalls.length, 1);
    assert.equal(syncCalls.length, 1);
    assert.equal(finalizationCalls[0].chapterId, "chapter-1");
    assert.equal(finalizationCalls[0].content, "正文版本二");
    assert.equal(finalizationCalls[0].sourceStage, "draft_accepted");
    assert.equal(finalizationCalls[0].timelineGate.extractedEvents.length, 1);
  } finally {
    openConflictService.listOpenConflicts = originalListOpenConflicts;
  }
});

test("createRepairStream escalates patch schema failures to a single heavy repair stream", async () => {
  const originalNovelFindUnique = prisma.novel.findUnique;
  const originalChapterFindFirst = prisma.chapter.findFirst;
  const originalBibleFindUnique = prisma.novelBible.findUnique;
  const originalChapterUpdate = prisma.chapter.update;
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const originalStreamTextPrompt = promptRunner.streamTextPrompt;

  const chapterUpdates = [];
  const syncedContents = [];
  const reviewCalls = [];
  const resolvedIssues = [];
  const frames = [];

  prisma.novel.findUnique = async () => ({ id: "novel-1", title: "测试小说" });
  prisma.chapter.findFirst = async () => ({
    id: "chapter-1",
    title: "第1章",
    content: "旧正文里有一段需要修复的内容。",
  });
  prisma.novelBible.findUnique = async () => ({ rawContent: "作品圣经" });
  prisma.chapter.update = async ({ data }) => {
    chapterUpdates.push(data);
    return { id: "chapter-1", ...data };
  };
  promptRunner.runStructuredPrompt = async () => {
    throw new Error("[{\"origin\":\"string\",\"code\":\"too_small\",\"minimum\":6,\"inclusive\":true,\"path\":[\"patches\",0,\"targetExcerpt\"],\"message\":\"Too small: expected string to have >=6 characters\"}]");
  };
  promptRunner.streamTextPrompt = async () => ({
    stream: {
      async *[Symbol.asyncIterator]() {
        yield { content: "全文修复片段" };
      },
    },
    complete: Promise.resolve({ output: "全文修复后的正文" }),
  });

  try {
    const coordinator = new ChapterRuntimeCoordinator({
      assembler: {
        assemble: async () => createRepairAssembledChapter(),
      },
      artifactSyncService: {
        async syncChapterArtifacts(_novelId, _chapterId, content) {
          syncedContents.push(content);
        },
      },
      reviewChapterAfterRepair: async (_novelId, _chapterId, options) => {
        reviewCalls.push(options.content);
        return {
          score: {
            coherence: 92,
            repetition: 93,
            pacing: 91,
            voice: 90,
            engagement: 94,
            overall: 92,
          },
          issues: [],
        };
      },
      resolveAuditIssues: async (_novelId, issueIds) => {
        resolvedIssues.push(issueIds);
      },
      timelineFinalizer: {
        finalizeCurrentContent: async () => undefined,
        ensurePreviousChapterFinalized: async () => null,
      },
    });

    const streamResult = await coordinator.createRepairStream("novel-1", "chapter-1", {
      repairMode: "light_repair",
      auditIssueIds: ["issue-1"],
      reviewIssues: [{
        severity: "high",
        category: "pacing",
        evidence: "第一次反压没有真正落地。",
        fixSuggestion: "让主角在本章拿到明确反压结果。",
      }],
    });

    let streamedContent = "";
    for await (const chunk of streamResult.stream) {
      streamedContent += chunk.content ?? "";
    }
    await streamResult.onDone(streamedContent, {
      writeFrame(frame) {
        frames.push(frame);
      },
    });

    assert.equal(streamedContent, "全文修复片段");
    assert.deepEqual(reviewCalls, ["全文修复后的正文"]);
    assert.deepEqual(syncedContents, ["全文修复后的正文"]);
    assert.deepEqual(resolvedIssues, [["issue-1"]]);
    assert.deepEqual(chapterUpdates.map((item) => item.generationState), ["repaired", "approved"]);
    assert.equal(frames.at(-1)?.status, "succeeded");
    assert.equal(frames.at(-1)?.phase, "completed");
  } finally {
    prisma.novel.findUnique = originalNovelFindUnique;
    prisma.chapter.findFirst = originalChapterFindFirst;
    prisma.novelBible.findUnique = originalBibleFindUnique;
    prisma.chapter.update = originalChapterUpdate;
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
    promptRunner.streamTextPrompt = originalStreamTextPrompt;
  }
});

test("createChapterStream does not block hot path on execution contract failure", async () => {
  const warnings = [];
  const originalWarn = console.warn;
  let assembledCalled = false;
  let contractCalled = false;

  console.warn = (...args) => {
    warnings.push(args);
  };

  try {
    const coordinator = new ChapterRuntimeCoordinator({
      validateRequest: (input) => input,
      ensureNovelCharacters: async () => undefined,
      ensureChapterExecutionContract: async () => {
        contractCalled = true;
        throw new Error("contract invalid");
      },
      assembler: {
        assemble: async () => {
          assembledCalled = true;
          return createAssembledChapter();
        },
      },
      chapterWritingGraph: {
        createChapterStream: async () => ({
          stream: createEmptyStream(),
          onDone: async () => ({ finalContent: "正文草稿" }),
        }),
      },
      agentRuntime: createAgentRuntime(),
    });
    coordinator.markChapterStatus = async () => undefined;

    await coordinator.createChapterStream("novel-1", "chapter-1", {});
    assert.equal(contractCalled, false);
    assert.equal(assembledCalled, true);
    assert.equal(warnings.length, 0);
  } finally {
    console.warn = originalWarn;
  }
});

test("createChapterStream blocks when state-driven decision requires review first", async () => {
  const assembled = createAssembledChapter();
  assembled.contextPackage.nextAction = "hold_for_review";
  assembled.contextPackage.pendingReviewProposalCount = 2;
  assembled.contextPackage.openAuditIssues = [{
    description: "pending review issue",
  }];
  const statusCalls = [];

  const coordinator = new ChapterRuntimeCoordinator({
    validateRequest: (input) => input,
    ensureNovelCharacters: async () => undefined,
    ensureChapterExecutionContract: async () => undefined,
    assembler: {
      assemble: async () => assembled,
    },
    chapterWritingGraph: {
      createChapterStream: async () => {
        throw new Error("writer should not run");
      },
    },
    agentRuntime: createAgentRuntime(),
  });
  coordinator.markChapterStatus = async (...args) => {
    statusCalls.push(args);
  };

  await assert.rejects(
    () => coordinator.createChapterStream("novel-1", "chapter-1", {}),
    /blocked until review is resolved/i,
  );
  assert.deepEqual(statusCalls, []);
});

test("createChapterStream lets full_book_autopilot continue past pending state proposals", async () => {
  const assembled = createAssembledChapter();
  assembled.contextPackage.nextAction = "hold_for_review";
  assembled.contextPackage.pendingReviewProposalCount = 2;
  assembled.contextPackage.openAuditIssues = [];
  const statusCalls = [];
  const writerCalls = [];

  const coordinator = new ChapterRuntimeCoordinator({
    validateRequest: (input) => input,
    ensureNovelCharacters: async () => undefined,
    ensureChapterExecutionContract: async () => undefined,
    assembler: {
      assemble: async () => assembled,
    },
    chapterWritingGraph: {
      createChapterStream: async (input) => {
        writerCalls.push(input);
        return {
          stream: createEmptyStream(),
          onDone: async () => ({ finalContent: "chapter draft" }),
        };
      },
    },
    agentRuntime: createAgentRuntime(),
  });
  coordinator.markChapterStatus = async (...args) => {
    statusCalls.push(args);
  };

  await coordinator.createChapterStream("novel-1", "chapter-1", {
    controlPolicy: {
      kickoffMode: "director_start",
      advanceMode: "full_book_autopilot",
      reviewCheckpoints: [],
      autoExecutionRange: { mode: "book" },
    },
  });

  assert.equal(writerCalls.length, 1);
  assert.deepEqual(statusCalls, [["chapter-1", "generating"]]);
});

test("createChapterStream retries once before failing empty generated content", async () => {
  const assembled = createAssembledChapter();
  const writerCalls = [];
  const statusCalls = [];
  const finalized = [];

  const coordinator = new ChapterRuntimeCoordinator({
    validateRequest: (input) => input,
    ensureNovelCharacters: async () => undefined,
    ensureChapterExecutionContract: async () => undefined,
    assembler: {
      assemble: async () => assembled,
    },
    chapterWritingGraph: {
      createChapterStream: async () => {
        writerCalls.push("writer");
        const currentCall = writerCalls.length;
        return {
          stream: createEmptyStream(),
          onDone: async () => ({
            finalContent: currentCall === 1 ? "   " : "重试后的正文",
            artifactsAlreadySynced: true,
          }),
        };
      },
    },
    agentRuntime: createAgentRuntime(),
  });
  coordinator.markChapterStatus = async (...args) => {
    statusCalls.push(args);
  };
  coordinator.finalizeChapterContent = async (input) => {
    finalized.push(input.content);
    return {
      finalContent: input.content,
      runtimePackage: {
        audit: { hasBlockingIssues: false },
      },
    };
  };

  const result = await coordinator.createChapterStream("novel-1", "chapter-1", {});
  const done = await result.onDone("", { writeFrame: () => undefined });

  assert.equal(writerCalls.length, 2);
  assert.deepEqual(statusCalls, [["chapter-1", "generating"]]);
  assert.deepEqual(finalized, ["重试后的正文"]);
  assert.equal(done.fullContent, "重试后的正文");
});

test("runPipelineChapter does not leave a blocked chapter in generating status", async () => {
  const assembled = createAssembledChapter();
  assembled.contextPackage.nextAction = "hold_for_review";
  assembled.contextPackage.pendingReviewProposalCount = 1;
  assembled.contextPackage.openAuditIssues = [{
    description: "chapter needs review",
  }];
  const statusCalls = [];

  const coordinator = new ChapterRuntimeCoordinator({
    validateRequest: (input) => input,
    ensureNovelCharacters: async () => undefined,
    ensureChapterExecutionContract: async () => undefined,
    assembler: {
      assemble: async () => assembled,
    },
    chapterWritingGraph: {
      createChapterStream: async () => {
        throw new Error("writer should not run");
      },
    },
    agentRuntime: createAgentRuntime(),
  });
  coordinator.markChapterStatus = async (...args) => {
    statusCalls.push(args);
  };

  await assert.rejects(
    () => coordinator.runPipelineChapter("novel-1", "chapter-1", {}),
    /blocked until review is resolved/i,
  );
  assert.deepEqual(statusCalls, []);
});

test("post-generation style review policy disables detection and rewrite", async () => {
  let detectionCalls = 0;
  let rewriteCalls = 0;
  const runner = new PostGenerationStyleReviewRunner({
    postGenerationStyleReviewPolicyResolver: {
      resolve: async () => ({ enabled: false }),
    },
    styleDetectionService: {
      check: async () => {
        detectionCalls += 1;
        throw new Error("style detection should not run");
      },
    },
    styleRewriteService: {
      rewrite: async () => {
        rewriteCalls += 1;
        throw new Error("style rewrite should not run");
      },
    },
  });

  const result = await runner.run({
    novelId: "novel-1",
    chapterId: "chapter-1",
    request: {},
    contextPackage: {
      styleContext: {
        compiledBlocks: {
          generationSystemAddendum: "anti-ai prompt",
        },
      },
    },
    content: "正文草稿",
  });

  assert.equal(detectionCalls, 0);
  assert.equal(rewriteCalls, 0);
  assert.deepEqual(result, {
    report: null,
    autoRewritten: false,
    originalContent: null,
    finalContent: "正文草稿",
  });
});

test("post-generation style review policy keeps existing detection and rewrite when enabled", async () => {
  const calls = [];
  const runner = new PostGenerationStyleReviewRunner({
    postGenerationStyleReviewPolicyResolver: {
      resolve: async () => ({ enabled: true }),
    },
    styleDetectionService: {
      check: async () => {
        calls.push("detect");
        return {
          summary: "需要修正",
          riskScore: 45,
          canAutoRewrite: true,
          appliedRuleIds: ["rule-1"],
          violations: [{
            ruleName: "降低模板表达",
            ruleType: "forbidden",
            severity: "medium",
            excerpt: "仿佛",
            reason: "模板词集中",
            suggestion: "降低模板词密度",
            canAutoRewrite: true,
          }],
        };
      },
    },
    styleRewriteService: {
      rewrite: async () => {
        calls.push("rewrite");
        return { content: "修正正文" };
      },
    },
  });

  const result = await runner.run({
    novelId: "novel-1",
    chapterId: "chapter-1",
    request: {},
    contextPackage: {
      styleContext: {
        compiledBlocks: {
          generationSystemAddendum: "anti-ai prompt",
        },
      },
    },
    content: "正文草稿",
  });

  assert.deepEqual(calls, ["detect", "rewrite"]);
  assert.equal(result.autoRewritten, true);
  assert.equal(result.originalContent, "正文草稿");
  assert.equal(result.finalContent, "修正正文");
  assert.equal(result.report.riskScore, 45);
});
