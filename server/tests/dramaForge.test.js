const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

test("drama prompt assets are registered", () => {
  const { hasRegisteredPromptAsset } = require("../dist/prompting/registry.js");
  const prompts = [
    ["drama.source.original_bundle", "v1"],
    ["drama.source.text_bundle", "v1"],
    ["drama.track.recommendation", "v1"],
    ["drama.source.supplement", "v1"],
    ["drama.strategy", "v1"],
    ["drama.episodeOutline", "v1"],
    ["drama.episode.script", "v1"],
    ["drama.episode.quality", "v1"],
    ["drama.episode.repair", "v1"],
    ["drama.storyboard", "v1"],
    ["drama.video.prompt", "v1"],
  ];
  for (const [id, version] of prompts) {
    assert.equal(hasRegisteredPromptAsset(id, version), true, `${id}@${version} should be registered`);
  }
});

test("drama paywall plan schema is machine readable", () => {
  const { dramaStrategyOutputSchema } = require("../dist/prompting/prompts/drama/drama.prompts.js");
  const { describeDramaPaywallPlan, resolveDramaPaywallPlan } = require("../dist/services/drama/engine/paywallPlanPolicy.js");
  const strategy = dramaStrategyOutputSchema.parse({
    positioning: "面向喜欢隐藏身份逆袭的竖屏短剧用户。",
    mainPleasureLine: "林澈持续受辱后逐步掉马甲打脸。",
    paywallNote: "第 12 集进入首付费强卡点。",
    paywallPlan: {
      firstPaywallAt: 12,
      freeEpisodes: 10,
      paywallCadence: 1,
      cliffhangerStrengthThreshold: 86,
      buildupBeforePaywall: "第 11 集让主角被误解到低谷，第 12 集用董事长跪迎反转。",
      intensityCurve: [{
        fromEpisode: 1,
        toEpisode: 12,
        goal: "免费段完成身份羞辱蓄势并推到首付费反转。",
        targetEmotionNet: -4,
      }],
    },
    emotionCurveNote: "憋屈蓄势后用身份反转释放。",
    deviationDeclaration: "保留隐藏身份主线，压缩支线。",
  });
  const plan = resolveDramaPaywallPlan(JSON.stringify(strategy), 80);
  assert.equal(plan.firstPaywallAt, 12);
  assert.equal(plan.cliffhangerStrengthThreshold, 86);
  assert.match(describeDramaPaywallPlan(plan), /首付费集：第 12 集/);

  const fallback = resolveDramaPaywallPlan(JSON.stringify({ mainPleasureLine: "旧策略" }), 10);
  assert.equal(fallback.firstPaywallAt, 10);
});

test("drama quality gate escalates weak paywall beats from paywall plan", () => {
  const { applyPaywallQualityRules } = require("../dist/services/drama/DramaQualityGate.js");
  const strategyJson = JSON.stringify({
    paywallPlan: {
      firstPaywallAt: 12,
      freeEpisodes: 10,
      paywallCadence: 1,
      cliffhangerStrengthThreshold: 85,
      buildupBeforePaywall: "首付费前一集压到阶段低谷。",
      intensityCurve: [{ fromEpisode: 1, toEpisode: 12, goal: "蓄势到反转", targetEmotionNet: -4 }],
    },
  });
  const baseQuality = {
    status: "approved",
    score: { hook: 90, density: 88, paywall: 70, emotion: 82, duration: 86, consistency: 90, overall: 86 },
    flags: [],
  };
  const paywallResult = applyPaywallQualityRules(baseQuality, {
    episode: { order: 12, title: "董事长跪迎", emotionNet: 4, isPaywall: true },
    episodes: [],
    strategyJson,
    targetEpisodes: 80,
  });
  assert.equal(paywallResult.status, "repairable");
  assert.equal(paywallResult.flags.some((flag) => flag.code === "paywall_cliffhanger_below_plan"), true);
  assert.match(paywallResult.repairPlan.instruction, /强化/);

  const prePaywallResult = applyPaywallQualityRules({
    ...baseQuality,
    score: { ...baseQuality.score, paywall: 90 },
  }, {
    episode: { order: 11, title: "误会升级", emotionNet: -1, isPaywall: false },
    episodes: [
      { order: 10, title: "受辱", emotionNet: -4, isPaywall: false },
      { order: 11, title: "误会升级", emotionNet: -1, isPaywall: false },
    ],
    strategyJson,
    targetEpisodes: 80,
  });
  assert.equal(prePaywallResult.status, "repairable");
  assert.equal(prePaywallResult.flags.some((flag) => flag.code === "pre_paywall_buildup_not_lowest"), true);
});

