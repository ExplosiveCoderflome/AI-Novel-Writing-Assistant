const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");

const imageStorageConfigPath = path.join(__dirname, "../dist/config/imageStorage.js");
const imageAssetStoragePath = path.join(__dirname, "../dist/services/image/imageAssetStorage.js");
const imageGenerationMappersPath = path.join(__dirname, "../dist/services/image/imageGenerationMappers.js");

function loadModules() {
  delete require.cache[imageStorageConfigPath];
  delete require.cache[imageAssetStoragePath];
  delete require.cache[imageGenerationMappersPath];
  const imageStorageConfig = require(imageStorageConfigPath);
  const imageAssetStorage = require(imageAssetStoragePath);
  const imageGenerationMappers = require(imageGenerationMappersPath);
  return {
    imageStorageConfig,
    imageAssetStorage,
    imageGenerationMappers,
  };
}

test("toImageAsset keeps public asset route for s3-backed assets", () => {
  const { imageGenerationMappers } = loadModules();
  const asset = imageGenerationMappers.toImageAsset({
    id: "asset_s3_1",
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
      sourceUrl: "https://upstream.example.com/generated.png",
    }),
    createdAt: new Date("2026-04-13T00:00:00.000Z"),
    updatedAt: new Date("2026-04-13T00:00:00.000Z"),
  });

  assert.equal(asset.url, "/api/images/assets/asset_s3_1/file");
  assert.equal(asset.localPath, null);
  assert.equal(asset.metadata, null);
  assert.equal(asset.sourceUrl, null);
});

test("persistGeneratedImageAsset rejects private-network remote URLs", async () => {
  const { imageAssetStorage } = loadModules();

  await assert.rejects(
    imageAssetStorage.persistGeneratedImageAsset({
      taskId: "task_ssrf_1",
      sceneType: "character",
      baseCharacterId: "character_1",
      sortOrder: 0,
      url: "http://127.0.0.1/private.png",
      mimeType: "image/png",
    }),
    /Generated image URL must use HTTPS|private network address/,
  );
});

test("persistGeneratedImageAsset uploads s3-backed assets through the configured client", async () => {
  const originalDriver = process.env.IMAGE_STORAGE_DRIVER;
  const originalBucket = process.env.IMAGE_STORAGE_S3_BUCKET;
  process.env.IMAGE_STORAGE_DRIVER = "s3";
  process.env.IMAGE_STORAGE_S3_BUCKET = "test-bucket";

  try {
    const { imageAssetStorage } = loadModules();
    let putInput = null;
    const persisted = await imageAssetStorage.persistGeneratedImageAsset({
      taskId: "task_s3_1",
      sceneType: "character",
      baseCharacterId: "character_1",
      sortOrder: 0,
      url: "data:image/png;base64,iVBORw0KGgo=",
      mimeType: "image/png",
      s3Client: {
        send: async (command) => {
          putInput = command.input;
          return {};
        },
      },
    });

    assert.equal(putInput.Bucket, "test-bucket");
    assert.equal(putInput.Key, "characters/character_1/task_s3_1/image-01.png");
    assert.equal(persisted.persistedUrl, "characters/character_1/task_s3_1/image-01.png");
    assert.equal(persisted.storageKey, "characters/character_1/task_s3_1/image-01.png");
    assert.equal(persisted.storageDriver, "s3");
    assert.equal(persisted.localPath, null);
  } finally {
    if (originalDriver === undefined) {
      delete process.env.IMAGE_STORAGE_DRIVER;
    } else {
      process.env.IMAGE_STORAGE_DRIVER = originalDriver;
    }
    if (originalBucket === undefined) {
      delete process.env.IMAGE_STORAGE_S3_BUCKET;
    } else {
      process.env.IMAGE_STORAGE_S3_BUCKET = originalBucket;
    }
  }
});

