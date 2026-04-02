const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");
const { NovelDirectorService } = require("../dist/services/novel/director/NovelDirectorService.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

function buildCandidate(id = "candidate_1", title = "Neon Archive") {
  return {
    id,
    workingTitle: title,
    logline: "A college girl slips into a hidden power network while tracing her missing father.",
    positioning: "Urban supernatural growth thriller with strong rookie-to-operator momentum.",
    sellingPoint: "An ordinary girl is forced to level up inside a dangerous secret organization.",
    coreConflict: "The closer she gets to the truth, the harder the organization pushes back.",
    protagonistPath: "She grows from self-protective student into someone willing to break the board.",
    endingDirection: "Bittersweet but hopeful, with a real price paid before the breakthrough.",
    hookStrategy: "Each phase reveals one layer of the father case and a bigger city conspiracy.",
    progressionLoop: "Find clue, get forced deeper, pay a cost, strike back with new leverage.",
    whyItFits: "It keeps the urban realism while making the main conflict and growth line clearer.",
    toneKeywords: ["urban", "thriller", "growth"],
    targetChapterCount: 30,
  };
}

function buildBatch(round = 1) {
  return {
    id: `batch_${round}`,
    round,
    roundLabel: `第 ${round} 轮`,
    idea: "A college girl accidentally enters a supernatural organization.",
    refinementSummary: round === 1 ? null : "预设修正：冲突更强",
    presets: round === 1 ? [] : ["stronger_conflict"],
    candidates: [
      buildCandidate(`candidate_${round}_1`, "Neon Archive"),
      buildCandidate(`candidate_${round}_2`, "Midnight Circuit"),
    ],
    createdAt: new Date().toISOString(),
  };
}

function buildStoryMacroPlan() {
  return {
    id: "macro_demo",
    novelId: "novel_director_demo",
    storyInput: "A college girl accidentally enters a supernatural organization.",
    expansion: {
      expanded_premise: "A student is dragged into a secret urban power network tied to her missing father.",
      protagonist_core: "Cautious but stubborn, with a deep need to know what happened to her family.",
      conflict_engine: "Every clue pushes her closer to the conspiracy and closer to being erased by it.",
      conflict_layers: {
        external: "A hidden organization hunts everyone who touches the case.",
        internal: "She fears she is too weak to survive what the truth demands.",
        relational: "Her allies want to protect her, but each secret breaks trust.",
      },
      mystery_box: "The father case and the current disappearances are the same buried incident.",
      emotional_line: "She moves from survival-first to choosing responsibility.",
      setpiece_seeds: ["subway pursuit", "archive blackout", "old district siege"],
      tone_reference: "Grounded city thriller with supernatural escalation.",
    },
    decomposition: {
      selling_point: "An ordinary college girl becomes the unlikely breaker of a city conspiracy.",
      core_conflict: "To learn the truth she must enter the system designed to silence her.",
      main_hook: "Her missing father is tied to the same case now swallowing the city.",
      progression_loop: "Clue, pressure, sacrifice, counterplay, deeper truth.",
      growth_path: "From avoiding danger to taking command of danger.",
      major_payoffs: ["father truth", "organization exposure", "heroine counterattack"],
      ending_flavor: "Costly but hopeful.",
    },
    constraints: ["Keep the city-life grounding.", "Do not make the heroine suddenly overpowered."],
    issues: [],
    lockedFields: {},
    constraintEngine: null,
    state: { currentPhase: 0, progress: 0, protagonistState: "" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

test("novel director routes support candidates, refine and confirm flows", async () => {
  const confirmCalls = [];
  const takeoverCalls = [];
  const originalGenerate = NovelDirectorService.prototype.generateCandidates;
  const originalRefine = NovelDirectorService.prototype.refineCandidates;
  const originalPatch = NovelDirectorService.prototype.patchCandidate;
  const originalRefineTitles = NovelDirectorService.prototype.refineCandidateTitleOptions;
  const originalConfirm = NovelDirectorService.prototype.confirmCandidate;
  const originalGetTakeoverReadiness = NovelDirectorService.prototype.getTakeoverReadiness;
  const originalStartTakeover = NovelDirectorService.prototype.startTakeover;

  NovelDirectorService.prototype.generateCandidates = async function generateCandidatesMock() {
    return { batch: buildBatch(1) };
  };
  NovelDirectorService.prototype.refineCandidates = async function refineCandidatesMock() {
    return { batch: buildBatch(2) };
  };
  NovelDirectorService.prototype.patchCandidate = async function patchCandidateMock() {
    const batch = buildBatch(2);
    batch.candidates[0] = {
      ...batch.candidates[0],
      workingTitle: "Neon Bureau",
      positioning: "Urban supernatural investigation with stronger city-pressure rhythm.",
    };
    return { batch, candidate: batch.candidates[0] };
  };
  NovelDirectorService.prototype.refineCandidateTitleOptions = async function refineTitlesMock() {
    const batch = buildBatch(2);
    batch.candidates[0] = {
      ...batch.candidates[0],
      workingTitle: "Neon Switchboard",
      titleOptions: [
        {
          title: "Neon Switchboard",
          clickRate: 79,
          style: "high_concept",
          angle: "新版主书名",
          reason: "更偏都市冷感。",
        },
      ],
    };
    return { batch, candidate: batch.candidates[0] };
  };
  NovelDirectorService.prototype.confirmCandidate = async function confirmCandidateMock(input) {
    confirmCalls.push(input);
    return {
      novel: {
        id: "novel_director_demo",
        title: "Neon Archive",
        description: "Urban supernatural growth thriller.",
        status: "draft",
        writingMode: "original",
        projectMode: "ai_led",
        narrativePov: "third_person",
        pacePreference: "balanced",
        styleTone: "grounded suspense",
        emotionIntensity: "medium",
        aiFreedom: "medium",
        defaultChapterLength: 2800,
        estimatedChapterCount: 30,
        projectStatus: "in_progress",
        storylineStatus: "in_progress",
        outlineStatus: "in_progress",
        resourceReadyScore: 0,
        sourceNovelId: null,
        sourceKnowledgeDocumentId: null,
        continuationBookAnalysisId: null,
        continuationBookAnalysisSections: null,
        outline: "Full blueprint",
        structuredOutline: null,
        genreId: null,
        worldId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      storyMacroPlan: buildStoryMacroPlan(),
      bookSpec: {
        storyInput: "A college girl accidentally enters a supernatural organization.",
        positioning: "Urban supernatural growth thriller with strong rookie-to-operator momentum.",
        sellingPoint: "An ordinary girl is forced to level up inside a dangerous secret organization.",
        coreConflict: "The closer she gets to the truth, the harder the organization pushes back.",
        protagonistPath: "She grows from self-protective student into someone willing to break the board.",
        endingDirection: "Bittersweet but hopeful, with a real price paid before the breakthrough.",
        hookStrategy: "Each phase reveals one layer of the father case and a bigger city conspiracy.",
        progressionLoop: "Find clue, get forced deeper, pay a cost, strike back with new leverage.",
        targetChapterCount: 30,
      },
      batch: { id: "batch_2", round: 2 },
      createdChapterCount: 30,
      createdArcCount: 3,
      plans: {
        book: {
          level: "book",
          id: "plan_book",
          title: "Full Book Plan",
          objective: "Drive the main conspiracy forward.",
          chapterId: null,
          externalRef: null,
          rawPlanJson: "{}",
        },
        arcs: [],
        chapters: [],
      },
      seededPlans: {
        book: {
          level: "book",
          id: "plan_book",
          title: "Full Book Plan",
          objective: "Drive the main conspiracy forward.",
          chapterId: null,
          externalRef: null,
          rawPlanJson: "{}",
        },
        arcs: [],
        chapters: [],
      },
    };
  };
  NovelDirectorService.prototype.getTakeoverReadiness = async function getTakeoverReadinessMock() {
    return {
      novelId: "novel_director_demo",
      novelTitle: "Neon Archive",
      hasActiveTask: false,
      activeTaskId: null,
      snapshot: {
        hasStoryMacroPlan: true,
        hasBookContract: true,
        characterCount: 4,
        chapterCount: 0,
        volumeCount: 1,
        firstVolumeChapterCount: 0,
      },
      stages: [
        {
          phase: "story_macro",
          label: "从故事宏观规划开始",
          description: "先补齐 Story Macro 和 Book Contract。",
          available: true,
          recommended: false,
          reason: "当前书级信息足够。",
        },
        {
          phase: "character_setup",
          label: "从角色准备开始",
          description: "沿用书级方向继续角色准备。",
          available: true,
          recommended: false,
          reason: "书级方向资产已齐。",
        },
        {
          phase: "volume_strategy",
          label: "从卷战略开始",
          description: "继续卷战略和卷骨架。",
          available: true,
          recommended: true,
          reason: "角色资产已齐，可以从卷战略开始。",
        },
        {
          phase: "structured_outline",
          label: "从节奏 / 拆章开始",
          description: "继续第 1 卷节奏与拆章。",
          available: true,
          recommended: false,
          reason: "卷级资产已经存在。",
        },
      ],
    };
  };
  NovelDirectorService.prototype.startTakeover = async function startTakeoverMock(input) {
    takeoverCalls.push(input);
    return {
      novelId: "novel_director_demo",
      workflowTaskId: "workflow_takeover_demo",
      startPhase: "volume_strategy",
      directorSession: {
        runMode: input.runMode ?? "stage_review",
        isBackgroundRunning: true,
        lockedScopes: ["basic", "story_macro", "character", "outline", "structured", "chapter", "pipeline"],
        phase: "volume_strategy",
        reviewScope: null,
      },
      resumeTarget: {
        route: "/novels/:id/edit",
        novelId: "novel_director_demo",
        taskId: "workflow_takeover_demo",
        stage: "outline",
      },
    };
  };

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const candidatesResponse = await fetch(`http://127.0.0.1:${port}/api/novels/director/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea: "A college girl accidentally enters a supernatural organization.",
        narrativePov: "third_person",
        pacePreference: "balanced",
        emotionIntensity: "medium",
        aiFreedom: "medium",
        projectMode: "ai_led",
        writingMode: "original",
        estimatedChapterCount: 30,
      }),
    });
    assert.equal(candidatesResponse.status, 200);
    const candidatesPayload = await candidatesResponse.json();
    assert.equal(candidatesPayload.success, true);
    assert.equal(candidatesPayload.data.batch.round, 1);
    assert.equal(candidatesPayload.data.batch.candidates.length, 2);

    const refineResponse = await fetch(`http://127.0.0.1:${port}/api/novels/director/refine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea: "A college girl accidentally enters a supernatural organization.",
        narrativePov: "third_person",
        pacePreference: "balanced",
        emotionIntensity: "medium",
        aiFreedom: "medium",
        projectMode: "ai_led",
        writingMode: "original",
        estimatedChapterCount: 30,
        previousBatches: [buildBatch(1)],
        presets: ["stronger_conflict"],
        feedback: "Push the main conflict harder and keep the heroine more active.",
      }),
    });
    assert.equal(refineResponse.status, 200);
    const refinePayload = await refineResponse.json();
    assert.equal(refinePayload.success, true);
    assert.equal(refinePayload.data.batch.round, 2);

    const patchResponse = await fetch(`http://127.0.0.1:${port}/api/novels/director/patch-candidate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea: "A college girl accidentally enters a supernatural organization.",
        narrativePov: "third_person",
        pacePreference: "balanced",
        emotionIntensity: "medium",
        aiFreedom: "medium",
        projectMode: "ai_led",
        writingMode: "original",
        estimatedChapterCount: 30,
        previousBatches: [buildBatch(1), buildBatch(2)],
        batchId: "batch_2",
        candidateId: "candidate_2_1",
        feedback: "Keep this direction, but make it feel more urban and more investigative.",
      }),
    });
    assert.equal(patchResponse.status, 200);
    const patchPayload = await patchResponse.json();
    assert.equal(patchPayload.success, true);
    assert.equal(patchPayload.data.candidate.workingTitle, "Neon Bureau");

    const refineTitlesResponse = await fetch(`http://127.0.0.1:${port}/api/novels/director/refine-titles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea: "A college girl accidentally enters a supernatural organization.",
        narrativePov: "third_person",
        pacePreference: "balanced",
        emotionIntensity: "medium",
        aiFreedom: "medium",
        projectMode: "ai_led",
        writingMode: "original",
        estimatedChapterCount: 30,
        previousBatches: [buildBatch(1), buildBatch(2)],
        batchId: "batch_2",
        candidateId: "candidate_2_1",
        feedback: "This title group is too old-school. Make it feel colder and more urban.",
      }),
    });
    assert.equal(refineTitlesResponse.status, 200);
    const refineTitlesPayload = await refineTitlesResponse.json();
    assert.equal(refineTitlesPayload.success, true);
    assert.equal(refineTitlesPayload.data.candidate.workingTitle, "Neon Switchboard");

    const confirmResponse = await fetch(`http://127.0.0.1:${port}/api/novels/director/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea: "A college girl accidentally enters a supernatural organization.",
        narrativePov: "third_person",
        pacePreference: "balanced",
        emotionIntensity: "medium",
        aiFreedom: "medium",
        projectMode: "ai_led",
        writingMode: "original",
        estimatedChapterCount: 30,
        runMode: "auto_to_execution",
        batchId: "batch_2",
        round: 2,
        candidate: buildCandidate(),
      }),
    });
    assert.equal(confirmResponse.status, 200);
    const confirmPayload = await confirmResponse.json();
    assert.equal(confirmPayload.success, true);
    assert.equal(confirmPayload.data.novel.id, "novel_director_demo");
    assert.equal(confirmPayload.data.createdChapterCount, 30);
    assert.equal(confirmPayload.data.bookSpec.targetChapterCount, 30);
    assert.equal(confirmCalls.at(-1)?.runMode, "auto_to_execution");

    const readinessResponse = await fetch(`http://127.0.0.1:${port}/api/novels/director/takeover-readiness/novel_director_demo`);
    assert.equal(readinessResponse.status, 200);
    const readinessPayload = await readinessResponse.json();
    assert.equal(readinessPayload.success, true);
    assert.equal(readinessPayload.data.snapshot.characterCount, 4);
    assert.equal(readinessPayload.data.stages.find((item) => item.phase === "volume_strategy").recommended, true);

    const takeoverResponse = await fetch(`http://127.0.0.1:${port}/api/novels/director/takeover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        novelId: "novel_director_demo",
        startPhase: "volume_strategy",
        runMode: "auto_to_execution",
      }),
    });
    assert.equal(takeoverResponse.status, 200);
    const takeoverPayload = await takeoverResponse.json();
    assert.equal(takeoverPayload.success, true);
    assert.equal(takeoverPayload.data.workflowTaskId, "workflow_takeover_demo");
    assert.equal(takeoverPayload.data.resumeTarget.stage, "outline");
    assert.equal(takeoverPayload.data.directorSession.runMode, "auto_to_execution");
    assert.equal(takeoverCalls.at(-1)?.runMode, "auto_to_execution");
  } finally {
    NovelDirectorService.prototype.generateCandidates = originalGenerate;
    NovelDirectorService.prototype.refineCandidates = originalRefine;
    NovelDirectorService.prototype.patchCandidate = originalPatch;
    NovelDirectorService.prototype.refineCandidateTitleOptions = originalRefineTitles;
    NovelDirectorService.prototype.confirmCandidate = originalConfirm;
    NovelDirectorService.prototype.getTakeoverReadiness = originalGetTakeoverReadiness;
    NovelDirectorService.prototype.startTakeover = originalStartTakeover;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("novel director candidates route surfaces upstream connection details", async () => {
  const originalGenerate = NovelDirectorService.prototype.generateCandidates;
  NovelDirectorService.prototype.generateCandidates = async function generateCandidatesConnectionMock() {
    const socketError = new Error("Client network socket disconnected before secure TLS connection was established");
    socketError.code = "ECONNRESET";
    socketError.host = "api.deepseek.com";
    socketError.port = 443;
    const fetchError = new Error("fetch failed", { cause: socketError });
    const error = new Error("Connection error.", { cause: fetchError });
    throw error;
  };

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/novels/director/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea: "A college girl accidentally enters a supernatural organization.",
        writingMode: "original",
        projectMode: "co_pilot",
        narrativePov: "third_person",
        pacePreference: "balanced",
        emotionIntensity: "medium",
        aiFreedom: "medium",
        defaultChapterLength: 2800,
        estimatedChapterCount: 20,
        projectStatus: "not_started",
        storylineStatus: "not_started",
        outlineStatus: "not_started",
        resourceReadyScore: 0,
        provider: "deepseek",
        model: "deepseek-chat",
        temperature: 0.7,
      }),
    });
    assert.equal(response.status, 502);
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.match(payload.error, /api\.deepseek\.com:443/);
    assert.match(payload.error, /ECONNRESET/);
  } finally {
    NovelDirectorService.prototype.generateCandidates = originalGenerate;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
