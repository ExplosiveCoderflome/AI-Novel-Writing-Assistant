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
  const originalGenerate = NovelDirectorService.prototype.generateCandidates;
  const originalRefine = NovelDirectorService.prototype.refineCandidates;
  const originalConfirm = NovelDirectorService.prototype.confirmCandidate;

  NovelDirectorService.prototype.generateCandidates = async function generateCandidatesMock() {
    return { batch: buildBatch(1) };
  };
  NovelDirectorService.prototype.refineCandidates = async function refineCandidatesMock() {
    return { batch: buildBatch(2) };
  };
  NovelDirectorService.prototype.confirmCandidate = async function confirmCandidateMock() {
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
  } finally {
    NovelDirectorService.prototype.generateCandidates = originalGenerate;
    NovelDirectorService.prototype.refineCandidates = originalRefine;
    NovelDirectorService.prototype.confirmCandidate = originalConfirm;
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
