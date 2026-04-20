const assert = require("node:assert/strict");
const test = require("node:test");
const { ChapterRuntimeCoordinator } = require("../dist/services/novel/runtime/ChapterRuntimeCoordinator.js");

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
        targetWordCount: 3000,
        sceneCards: null,
      },
      nextAction: "write_chapter",
      pendingReviewProposalCount: 0,
      openAuditIssues: [],
      chapterWriteContext: {
        chapterMission: {
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

test("createChapterStream assembles runtime context without refreshing execution contract", async () => {
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
  assert.ok(assembleIndex < writerIndex);
  assert.equal(ensureContractIndex, -1);
});

test("createChapterStream does not touch execution contract refresh even if the hook would fail", async () => {
  const warnings = [];
  const originalWarn = console.warn;
  let assembledCalled = false;

  console.warn = (...args) => {
    warnings.push(args);
  };

  try {
    const coordinator = new ChapterRuntimeCoordinator({
      validateRequest: (input) => input,
      ensureNovelCharacters: async () => undefined,
      ensureChapterExecutionContract: async () => {
        throw new Error("should not run");
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

    const result = await coordinator.createChapterStream("novel-1", "chapter-1", {});
    assert.ok(result.stream);
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

  const coordinator = new ChapterRuntimeCoordinator({
    validateRequest: (input) => input,
    ensureNovelCharacters: async () => undefined,
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
  coordinator.markChapterStatus = async () => undefined;

  await assert.rejects(
    () => coordinator.createChapterStream("novel-1", "chapter-1", {}),
    /blocked until review is resolved/i,
  );
});