test("resolveImageAssetFile still serves legacy local files inside configured storage roots", async () => {
  const { imageStorageConfig, imageAssetStorage } = loadModules();
  const storageRoot = path.resolve(process.cwd(), imageStorageConfig.getImageStorageRoot());
  fs.mkdirSync(storageRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(storageRoot, "legacy-"));
  const localPath = path.join(tempDir, "legacy.png");
  fs.writeFileSync(localPath, Buffer.from("legacy-image"));

  try {
    const resolved = await imageAssetStorage.resolveImageAssetFile({
      assetId: "legacy_asset",
      url: localPath,
      mimeType: "image/png",
      metadata: JSON.stringify({
        localPath,
      }),
    });

    assert.equal(resolved.localPath, localPath);
    assert.equal(resolved.mimeType, "image/png");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("persistGeneratedImageAsset normalizes extension from validated mime type", async () => {
  const originalDriver = process.env.IMAGE_STORAGE_DRIVER;
  const originalBucket = process.env.IMAGE_STORAGE_S3_BUCKET;
  process.env.IMAGE_STORAGE_DRIVER = "s3";
  process.env.IMAGE_STORAGE_S3_BUCKET = "test-bucket";

  try {
    const { imageAssetStorage } = loadModules();
    const persisted = await imageAssetStorage.persistGeneratedImageAsset({
      taskId: "task_s3_mime_1",
      sceneType: "character",
      baseCharacterId: "character_1",
      sortOrder: 0,
      url: "data:image/png;base64,iVBORw0KGgo=",
      mimeType: "image/png",
      s3Client: {
        send: async () => ({}),
      },
    });

    assert.equal(persisted.storageKey, "characters/character_1/task_s3_mime_1/image-01.png");
  } finally {
    if (originalDriver === undefined) {
      delete process.env.IMAGE_STORAGE_DRIVER;
    } else {
      process.env.IMAGE_STORAGE_DRIVER = originalDriver;
    }
    if (originalBucket === undefined) {
      delete process.env.IMAGE_STORAGE_S3_BUCKET;
    } else {
      process.env.IMAGE_STORAGE_S3_BUCKET = originalBucket;
    }
  }
});

test("persistGeneratedImageAsset rejects mismatched data-url image payloads", async () => {
  const { imageAssetStorage } = loadModules();

  await assert.rejects(
    imageAssetStorage.persistGeneratedImageAsset({
      taskId: "task_bad_payload_1",
      sceneType: "character",
      baseCharacterId: "character_1",
      sortOrder: 0,
      url: "data:image/png;base64,SGVsbG8=",
      mimeType: "image/png",
    }),
    /does not match declared image MIME type/,
  );
});

test("resolveImageAssetFile reads s3-backed bytes when object exists", async () => {
  const originalDriver = process.env.IMAGE_STORAGE_DRIVER;
  const originalBucket = process.env.IMAGE_STORAGE_S3_BUCKET;
  process.env.IMAGE_STORAGE_DRIVER = "s3";
  process.env.IMAGE_STORAGE_S3_BUCKET = "test-bucket";

  try {
    const { imageAssetStorage } = loadModules();
    const resolved = await imageAssetStorage.resolveImageAssetFile({
      assetId: "s3_asset",
      url: "characters/char/task/image-01.png",
      mimeType: "image/png",
      metadata: JSON.stringify({
        storageDriver: "s3",
        storageKey: "characters/char/task/image-01.png",
      }),
      s3Client: {
        send: async () => ({
          Body: Readable.from([Buffer.from("s3-image")]),
          ContentType: "image/png",
        }),
      },
    });

    const chunks = [];
    for await (const chunk of resolved.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    assert.deepEqual(Buffer.concat(chunks), Buffer.from("s3-image"));
    assert.equal(resolved.mimeType, "image/png");
  } finally {
    if (originalDriver === undefined) {
      delete process.env.IMAGE_STORAGE_DRIVER;
    } else {
      process.env.IMAGE_STORAGE_DRIVER = originalDriver;
    }
    if (originalBucket === undefined) {
      delete process.env.IMAGE_STORAGE_S3_BUCKET;
    } else {
      process.env.IMAGE_STORAGE_S3_BUCKET = originalBucket;
    }
  }
});

test("removeStoredImageAssetFile deletes s3-backed objects using metadata storage key", async () => {
  const originalDriver = process.env.IMAGE_STORAGE_DRIVER;
  const originalBucket = process.env.IMAGE_STORAGE_S3_BUCKET;
  process.env.IMAGE_STORAGE_DRIVER = "s3";
  process.env.IMAGE_STORAGE_S3_BUCKET = "test-bucket";

  try {
    const { imageAssetStorage } = loadModules();
    let deleteInput = null;

    await imageAssetStorage.removeStoredImageAssetFile({
      url: "characters/char/task/image-01.png",
      metadata: JSON.stringify({
        storageDriver: "s3",
        storageKey: "characters/char/task/image-01.png",
      }),
      s3Client: {
        send: async (command) => {
          deleteInput = command.input;
          return {};
        },
      },
    });

    assert.deepEqual(deleteInput, {
      Bucket: "test-bucket",
      Key: "characters/char/task/image-01.png",
    });
  } finally {
    if (originalDriver === undefined) {
      delete process.env.IMAGE_STORAGE_DRIVER;
    } else {
      process.env.IMAGE_STORAGE_DRIVER = originalDriver;
    }
    if (originalBucket === undefined) {
      delete process.env.IMAGE_STORAGE_S3_BUCKET;
    } else {
      process.env.IMAGE_STORAGE_S3_BUCKET = originalBucket;
    }
  }
});

test("removeLocalImageAssetFile rejects paths outside configured storage roots", async () => {
  const { imageAssetStorage } = loadModules();
  const outsidePath = path.join(os.tmpdir(), `image-cleanup-outside-${Date.now()}.png`);
  fs.writeFileSync(outsidePath, Buffer.from("outside"));

  try {
    await assert.rejects(
      imageAssetStorage.removeLocalImageAssetFile({
        assetId: "outside_asset",
        url: outsidePath,
        metadata: JSON.stringify({
          localPath: outsidePath,
        }),
      }),
      /Local image asset file was not found/,
    );
    assert.equal(fs.existsSync(outsidePath), true);
  } finally {
    fs.rmSync(outsidePath, { force: true });
  }
});

test("removeLocalImageAssetFile rejects storage-root symlink escapes", async () => {
  const { imageStorageConfig, imageAssetStorage } = loadModules();
  const storageRoot = path.resolve(process.cwd(), imageStorageConfig.getImageStorageRoot());
  fs.mkdirSync(storageRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(storageRoot, "symlink-"));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "image-cleanup-real-"));
  const targetPath = path.join(outsideDir, "escaped.png");
  const symlinkDir = path.join(tempDir, "linked-dir");
  const escapedPath = path.join(symlinkDir, "escaped.png");
  fs.writeFileSync(targetPath, Buffer.from("outside-via-symlink-dir"));
  fs.symlinkSync(outsideDir, symlinkDir);

  try {
    await assert.rejects(
      imageAssetStorage.removeLocalImageAssetFile({
        assetId: "symlink_escape_asset",
        url: escapedPath,
        metadata: JSON.stringify({
          localPath: escapedPath,
        }),
      }),
      /Local image asset file was not found/,
    );
    assert.equal(fs.existsSync(targetPath), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  }
});

test("removeStoredImageAssetFile rejects non-canonical metadata storage keys", async () => {
  const originalDriver = process.env.IMAGE_STORAGE_DRIVER;
  const originalBucket = process.env.IMAGE_STORAGE_S3_BUCKET;
  process.env.IMAGE_STORAGE_DRIVER = "s3";
  process.env.IMAGE_STORAGE_S3_BUCKET = "test-bucket";

  try {
    const { imageAssetStorage } = loadModules();
    await assert.rejects(
      imageAssetStorage.removeStoredImageAssetFile({
        url: "characters/char/task/image-01.png",
        metadata: JSON.stringify({
          storageDriver: "s3",
          storageKey: "../other-prefix/secret.png",
        }),
        s3Client: {
          send: async () => ({}),
        },
      }),
      /Stored image asset file was not found/,
    );
  } finally {
    if (originalDriver === undefined) {
      delete process.env.IMAGE_STORAGE_DRIVER;
    } else {
      process.env.IMAGE_STORAGE_DRIVER = originalDriver;
    }
    if (originalBucket === undefined) {
      delete process.env.IMAGE_STORAGE_S3_BUCKET;
    } else {
      process.env.IMAGE_STORAGE_S3_BUCKET = originalBucket;
    }
  }
});
