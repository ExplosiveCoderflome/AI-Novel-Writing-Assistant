const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");
const { prisma } = require("../dist/db/prisma.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

test("GET /api/settings/api-keys exposes image generation metadata for supported providers", async () => {
  const originalFindMany = prisma.aPIKey.findMany;
  const originalAppSettingFindMany = prisma.appSetting.findMany;
  const originalFetch = global.fetch;
  const originalOpenAIKey = process.env.OPENAI_API_KEY;

  process.env.OPENAI_API_KEY = "test-openai-key";
  prisma.aPIKey.findMany = async () => ([
    {
      id: "api-key-openai",
      provider: "openai",
      displayName: null,
      key: "saved-openai-key",
      model: "gpt-5",
      baseURL: "https://api.openai.com/v1",
      isActive: true,
      reasoningEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "api-key-custom",
      provider: "custom_codex",
      displayName: "codex",
      key: "",
      model: "gpt-5.5",
      baseURL: "http://127.0.0.1:43414/v1",
      isActive: true,
      reasoningEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  prisma.appSetting.findMany = async () => ([
    {
      key: "provider.imageModel.openai",
      value: "gpt-image-2",
    },
    {
      key: "provider.imageModel.custom_codex",
      value: "custom-image-model",
    },
  ]);
  global.fetch = async () => new Response(JSON.stringify({
    data: [{ id: "gpt-5" }, { id: "gpt-5-mini" }],
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const response = await originalFetch(`http://127.0.0.1:${port}/api/settings/api-keys`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    const openai = payload.data.find((item) => item.provider === "openai");
    assert.ok(openai);
    assert.equal(openai.currentImageModel, "gpt-image-2");
    assert.equal(openai.defaultImageModel, "gpt-image-2");
    assert.equal(openai.supportsImageGeneration, true);
    assert.ok(openai.imageModels.includes("gpt-image-2"));
    const custom = payload.data.find((item) => item.provider === "custom_codex");
    assert.ok(custom);
    assert.equal(custom.currentImageModel, "custom-image-model");
    assert.equal(custom.supportsImageGeneration, true);
    assert.deepEqual(custom.imageModels, ["custom-image-model"]);
  } finally {
    prisma.aPIKey.findMany = originalFindMany;
    prisma.appSetting.findMany = originalAppSettingFindMany;
    global.fetch = originalFetch;
    if (originalOpenAIKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAIKey;
    }
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("PUT /api/settings/api-keys/openai saves image generation model settings", async () => {
  const originalFindUnique = prisma.aPIKey.findUnique;
  const originalUpsert = prisma.aPIKey.upsert;
  const originalAppSettingUpsert = prisma.appSetting.upsert;
  const originalFetch = global.fetch;
  const httpFetch = originalFetch.bind(global);
  let savedImageModelSetting = null;

  prisma.aPIKey.findUnique = async () => null;
  prisma.aPIKey.upsert = async ({ create }) => ({
    id: "api-key-openai",
    provider: create.provider,
    key: create.key,
    model: create.model,
    baseURL: create.baseURL,
    isActive: create.isActive,
    reasoningEnabled: create.reasoningEnabled,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  prisma.appSetting.upsert = async ({ where, create, update }) => {
    savedImageModelSetting = { where, create, update };
    return {
      id: "app-setting-openai-image-model",
      key: create.key,
      value: create.value,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  };
  global.fetch = async () => new Response(JSON.stringify({
    data: [{ id: "gpt-5" }, { id: "gpt-5-mini" }],
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const response = await httpFetch(`http://127.0.0.1:${port}/api/settings/api-keys/openai`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key: "test-openai-key",
        model: "gpt-5",
        imageModel: "gpt-image-2",
        baseURL: "https://api.openai.com/v1",
      }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data.provider, "openai");
    assert.equal(payload.data.imageModel, "gpt-image-2");
    assert.equal(payload.data.supportsImageGeneration, true);
    assert.ok(payload.data.imageModels.includes("gpt-image-2"));
    assert.deepEqual(savedImageModelSetting, {
      where: { key: "provider.imageModel.openai" },
      create: { key: "provider.imageModel.openai", value: "gpt-image-2" },
      update: { value: "gpt-image-2" },
    });
  } finally {
    prisma.aPIKey.findUnique = originalFindUnique;
    prisma.aPIKey.upsert = originalUpsert;
    prisma.appSetting.upsert = originalAppSettingUpsert;
    global.fetch = originalFetch;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("POST /api/settings/custom-providers saves optional image model settings", async () => {
  const originalFindUnique = prisma.aPIKey.findUnique;
  const originalCreate = prisma.aPIKey.create;
  const originalAppSettingUpsert = prisma.appSetting.upsert;
  const originalFetch = global.fetch;
  const httpFetch = originalFetch.bind(global);
  let savedImageModelSetting = null;

  prisma.aPIKey.findUnique = async () => null;
  prisma.aPIKey.create = async ({ data }) => ({
    id: "api-key-custom-codex",
    provider: data.provider,
    displayName: data.displayName,
    key: data.key,
    model: data.model,
    baseURL: data.baseURL,
    isActive: data.isActive,
    reasoningEnabled: data.reasoningEnabled,
    concurrencyLimit: data.concurrencyLimit,
    requestIntervalMs: data.requestIntervalMs,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  prisma.appSetting.upsert = async ({ where, create, update }) => {
    savedImageModelSetting = { where, create, update };
    return {
      id: "app-setting-custom-image-model",
      key: create.key,
      value: create.value,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  };
  global.fetch = async () => new Response(JSON.stringify({
    data: [{ id: "gpt-5.5" }, { id: "custom-image-model" }],
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const response = await httpFetch(`http://127.0.0.1:${port}/api/settings/custom-providers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "codex",
        model: "gpt-5.5",
        imageModel: "custom-image-model",
        baseURL: "http://127.0.0.1:43414/v1",
      }),
    });
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data.provider, "custom_codex");
    assert.equal(payload.data.imageModel, "custom-image-model");
    assert.equal(payload.data.supportsImageGeneration, true);
    assert.deepEqual(payload.data.imageModels, ["custom-image-model"]);
    assert.deepEqual(savedImageModelSetting, {
      where: { key: "provider.imageModel.custom_codex" },
      create: { key: "provider.imageModel.custom_codex", value: "custom-image-model" },
      update: { value: "custom-image-model" },
    });
  } finally {
    prisma.aPIKey.findUnique = originalFindUnique;
    prisma.aPIKey.create = originalCreate;
    prisma.appSetting.upsert = originalAppSettingUpsert;
    global.fetch = originalFetch;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
