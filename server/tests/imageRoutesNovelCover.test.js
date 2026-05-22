const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");
const { imageGenerationService } = require("../dist/services/image/ImageGenerationService.js");
const { imagePromptOptimizationService } = require("../dist/services/image/ImagePromptOptimizationService.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

function buildNovelCoverTask(overrides = {}) {
  return {
    id: "image-task-cover-1",
    sceneType: "novel_cover",
    novelId: "novel-cover-1",
    baseCharacterId: null,
    provider: "openai",
    model: "gpt-image-2",
    prompt: "vertical key art",
    negativePrompt: "文字，水印",
    stylePreset: "电影感插画",
    size: "1024x1536",
    imageCount: 2,
    seed: null,
    status: "queued",
    progress: 0,
    retryCount: 0,
    maxRetries: 2,
    heartbeatAt: null,
    currentStage: "queued",
    currentItemKey: "novel-cover-1",
    currentItemLabel: "雾港审判局",
    cancelRequestedAt: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date("2026-05-22T10:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-05-22T10:00:00.000Z").toISOString(),
    ...overrides,
  };
}

function buildNovelCoverAsset(overrides = {}) {
  return {
    id: "image-asset-cover-1",
    taskId: "image-task-cover-1",
    sceneType: "novel_cover",
    novelId: "novel-cover-1",
    baseCharacterId: null,
    provider: "openai",
    model: "gpt-image-2",
    url: "/api/images/assets/image-asset-cover-1/file",
    localPath: "D:\\images\\cover-1.png",
    sourceUrl: null,
    mimeType: "image/png",
    width: 1024,
    height: 1536,
    seed: null,
    prompt: "vertical key art",
    isPrimary: true,
    sortOrder: 0,
    metadata: null,
    createdAt: new Date("2026-05-22T10:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-05-22T10:00:00.000Z").toISOString(),
    ...overrides,
  };
}

test("image routes accept and return novel_cover payloads", async () => {
  const originalCreateNovelCoverTask = imageGenerationService.createNovelCoverTask;
  const originalListNovelCoverAssets = imageGenerationService.listNovelCoverAssets;
  const originalOptimizeNovelCoverPrompt = imagePromptOptimizationService.optimizeNovelCoverPrompt;
  const httpFetch = global.fetch.bind(global);
  const calls = {
    create: null,
    optimize: null,
    list: null,
  };

  imageGenerationService.createNovelCoverTask = async (input) => {
    calls.create = input;
    return buildNovelCoverTask();
  };
  imageGenerationService.listNovelCoverAssets = async (novelId) => {
    calls.list = novelId;
    return [buildNovelCoverAsset()];
  };
  imagePromptOptimizationService.optimizeNovelCoverPrompt = async (input) => {
    calls.optimize = input;
    return {
      prompt: "optimized cover prompt",
      outputLanguage: input.outputLanguage,
    };
  };

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const generateResponse = await httpFetch(`http://127.0.0.1:${port}/api/images/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sceneType: "novel_cover",
        sceneId: "novel-cover-1",
        prompt: "突出雾港审判感",
        promptMode: "novel_cover_chain",
        provider: "openai",
        size: "1024x1536",
        count: 2,
      }),
    });
    assert.equal(generateResponse.status, 202);
    const generatePayload = await generateResponse.json();
    assert.equal(generatePayload.success, true);
    assert.equal(generatePayload.data.sceneType, "novel_cover");
    assert.equal(generatePayload.data.novelId, "novel-cover-1");
    assert.deepEqual(calls.create, {
      sceneType: "novel_cover",
      novelId: "novel-cover-1",
      prompt: "突出雾港审判感",
      promptMode: "novel_cover_chain",
      negativePrompt: undefined,
      stylePreset: undefined,
      provider: "openai",
      model: undefined,
      size: "1024x1536",
      count: 2,
      seed: undefined,
      maxRetries: undefined,
    });

    const optimizeResponse = await httpFetch(`http://127.0.0.1:${port}/api/images/optimize-prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sceneType: "novel_cover",
        sceneId: "novel-cover-1",
        sourcePrompt: "突出冷峻都市感",
        stylePreset: "电影感插画",
        outputLanguage: "zh",
      }),
    });
    assert.equal(optimizeResponse.status, 200);
    const optimizePayload = await optimizeResponse.json();
    assert.equal(optimizePayload.success, true);
    assert.equal(optimizePayload.data.prompt, "optimized cover prompt");
    assert.deepEqual(calls.optimize, {
      sceneType: "novel_cover",
      novelId: "novel-cover-1",
      sourcePrompt: "突出冷峻都市感",
      stylePreset: "电影感插画",
      outputLanguage: "zh",
    });

    const listResponse = await httpFetch(`http://127.0.0.1:${port}/api/images/assets?sceneType=novel_cover&sceneId=novel-cover-1`);
    assert.equal(listResponse.status, 200);
    const listPayload = await listResponse.json();
    assert.equal(listPayload.success, true);
    assert.equal(listPayload.data.length, 1);
    assert.equal(listPayload.data[0].sceneType, "novel_cover");
    assert.equal(listPayload.data[0].novelId, "novel-cover-1");
    assert.equal(calls.list, "novel-cover-1");
  } finally {
    imageGenerationService.createNovelCoverTask = originalCreateNovelCoverTask;
    imageGenerationService.listNovelCoverAssets = originalListNovelCoverAssets;
    imagePromptOptimizationService.optimizeNovelCoverPrompt = originalOptimizeNovelCoverPrompt;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
