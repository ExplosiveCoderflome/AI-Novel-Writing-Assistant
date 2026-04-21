const test = require("node:test");
const assert = require("node:assert/strict");

const { AppError } = require("../dist/middleware/errorHandler.js");
const { ImageGenerationService } = require("../dist/services/image/ImageGenerationService.js");
const { prisma } = require("../dist/db/prisma.js");
const provider = require("../dist/services/image/provider.js");
const imageAssetStorage = require("../dist/services/image/imageAssetStorage.js");

test("executeTask cleans up persisted assets when cancelled after persistence before database write", async () => {
  const originals = {
    findUnique: prisma.imageGenerationTask.findUnique,
    update: prisma.imageGenerationTask.update,
    transaction: prisma.$transaction,
    generateImagesByProvider: provider.generateImagesByProvider,
    persistGeneratedImageAsset: imageAssetStorage.persistGeneratedImageAsset,
    removeStoredImageAssetFile: imageAssetStorage.removeStoredImageAssetFile,
  };

  const updates = [];
  const removed = [];
  let transactionCalled = false;

  prisma.imageGenerationTask.findUnique = async () => ({
    id: "task_cleanup_cancelled",
    status: "queued",
    pendingManualRecovery: false,
    cancelRequestedAt: null,
    baseCharacterId: "character_1",
    baseCharacter: { id: "character_1", name: "主角" },
    provider: "openai",
    model: "gpt-image-1",
    prompt: "hero portrait",
    negativePrompt: null,
    size: "1024x1024",
    imageCount: 1,
    seed: null,
    startedAt: null,
    progress: 0.1,
    retryCount: 0,
    maxRetries: 2,
  });
  prisma.imageGenerationTask.update = async ({ data }) => {
    updates.push(data);
    return data;
  };
  prisma.$transaction = async () => {
    transactionCalled = true;
    throw new Error("transaction should not run after cancellation");
  };

  provider.generateImagesByProvider = async () => ({
    provider: "openai",
    model: "gpt-image-1",
    images: [{
      url: "data:image/png;base64,iVBORw0KGgo=",
      mimeType: "image/png",
      width: 1024,
      height: 1024,
      seed: 42,
      metadata: null,
    }],
  });
  imageAssetStorage.persistGeneratedImageAsset = async () => ({
    persistedUrl: "characters/character_1/task_cleanup_cancelled/image-01.png",
    localPath: null,
    relativePath: "characters/character_1/task_cleanup_cancelled/image-01.png",
    storageKey: "characters/character_1/task_cleanup_cancelled/image-01.png",
    storageDriver: "s3",
    sourceUrl: null,
    mimeType: "image/png",
  });
  imageAssetStorage.removeStoredImageAssetFile = async (input) => {
    removed.push(input);
  };

  const service = new ImageGenerationService();
  let ensureCalls = 0;
  service.ensureNotCancelled = async () => {
    ensureCalls += 1;
    if (ensureCalls === 4) {
      throw new AppError("IMAGE_TASK_CANCELLED", 400);
    }
  };

  try {
    await service.executeTask("task_cleanup_cancelled");

    assert.equal(transactionCalled, false);
    assert.equal(removed.length, 1);
    assert.equal(removed[0].url, "characters/character_1/task_cleanup_cancelled/image-01.png");
    assert.match(String(removed[0].metadata), /"storageDriver":"s3"/);
    assert.ok(updates.some((data) => data.status === "cancelled"));
  } finally {
    prisma.imageGenerationTask.findUnique = originals.findUnique;
    prisma.imageGenerationTask.update = originals.update;
    prisma.$transaction = originals.transaction;
    provider.generateImagesByProvider = originals.generateImagesByProvider;
    imageAssetStorage.persistGeneratedImageAsset = originals.persistGeneratedImageAsset;
    imageAssetStorage.removeStoredImageAssetFile = originals.removeStoredImageAssetFile;
  }
});

