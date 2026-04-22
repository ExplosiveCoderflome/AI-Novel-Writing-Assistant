const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const { DatabaseSecretStore } = require("../dist/services/settings/secretStore/DatabaseSecretStore.js");

test("DatabaseSecretStore.listProviders forwards filters to prisma", async () => {
  const originalFindMany = prisma.aPIKey.findMany;
  const captured = [];

  prisma.aPIKey.findMany = async (args) => {
    captured.push(args);
    return [{
      id: "api-key-openai",
      provider: "openai",
      displayName: null,
      key: "test-openai-key",
      model: "gpt-5.4",
      baseURL: "https://api.openai.com/v1",
      isActive: true,
      reasoningEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }];
  };

  try {
    const store = new DatabaseSecretStore();
    const records = await store.listProviders({
      onlyActive: true,
      providers: ["openai", "deepseek"],
    });

    assert.equal(records.length, 1);
    assert.deepEqual(captured, [{
      where: {
        isActive: true,
        provider: {
          in: ["openai", "deepseek"],
        },
      },
      orderBy: [{ createdAt: "asc" }],
    }]);
  } finally {
    prisma.aPIKey.findMany = originalFindMany;
  }
});

test("DatabaseSecretStore.upsertProvider normalizes write payload for prisma", async () => {
  const originalUpsert = prisma.aPIKey.upsert;
  let captured = null;

  prisma.aPIKey.upsert = async (args) => {
    captured = args;
    return {
      id: "api-key-custom",
      provider: "custom_storyhub",
      displayName: "StoryHub Gateway",
      key: "custom-key",
      model: "story-model",
      baseURL: "https://gateway.example.com/v1",
      isActive: true,
      reasoningEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  };

  try {
    const store = new DatabaseSecretStore();
    const record = await store.upsertProvider("custom_storyhub", {
      displayName: "StoryHub Gateway",
      key: "custom-key",
      model: "story-model",
      baseURL: "https://gateway.example.com/v1",
      isActive: true,
      reasoningEnabled: false,
    });

    assert.equal(record.provider, "custom_storyhub");
    assert.deepEqual(captured, {
      where: { provider: "custom_storyhub" },
      update: {
        displayName: "StoryHub Gateway",
        key: "custom-key",
        model: "story-model",
        baseURL: "https://gateway.example.com/v1",
        isActive: true,
        reasoningEnabled: false,
      },
      create: {
        provider: "custom_storyhub",
        displayName: "StoryHub Gateway",
        key: "custom-key",
        model: "story-model",
        baseURL: "https://gateway.example.com/v1",
        isActive: true,
        reasoningEnabled: false,
      },
    });
  } finally {
    prisma.aPIKey.upsert = originalUpsert;
  }
});
