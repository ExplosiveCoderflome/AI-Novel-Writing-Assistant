const assert = require("node:assert/strict");
const test = require("node:test");
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
  });
  coordinator.markChapterStatus = async () => undefined;
  coordinator.finishTraceRun = async () => undefined;

  const gateCalls = [];
  let acceptanceCalls = 0;
  let timelineCalls = 0;
  const originalListOpenConflicts = openConflictService.listOpenConflicts;
  openConflictService.listOpenConflicts = async () => [];
  try {
    coordinator.executeTimelineGate = async () => {
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