test("executeTask keeps task queued for manual recovery when persisted asset cleanup fails", async () => {
  const originals = {
    findUnique: prisma.imageGenerationTask.findUnique,
    update: prisma.imageGenerationTask.update,
    transaction: prisma.$transaction,
    generateImagesByProvider: provider.generateImagesByProvider,
    persistGeneratedImageAsset: imageAssetStorage.persistGeneratedImageAsset,
    removeStoredImageAssetFile: imageAssetStorage.removeStoredImageAssetFile,
  };

  const updates = [];

  prisma.imageGenerationTask.findUnique = async () => ({
    id: "task_cleanup_failed",
    status: "queued",
    pendingManualRecovery: false,
    cancelRequestedAt: null,
    baseCharacterId: "character_1",
    baseCharacter: { id: "character_1", name: "主角" },
    provider: "openai",
    model: "gpt-image-1",
    prompt: "hero portrait",
    negativePrompt: null,
    size: "1024x1024",
    imageCount: 1,
    seed: null,
    startedAt: null,
    progress: 0.1,
    retryCount: 0,
    maxRetries: 2,
  });
  prisma.imageGenerationTask.update = async ({ data }) => {
    updates.push(data);
    return data;
  };
  prisma.$transaction = async () => {
    throw new AppError("IMAGE_TASK_CANCELLED", 400);
  };

  provider.generateImagesByProvider = async () => ({
    provider: "openai",
    model: "gpt-image-1",
    images: [{
      url: "data:image/png;base64,iVBORw0KGgo=",
      mimeType: "image/png",
      width: 1024,
      height: 1024,
      seed: 42,
      metadata: null,
    }],
  });
  imageAssetStorage.persistGeneratedImageAsset = async () => ({
    persistedUrl: "characters/character_1/task_cleanup_failed/image-01.png",
    localPath: null,
    relativePath: "characters/character_1/task_cleanup_failed/image-01.png",
    storageKey: "characters/character_1/task_cleanup_failed/image-01.png",
    storageDriver: "s3",
    sourceUrl: null,
    mimeType: "image/png",
  });
  imageAssetStorage.removeStoredImageAssetFile = async () => {
    throw new Error("s3 delete down");
  };

  const service = new ImageGenerationService();

  try {
    await service.executeTask("task_cleanup_failed");

    const queuedRecoveryUpdate = updates.find((data) => data.status === "queued" && data.pendingManualRecovery === true);
    assert.ok(queuedRecoveryUpdate);
    assert.match(String(queuedRecoveryUpdate.error), /IMAGE_TASK_CANCELLED/);
    assert.match(String(queuedRecoveryUpdate.error), /清理第 1 个已落盘资源失败/);
  } finally {
    prisma.imageGenerationTask.findUnique = originals.findUnique;
    prisma.imageGenerationTask.update = originals.update;
    prisma.$transaction = originals.transaction;
    provider.generateImagesByProvider = originals.generateImagesByProvider;
    imageAssetStorage.persistGeneratedImageAsset = originals.persistGeneratedImageAsset;
    imageAssetStorage.removeStoredImageAssetFile = originals.removeStoredImageAssetFile;
  }
});

test("deleteAsset restores row when stored asset cleanup fails", async () => {
  const originals = {
    findUnique: prisma.imageAsset.findUnique,
    transaction: prisma.$transaction,
    removeStoredImageAssetFile: imageAssetStorage.removeStoredImageAssetFile,
  };

  const transactions = [];

  prisma.imageAsset.findUnique = async () => ({
    id: "asset_delete_guard",
    taskId: "task_1",
    sceneType: "character",
    baseCharacterId: "character_1",
    provider: "openai",
    model: "gpt-image-1",
    url: "characters/character_1/task_1/image-01.png",
    mimeType: "image/png",
    width: 1024,
    height: 1024,
    seed: 42,
    prompt: "hero portrait",
    isPrimary: true,
    sortOrder: 0,
    metadata: JSON.stringify({
      storageDriver: "s3",
      storageKey: "characters/character_1/task_1/image-01.png",
    }),
    createdAt: new Date("2026-04-13T00:00:00.000Z"),
    updatedAt: new Date("2026-04-13T00:00:00.000Z"),
  });
  prisma.$transaction = async (callback) => {
    const operations = [];
    transactions.push(operations);
    return callback({
      imageAsset: {
        delete: async (input) => {
          operations.push({ type: "delete", input });
        },
        findFirst: async () => ({ id: "replacement_asset" }),
        update: async (input) => {
          operations.push({ type: "update", input });
        },
        updateMany: async (input) => {
          operations.push({ type: "updateMany", input });
        },
        create: async (input) => {
          operations.push({ type: "create", input });
        },
      },
    });
  };
  imageAssetStorage.removeStoredImageAssetFile = async () => {
    throw new Error("s3 delete down");
  };

  const service = new ImageGenerationService();

  try {
    await assert.rejects(service.deleteAsset("asset_delete_guard"), /s3 delete down/);
    assert.equal(transactions.length, 2);
    assert.equal(transactions[0][0].type, "delete");
    assert.equal(transactions[1][0].type, "updateMany");
    assert.equal(transactions[1][1].type, "create");
    assert.equal(transactions[1][1].input.data.id, "asset_delete_guard");
  } finally {
    prisma.imageAsset.findUnique = originals.findUnique;
    prisma.$transaction = originals.transaction;
    imageAssetStorage.removeStoredImageAssetFile = originals.removeStoredImageAssetFile;
  }
});