test("drama video provider registry exposes mock provider", async () => {
  const { videoProviderRegistry } = require("../dist/services/drama/video/VideoProviderPort.js");
  const provider = videoProviderRegistry.resolve("mock");
  const providers = videoProviderRegistry.listProviders();
  assert.equal(providers.some((item) => item.provider === "mock"), true);
  assert.equal(providers.find((item) => item.provider === "mock")?.supportsRefImages, true);
  assert.equal(providers.find((item) => item.provider === "mock")?.costPerSecond, 0);
  const result = await provider.createTask({
    prompt: "vertical drama shot",
    aspectRatio: "9:16",
    durationSec: 5,
    refImages: ["https://example.test/character-sheet.png"],
  });
  assert.match(result.providerTaskId, /^mock_/);
  assert.equal(result.status, "queued");
  assert.deepEqual(result.raw.refImages, ["https://example.test/character-sheet.png"]);
});

test("drama tts provider registry exposes mock provider", async () => {
  const { ttsProviderRegistry } = require("../dist/services/drama/audio/TTSProviderPort.js");
  const provider = ttsProviderRegistry.resolve("mock");
  const providers = ttsProviderRegistry.listProviders();
  assert.equal(providers.some((item) => item.provider === "mock"), true);
  assert.equal(providers.find((item) => item.provider === "mock")?.costPerSecond, 0);
  const result = await provider.synthesize({
    text: "你也配进去？",
    voiceId: "lin-voice",
    speed: 1.05,
    emotion: "tense",
  });
  assert.match(result.audioUrl, /^data:audio\/wav;base64,/);
  assert.equal(result.durationSec, 2);
  assert.equal(result.raw.voiceId, "lin-voice");
});

