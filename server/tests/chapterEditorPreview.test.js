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
            name: "林渊",
            role: "主角",
            currentState: "强撑镇定",
            currentGoal: "先稳住局面",
          }],
          chapters: [{
            id: "chapter-1",
            title: "测试章节",
            order: 7,
            content: "原段内容。\n后文承接。",
            expectation: "推进冲突",
          }],
        }),
      },
    },
    async ({ promptInput }) => {
      capturedPromptInput = promptInput;
      return {
        output: {
          candidates: [{
            label: "更自然",
            content: "改写版本一。",
            summary: "保留原意并让表达更自然。",
            semanticTags: ["优化表达", "贴近语气"],
          }, {
            label: "更克制",
            content: "改写版本二。",
            summary: "压缩修饰并保持推进。",
            semanticTags: ["精简压缩", "保留信息"],
          }],
        },
      };
    },
  );

  const result = await service.previewRewrite("novel-1", "chapter-1", {
    operation: "polish",
    targetRange: {
      from: 0,
      to: 5,
      text: "原段内容。",
    },
    context: {
      beforeParagraphs: [],
      afterParagraphs: ["后文承接。"],
    },
    chapterContext: {
      goalSummary: "推进冲突",
      chapterSummary: "主角准备接住下一轮压力。",
      styleSummary: "第三人称近距离，语气克制。",
      characterStateSummary: "林渊还在强撑镇定。",
      worldConstraintSummary: "不能新增超出当前都市规则的设定。",
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
  assert.equal(result.targetRange.text, "原段内容。");
  assert.equal(result.candidates.length, 2);
  assert.ok(result.activeCandidateId);
  assert.ok(result.candidates[0].diffChunks.some((chunk) => chunk.type !== "equal"));
  assert.equal(capturedPromptInput.selectedText, "原段内容。");
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
            title: "测试章节",
            order: 1,
            content: "原段内容。",
            expectation: "推进冲突",
          }],
        }),
      },
    },
    async () => ({
      output: {
        candidates: [{
          label: "更自然",
          content: "改写版本一。",
        }, {
          label: "更克制",
          content: "改写版本二。",
        }],
      },
    }),
  );

  await assert.rejects(
    () => service.previewRewrite("novel-1", "chapter-1", {
      operation: "polish",
      targetRange: {
        from: 0,
        to: 5,
        text: "不是当前正文",
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
    /选中文本已发生变化，请重新选择后再试/,
  );
});

test("POST /api/novels/:id/chapters/:chapterId/editor/rewrite-preview returns preview payload", async () => {
  const originalMethod = NovelService.prototype.previewChapterRewrite;
  NovelService.prototype.previewChapterRewrite = async (_novelId, _chapterId, payload) => ({
    sessionId: "session-1",
    operation: payload.operation,
    targetRange: payload.targetRange,
    candidates: [{
      id: "candidate-1",
      label: "更自然",
      content: "改写版本一。",
      summary: "保留原意并让表达更自然。",
      semanticTags: ["优化表达"],
      diffChunks: [
        { id: "chunk-1", type: "delete", text: "原段内容。" },
        { id: "chunk-2", type: "insert", text: "改写版本一。" },
      ],
    }, {
      id: "candidate-2",
      label: "更克制",
      content: "改写版本二。",
      summary: "压缩修饰并保持推进。",
      semanticTags: ["精简压缩"],
      diffChunks: [
        { id: "chunk-1", type: "delete", text: "原段内容。" },
        { id: "chunk-2", type: "insert", text: "改写版本二。" },
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
        targetRange: {
          from: 0,
          to: 5,
          text: "原段内容。",
        },
        context: {
          beforeParagraphs: [],
          afterParagraphs: ["后文承接。"],
        },
        chapterContext: {
          goalSummary: "推进冲突",
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
    assert.equal(payload.data.targetRange.text, "原段内容。");
  } finally {
    NovelService.prototype.previewChapterRewrite = originalMethod;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
