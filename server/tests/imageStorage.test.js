const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");

const modulePaths = [
  "../dist/config/imageStorage.js",
  "../dist/services/image/objectImageStorage.js",
  "../dist/services/image/imageAssetStorage.js",
].map((item) => path.join(__dirname, item));

function clearModules() {
  for (const modulePath of modulePaths) {
    delete require.cache[modulePath];
  }
}

function loadModules() {
  clearModules();
  return {
    imageStorageConfig: require(modulePaths[0]),
    imageAssetStorage: require(modulePaths[2]),
  };
}

function withEnv(overrides, run) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const key of Object.keys(overrides)) {
        if (previous[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = previous[key];
        }
      }
      clearModules();
    });
}

const pngDataUrl = `data:image/png;base64,${Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d,
]).toString("base64")}`;

test("image storage defaults to beta local file storage", async () => {
  await withEnv({
    IMAGE_STORAGE_DRIVER: undefined,
    IMAGE_STORAGE_S3_BUCKET: undefined,
    MINIO_BUCKET: undefined,
  }, async () => {
    const { imageStorageConfig, imageAssetStorage } = loadModules();
    const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-local-images-"));

    try {
      assert.equal(imageStorageConfig.imageStorageConfig.driver, "local");
      const persisted = await imageAssetStorage.persistGeneratedImageAsset({
        taskId: "task_local_1",
        sceneType: "character",
        baseCharacterId: "character_local_1",
        sortOrder: 0,
        url: pngDataUrl,
        mimeType: "image/png",
        storageRoot,
        s3Client: {
          send: async () => {
            throw new Error("S3 client must not be used for default local storage.");
          },
        },
      });

      assert.equal(persisted.storageDriver, "local");
      assert.equal(persisted.storageKey, null);
      assert.ok(persisted.localPath);
      assert.ok(fs.existsSync(persisted.localPath));
      assert.equal(persisted.persistedUrl, persisted.localPath);
    } finally {
      fs.rmSync(storageRoot, { recursive: true, force: true });
    }
  });
});

test("image storage enables MinIO only when driver is selected", async () => {
  await withEnv({
    IMAGE_STORAGE_DRIVER: "minio",
    IMAGE_STORAGE_S3_BUCKET: "test-bucket",
    IMAGE_STORAGE_S3_ENDPOINT: "http://127.0.0.1:9000",
    IMAGE_STORAGE_S3_ACCESS_KEY_ID: "access-key",
    IMAGE_STORAGE_S3_SECRET_ACCESS_KEY: "secret-key",
  }, async () => {
    const { imageStorageConfig, imageAssetStorage } = loadModules();
    let putInput = null;

    const persisted = await imageAssetStorage.persistGeneratedImageAsset({
      taskId: "task_minio_1",
      sceneType: "character",
      baseCharacterId: "character_minio_1",
      sortOrder: 1,
      url: pngDataUrl,
      mimeType: "image/png",
      s3Client: {
        send: async (command) => {
          putInput = command.input;
          return {};
        },
      },
    });

    assert.equal(imageStorageConfig.imageStorageConfig.driver, "s3");
    assert.equal(persisted.storageDriver, "s3");
    assert.equal(persisted.localPath, null);
    assert.equal(persisted.relativePath, "characters/character_minio_1/task_minio_1/image-02.png");
    assert.equal(persisted.storageKey, persisted.relativePath);
    assert.equal(persisted.persistedUrl, persisted.storageKey);
    assert.equal(putInput.Bucket, "test-bucket");
    assert.equal(putInput.Key, persisted.storageKey);
    assert.equal(putInput.ContentType, "image/png");
  });
});

test("image storage resolves and deletes MinIO objects from metadata", async () => {
  await withEnv({
    IMAGE_STORAGE_DRIVER: "minio",
    IMAGE_STORAGE_S3_BUCKET: "test-bucket",
  }, async () => {
    const { imageAssetStorage } = loadModules();
    const metadata = JSON.stringify({
      storageDriver: "s3",
      storageKey: "characters/character_1/task_1/image-01.png",
    });
    const resolved = await imageAssetStorage.resolveImageAssetFile({
      assetId: "asset_1",
      url: "characters/character_1/task_1/image-01.png",
      mimeType: "image/png",
      metadata,
      s3Client: {
        send: async () => ({
          Body: Readable.from([Buffer.from("object-bytes")]),
          ContentType: "image/png",
        }),
      },
    });

    const chunks = [];
    for await (const chunk of resolved.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    assert.deepEqual(Buffer.concat(chunks), Buffer.from("object-bytes"));
    assert.equal(resolved.mimeType, "image/png");

    let deleteInput = null;
    await imageAssetStorage.removeStoredImageAssetFile({
      url: "characters/character_1/task_1/image-01.png",
      metadata,
      s3Client: {
        send: async (command) => {
          deleteInput = command.input;
          return {};
        },
      },
    });
    assert.deepEqual(deleteInput, {
      Bucket: "test-bucket",
      Key: "characters/character_1/task_1/image-01.png",
    });
  });
});