test("http drama video provider maps create and status responses", async () => {
  const createBodies = [];
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && req.url === "/create") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        createBodies.push(body ? JSON.parse(body) : {});
        res.end(JSON.stringify({ taskId: "task_1", status: "processing" }));
      });
      return;
    }
    if (req.method === "GET" && req.url === "/status/task_1") {
      res.end(JSON.stringify({ taskId: "task_1", status: "completed", resultUrl: "https://example.test/video.mp4" }));
      return;
    }
    if (req.method === "GET" && req.url === "/status/task_fail") {
      res.end(JSON.stringify({ taskId: "task_fail", status: "error", message: "quota exceeded" }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const { HttpVideoProvider } = require("../dist/services/drama/video/VideoProviderPort.js");
    const provider = new HttpVideoProvider({
      provider: "http-test",
      createUrl: `${baseUrl}/create`,
      statusUrl: `${baseUrl}/status/{taskId}`,
      supportsRefImages: true,
      costPerSecond: 0.8,
      currency: "USD",
    });
    assert.equal(provider.costPerSecond, 0.8);
    assert.equal(provider.currency, "USD");
    const created = await provider.createTask({
      prompt: "vertical drama shot",
      aspectRatio: "9:16",
      refImages: ["https://example.test/character-sheet.png"],
    });
    assert.equal(created.providerTaskId, "task_1");
    assert.equal(created.status, "running");
    assert.deepEqual(createBodies[0].refImages, ["https://example.test/character-sheet.png"]);

    const providerWithoutRefImages = new HttpVideoProvider({
      provider: "http-test-no-refs",
      createUrl: `${baseUrl}/create`,
    });
    await providerWithoutRefImages.createTask({
      prompt: "vertical drama shot",
      aspectRatio: "9:16",
      refImages: ["https://example.test/character-sheet.png"],
    });
    assert.equal(Object.hasOwn(createBodies[1], "refImages"), false);

    const refreshed = await provider.getTask("task_1");
    assert.equal(refreshed.status, "succeeded");
    assert.equal(refreshed.resultUrl, "https://example.test/video.mp4");
    assert.equal(refreshed.failureReason, undefined);

    const failed = await provider.getTask("task_fail");
    assert.equal(failed.status, "failed");
    assert.equal(failed.failureReason, "quota exceeded");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("http drama tts provider maps synthesize responses", async () => {
  const requestBodies = [];
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && req.url === "/tts") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        requestBodies.push(body ? JSON.parse(body) : {});
        res.end(JSON.stringify({ audioUrl: "https://example.test/line.wav", durationSec: 3.5 }));
      });
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const { HttpTTSProvider } = require("../dist/services/drama/audio/TTSProviderPort.js");
    const provider = new HttpTTSProvider({
      provider: "http-tts-test",
      synthesizeUrl: `${baseUrl}/tts`,
      apiKey: "test-key",
      costPerSecond: 0.12,
      currency: "USD",
    });
    assert.equal(provider.costPerSecond, 0.12);
    assert.equal(provider.currency, "USD");
    const result = await provider.synthesize({
      text: "让董事长下来。",
      voiceId: "lin-voice",
      speed: 1.05,
      emotion: "tense",
    });
    assert.equal(result.audioUrl, "https://example.test/line.wav");
    assert.equal(result.durationSec, 3.5);
    assert.deepEqual(requestBodies[0], {
      text: "让董事长下来。",
      voiceId: "lin-voice",
      speed: 1.05,
      emotion: "tense",
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("drama migrations include pipeline tables for sqlite and postgres", () => {
  const root = path.join(__dirname, "..", "src", "prisma");
  const sqlite = fs.readFileSync(
    path.join(root, "migrations.sqlite", "20260609120000_drama_forge_pipeline", "migration.sql"),
    "utf8",
  );
  const postgres = fs.readFileSync(
    path.join(root, "migrations", "20260609120000_drama_forge_pipeline", "migration.sql"),
    "utf8",
  );
  for (const sql of [sqlite, postgres]) {
    assert.match(sql, /DramaProject/);
    assert.match(sql, /DramaEpisode/);
    assert.match(sql, /DramaStoryboard/);
    assert.match(sql, /DramaVideoPrompt/);
  }
  const sqliteProjectionSql = fs.readFileSync(
    path.join(root, "migrations.sqlite", "20260609170000_drama_video_task_projection", "migration.sql"),
    "utf8",
  );
  const postgresProjectionSql = fs.readFileSync(
    path.join(root, "migrations", "20260609170000_drama_video_task_projection", "migration.sql"),
    "utf8",
  );
  for (const sql of [sqliteProjectionSql, postgresProjectionSql]) {
    assert.match(sql, /resultUrl/);
    assert.match(sql, /failureReason/);
  }
  const sqliteKeyframeSql = fs.readFileSync(
    path.join(root, "migrations.sqlite", "20260610090000_drama_shot_keyframes", "migration.sql"),
    "utf8",
  );
  const postgresKeyframeSql = fs.readFileSync(
    path.join(root, "migrations", "20260610090000_drama_shot_keyframes", "migration.sql"),
    "utf8",
  );
  for (const sql of [sqliteKeyframeSql, postgresKeyframeSql]) {
    assert.match(sql, /keyframeData/);
  }
  const sqliteBatchJobSql = fs.readFileSync(
    path.join(root, "migrations.sqlite", "20260610110000_drama_batch_jobs", "migration.sql"),
    "utf8",
  );
  const postgresBatchJobSql = fs.readFileSync(
    path.join(root, "migrations", "20260610110000_drama_batch_jobs", "migration.sql"),
    "utf8",
  );
  for (const sql of [sqliteBatchJobSql, postgresBatchJobSql]) {
    assert.match(sql, /DramaBatchJob/);
    assert.match(sql, /progress/);
  }
  const sqliteDialogueAudioSql = fs.readFileSync(
    path.join(root, "migrations.sqlite", "20260610130000_drama_dialogue_audio", "migration.sql"),
    "utf8",
  );
  const postgresDialogueAudioSql = fs.readFileSync(
    path.join(root, "migrations", "20260610130000_drama_dialogue_audio", "migration.sql"),
    "utf8",
  );
  for (const sql of [sqliteDialogueAudioSql, postgresDialogueAudioSql]) {
    assert.match(sql, /dialogueAudioData/);
  }
  const sqliteGenerationVersionSql = fs.readFileSync(
    path.join(root, "migrations.sqlite", "20260610143000_drama_generation_versions", "migration.sql"),
    "utf8",
  );
  const postgresGenerationVersionSql = fs.readFileSync(
    path.join(root, "migrations", "20260610143000_drama_generation_versions", "migration.sql"),
    "utf8",
  );
  for (const sql of [sqliteGenerationVersionSql, postgresGenerationVersionSql]) {
    assert.match(sql, /version/);
    assert.match(sql, /supersededById/);
    assert.match(sql, /DramaVideoPrompt_projectId_shotId_version_idx/);
  }
});
