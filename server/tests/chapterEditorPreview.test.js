const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");
const { NovelService } = require("../dist/services/novel/NovelService.js");
const { NovelChapterEditorService } = require("../dist/services/novel/chapterEditor/NovelChapterEditorService.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

test("NovelChapterEditorService returns preview candidates and passes constraints into prompt input", async () => {
  let capturedPromptInput = null;
  const service = new NovelChapterEditorService(
    {
      novel: {
        findUnique: async () => ({
          world: null,
          characters: [{
            name: "Lin Zhou",
            role: "lead",
            currentState: "holding steady",
            currentGoal: "stabilize the scene",
          }],
          chapters: [{
            id: "chapter-1",
            title: "Test Chapter",
            order: 7,
            content: "alpha\n\nbeta",
            expectation: "push conflict forward",
          }],
        }),
      },
    },
    async ({ promptInput }) => {
      capturedPromptInput = promptInput;
      return {
        output: {
          candidates: [{
            label: "More natural",
            content: "alpha revised",
            summary: "Keep the original intent and make it read more naturally.",
            semanticTags: ["polish", "voice"],
          }, {
            label: "More restrained",
            content: "alpha compressed",
            summary: "Compress modifiers and keep the scene moving.",
            semanticTags: ["compress", "retain_info"],
          }],
        },
      };
    },
  );

  const result = await service.previewRewrite("novel-1", "chapter-1", {
    operation: "polish",
    contentSnapshot: "alpha\n\nbeta",
    targetRange: {
      from: 0,
      to: 5,
      text: "alpha",
    },
    context: {
      beforeParagraphs: [],
      afterParagraphs: ["beta"],
    },
    chapterContext: {
      goalSummary: "push conflict forward",
      chapterSummary: "the lead braces for the next hit",
      styleSummary: "tight third-person limited, restrained tone",
      characterStateSummary: "Lin Zhou is still holding steady",
      worldConstraintSummary: "do not introduce any new setting rules",
    },
    constraints: {
      keepFacts: true,
      keepPov: true,
      noUnauthorizedSetting: true,
      preserveCoreInfo: true,
    },
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.4,
  });

  assert.equal(result.operation, "polish");
  assert.equal(result.targetRange.text, "alpha");
  assert.equal(result.candidates.length, 2);
  assert.ok(result.activeCandidateId);
  assert.ok(result.candidates[0].diffChunks.some((chunk) => chunk.type !== "equal"));
  assert.equal(capturedPromptInput.selectedText, "alpha");
  assert.ok(capturedPromptInput.constraintsText.includes("保留现有剧情事实"));
  assert.ok(capturedPromptInput.constraintsText.includes("保持当前人称与叙事视角"));
});

test("NovelChapterEditorService rejects empty or mismatched selections with explicit errors", async () => {
  const service = new NovelChapterEditorService(
    {
      novel: {
        findUnique: async () => ({
          world: null,
          characters: [],
          chapters: [{
            id: "chapter-1",
            title: "Test Chapter",
            order: 1,
            content: "alpha",
            expectation: "push conflict forward",
          }],
        }),
      },
    },
    async () => ({
      output: {
        candidates: [{
          label: "More natural",
          content: "alpha revised",
        }, {
          label: "More restrained",
          content: "alpha compressed",
        }],
      },
    }),
  );

  await assert.rejects(
    () => service.previewRewrite("novel-1", "chapter-1", {
      operation: "polish",
      contentSnapshot: "alpha",
      targetRange: {
        from: 0,
        to: 5,
        text: "not-current-text",
      },
      context: {
        beforeParagraphs: [],
        afterParagraphs: [],
      },
      chapterContext: {},
      constraints: {
        keepFacts: true,
        keepPov: true,
        noUnauthorizedSetting: true,
        preserveCoreInfo: true,
      },
    }),
    /选中文本已发生变化，请重新选择后再试。/,
  );
});

test("NovelChapterEditorService accepts selections based on the editor content snapshot", async () => {
  const service = new NovelChapterEditorService(
    {
      novel: {
        findUnique: async () => ({
          world: null,
          characters: [],
          chapters: [{
            id: "chapter-1",
            title: "Test Chapter",
            order: 1,
            content: "line one\nline two\nline three",
            expectation: "push conflict forward",
          }],
        }),
      },
    },
    async () => ({
      output: {
        candidates: [{
          label: "More natural",
          content: "paragraph revised",
        }, {
          label: "More restrained",
          content: "paragraph compressed",
        }],
      },
    }),
  );

  const result = await service.previewRewrite("novel-1", "chapter-1", {
    operation: "polish",
    contentSnapshot: "line one line two\n\nline three",
    targetRange: {
      from: 0,
      to: 17,
      text: "line one line two",
    },
    context: {
      beforeParagraphs: [],
      afterParagraphs: ["line three"],
    },
    chapterContext: {},
    constraints: {
      keepFacts: true,
      keepPov: true,
      noUnauthorizedSetting: true,
      preserveCoreInfo: true,
    },
  });

  assert.equal(result.targetRange.text, "line one line two");
  assert.equal(result.candidates.length, 2);
});

test("POST /api/novels/:id/chapters/:chapterId/editor/rewrite-preview returns preview payload", async () => {
  const originalMethod = NovelService.prototype.previewChapterRewrite;
  NovelService.prototype.previewChapterRewrite = async (_novelId, _chapterId, payload) => ({
    sessionId: "session-1",
    operation: payload.operation,
    targetRange: payload.targetRange,
    candidates: [{
      id: "candidate-1",
      label: "More natural",
      content: "alpha revised",
      summary: "Keep the original intent and make it read more naturally.",
      semanticTags: ["polish"],
      diffChunks: [
        { id: "chunk-1", type: "delete", text: "alpha" },
        { id: "chunk-2", type: "insert", text: "alpha revised" },
      ],
    }, {
      id: "candidate-2",
      label: "More restrained",
      content: "alpha compressed",
      summary: "Compress modifiers and keep the scene moving.",
      semanticTags: ["compress"],
      diffChunks: [
        { id: "chunk-1", type: "delete", text: "alpha" },
        { id: "chunk-2", type: "insert", text: "alpha compressed" },
      ],
    }],
    activeCandidateId: "candidate-1",
  });

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/novels/novel-1/chapters/chapter-1/editor/rewrite-preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operation: "polish",
        contentSnapshot: "alpha\n\nbeta",
        targetRange: {
          from: 0,
          to: 5,
          text: "alpha",
        },
        context: {
          beforeParagraphs: [],
          afterParagraphs: ["beta"],
        },
        chapterContext: {
          goalSummary: "push conflict forward",
        },
        constraints: {
          keepFacts: true,
          keepPov: true,
          noUnauthorizedSetting: true,
          preserveCoreInfo: true,
        },
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data.sessionId, "session-1");
    assert.equal(payload.data.candidates.length, 2);
    assert.equal(payload.data.targetRange.text, "alpha");
  } finally {
    NovelService.prototype.previewChapterRewrite = originalMethod;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
