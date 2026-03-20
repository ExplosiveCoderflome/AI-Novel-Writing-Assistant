const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");
const { NovelService } = require("../dist/services/novel/NovelService.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

function buildStream(chunks) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield { content: chunk };
      }
    },
  };
}

function buildRuntimePackage(novelId, chapterId) {
  const now = new Date().toISOString();
  return {
    novelId,
    chapterId,
    context: {
      chapter: {
        id: chapterId,
        title: "第1章",
        order: 1,
        content: null,
        expectation: "推进冲突",
        supportingContextText: "context block",
      },
      plan: {
        id: "plan-1",
        chapterId,
        title: "章节规划",
        objective: "推进主线",
        participants: ["主角"],
        reveals: ["新线索"],
        riskNotes: ["避免重复"],
        hookTarget: "留下悬念",
        rawPlanJson: null,
        scenes: [],
        createdAt: now,
        updatedAt: now,
      },
      stateSnapshot: null,
      storyWorldSlice: {
        storyId: novelId,
        worldId: "world-1",
        coreWorldFrame: "现实压力驱动人物选择。",
        appliedRules: [],
        activeForces: [],
        activeLocations: [],
        activeElements: [],
        conflictCandidates: [],
        pressureSources: [],
        mysterySources: [],
        suggestedStoryAxes: [],
        recommendedEntryPoints: [],
        forbiddenCombinations: [],
        storyScopeBoundary: "保留现实都市基底。",
        metadata: {
          schemaVersion: 1,
          builtAt: now,
          sourceWorldUpdatedAt: now,
          storyInputDigest: "digest",
          builtFromStructuredData: true,
          builderMode: "runtime",
        },
      },
      characterRoster: [],
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
    },
    draft: {
      content: "归档后的章节正文",
      wordCount: 8,
      generationState: "drafted",
    },
    audit: {
      score: {
        coherence: 88,
        repetition: 10,
        pacing: 84,
        voice: 82,
        engagement: 86,
        overall: 85,
      },
      reports: [],
      openIssues: [],
      hasBlockingIssues: false,
    },
    replanRecommendation: {
      recommended: false,
      reason: "No blocking audit issues were detected.",
      blockingIssueIds: [],
    },
    meta: {
      provider: "deepseek",
      model: "deepseek-chat",
      temperature: 0.7,
      runId: "run-1",
      generatedAt: now,
    },
  };
}

test("runtime chapter route emits runtime_package before done", async () => {
  const originalMethod = NovelService.prototype.createChapterRuntimeStream;
  const novelId = "novel-runtime-route";
  const chapterId = "chapter-runtime-route";

  NovelService.prototype.createChapterRuntimeStream = async () => ({
    stream: buildStream(["第一段", "第二段"]),
    onDone: async (fullContent) => ({
      fullContent: `${fullContent}（归档）`,
      frames: [{
        type: "runtime_package",
        package: buildRuntimePackage(novelId, chapterId),
      }],
    }),
  });

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/chapters/${chapterId}/runtime/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(text.includes("\"type\":\"runtime_package\""));
    assert.ok(text.includes("\"type\":\"done\""));
    assert.ok(text.includes("\"storyWorldSlice\""));
    assert.ok(text.indexOf("\"type\":\"runtime_package\"") < text.indexOf("\"type\":\"done\""));
  } finally {
    NovelService.prototype.createChapterRuntimeStream = originalMethod;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("legacy generate route keeps chunk and done without runtime_package", async () => {
  const originalMethod = NovelService.prototype.createChapterStream;
  const novelId = "novel-legacy-route";
  const chapterId = "chapter-legacy-route";

  NovelService.prototype.createChapterStream = async () => ({
    stream: buildStream(["旧链路正文"]),
    onDone: async (fullContent) => ({
      fullContent,
      frames: [],
    }),
  });

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/chapters/${chapterId}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(text.includes("\"type\":\"chunk\""));
    assert.ok(text.includes("\"type\":\"done\""));
    assert.ok(!text.includes("\"type\":\"runtime_package\""));
  } finally {
    NovelService.prototype.createChapterStream = originalMethod;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
