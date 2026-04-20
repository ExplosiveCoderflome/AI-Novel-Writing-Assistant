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

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function readChunk(reader, timeoutMs = 300) {
  const result = await Promise.race([
    reader.read(),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms waiting for SSE chunk.`)), timeoutMs)),
  ]);
  const value = result.value ?? new Uint8Array();
  return new TextDecoder("utf-8").decode(value, { stream: true });
}

async function readRemaining(reader) {
  const decoder = new TextDecoder("utf-8");
  let output = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      return output;
    }
    output += decoder.decode(value, { stream: true });
  }
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
      openConflicts: [{
        id: "conflict-1",
        novelId,
        chapterId,
        sourceSnapshotId: null,
        sourceIssueId: null,
        sourceType: "state",
        conflictType: "plot",
        conflictKey: "conflict:key",
        title: "未解决冲突",
        summary: "主角还没解决上一章留下的风险。",
        severity: "medium",
        status: "open",
        evidence: ["上一章结尾留下追兵。"],
        affectedCharacterIds: ["char-1"],
        resolutionHint: "先处理追兵威胁。",
        lastSeenChapterOrder: 1,
        createdAt: now,
        updatedAt: now,
      }],
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
      styleContext: {
        matchedBindings: [],
        compiledBlocks: null,
      },
      characterDynamics: {
        novelId,
        currentVolume: {
          id: "volume-1",
          title: "第一卷",
          sortOrder: 1,
          startChapterOrder: 1,
          endChapterOrder: 10,
          currentChapterOrder: 1,
        },
        summary: "第一卷当前角色阵容稳定，但仍有候选角色待确认。",
        pendingCandidateCount: 1,
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
        sellingPoint: "高压开局与持续反压",
        first30ChapterPromise: "前三十章稳定兑现压迫与反压回报",
        narrativePov: "limited-third-person",
        pacePreference: "fast",
        emotionIntensity: "high",
        toneGuardrails: ["不写空泛鸡汤"],
        hardConstraints: ["主线必须持续升级"],
      },
      macroConstraints: {
        sellingPoint: "高压开局与持续反压",
        coreConflict: "主角在压迫中夺回主动权",
        mainHook: "更大幕后势力逐步浮现",
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
        softFutureSummary: "Volume 2 第二卷: 更高层势力正式下场",
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
  let capturedOptions = null;

  NovelService.prototype.createChapterRuntimeStream = async (_novelId, _chapterId, options) => {
    capturedOptions = options;
    return {
      stream: buildStream(["第一段", "第二段"]),
      onDone: async (fullContent) => ({
        fullContent: `${fullContent}（归档）`,
        frames: [{
          type: "runtime_package",
          package: buildRuntimePackage(novelId, chapterId),
        }],
      }),
    };
  };

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/chapters/${chapterId}/runtime/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        taskStyleProfileId: "style-task-1",
      }),
    });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(text.includes("\"type\":\"runtime_package\""));
    assert.ok(text.includes("\"type\":\"done\""));
    assert.ok(text.includes("\"storyWorldSlice\""));
    assert.ok(text.includes("\"bookContract\""));
    assert.ok(text.includes("\"macroConstraints\""));
    assert.ok(text.includes("\"volumeWindow\""));
    assert.ok(text.includes("\"characterDynamics\""));
    assert.ok(text.includes("\"openConflicts\""));
    assert.ok(text.indexOf("\"type\":\"runtime_package\"") < text.indexOf("\"type\":\"done\""));
    assert.equal(capturedOptions?.taskStyleProfileId, "style-task-1");
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
    onDone: async (fullContent, helpers) => {
      helpers.writeFrame({
        type: "run_status",
        runId: "chapter-runtime:legacy",
        status: "running",
        phase: "finalizing",
        message: "正在保存草稿并同步章节状态。",
      });
      return ({
        fullContent,
        frames: [],
      });
    },
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
    assert.ok(text.includes("\"type\":\"run_status\""));
    assert.ok(text.includes("\"type\":\"done\""));
    assert.ok(!text.includes("\"type\":\"runtime_package\""));
    assert.ok(text.indexOf("\"type\":\"run_status\"") < text.indexOf("\"type\":\"done\""));
  } finally {
    NovelService.prototype.createChapterStream = originalMethod;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("runtime chapter route emits failed SSE for business errors after headers start", async () => {
  const originalRuntimeMethod = NovelService.prototype.createChapterRuntimeStream;
  const originalGenerateMethod = NovelService.prototype.createChapterStream;
  const novelId = "novel-business-error";
  const chapterId = "chapter-business-error";

  NovelService.prototype.createChapterRuntimeStream = async () => {
    throw new Error("当前小说还没有章节");
  };
  NovelService.prototype.createChapterStream = async () => {
    throw new Error("当前小说还没有章节");
  };

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  const cases = [
    `/api/novels/${novelId}/chapters/${chapterId}/runtime/run`,
    `/api/novels/${novelId}/chapters/${chapterId}/generate`,
  ];

  try {
    for (const path of cases) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/, path);

      const text = await response.text();
      assert.ok(text.includes("\"type\":\"run_status\""), path);
      assert.ok(text.includes("\"status\":\"queued\""), path);
      assert.ok(text.includes("\"status\":\"failed\""), path);
      assert.ok(text.includes("\"type\":\"error\""), path);
      assert.ok(text.includes("当前小说还没有章节"), path);
      assert.ok(!text.includes("\"status\":\"running\""), path);
      assert.ok(!text.includes("\"type\":\"done\""), path);
      assert.ok(!text.includes("\"success\":false"), path);
    }
  } finally {
    NovelService.prototype.createChapterRuntimeStream = originalRuntimeMethod;
    NovelService.prototype.createChapterStream = originalGenerateMethod;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("runtime chapter route starts SSE and queued status before stream creation resolves", async () => {
  const originalMethod = NovelService.prototype.createChapterRuntimeStream;
  const novelId = "novel-runtime-queued";
  const chapterId = "chapter-runtime-queued";
  const deferred = createDeferred();

  NovelService.prototype.createChapterRuntimeStream = async () => {
    await deferred.promise;
    return {
      stream: buildStream(["延迟完成正文"]),
      onDone: async (fullContent) => ({ fullContent }),
    };
  };

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const response = await Promise.race([
      fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/chapters/${chapterId}/runtime/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for runtime SSE response headers.")), 300)),
    ]);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
    const reader = response.body.getReader();
    const firstChunk = await readChunk(reader);
    assert.ok(firstChunk.includes("\"type\":\"run_status\""));
    assert.ok(firstChunk.includes("\"status\":\"queued\""));
    assert.ok(firstChunk.includes(`\"runId\":\"chapter-runtime:${chapterId}\"`));

    deferred.resolve();
    const remaining = await readRemaining(reader);
    assert.ok(remaining.includes("\"status\":\"running\""));
    assert.ok(remaining.includes("\"type\":\"done\""));
  } finally {
    NovelService.prototype.createChapterRuntimeStream = originalMethod;
    deferred.reject?.(new Error("cleanup"));
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
