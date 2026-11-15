const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createApp } = require("../dist/app.js");
const { prisma } = require("../dist/db/prisma.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

// Regression: newly added providers must default to reasoning off, so a model
// that thinks by default cannot eat a structured step's output budget before
// compatibility probing learns its thinking control. An explicit choice is
// always respected, and updating an existing provider never flips its stored
// value.
function installStubs(t, { existing = null, captured }) {
  const originals = {
    findUnique: prisma.aPIKey.findUnique,
    create: prisma.aPIKey.create,
    upsert: prisma.aPIKey.upsert,
    settingFindUnique: prisma.appSetting.findUnique,
    settingFindMany: prisma.appSetting.findMany,
    settingUpsert: prisma.appSetting.upsert,
    fetch: global.fetch,
  };
  const httpFetch = originals.fetch.bind(global);
  const settings = new Map();
  prisma.aPIKey.findUnique = async () => existing;
  prisma.aPIKey.create = async ({ data }) => {
    captured.create = data;
    return { id: "api-key-created", createdAt: new Date(), updatedAt: new Date(), ...data };
  };
  prisma.aPIKey.upsert = async ({ create, update }) => {
    captured.upsert = existing ? update : create;
    return { id: "api-key-upserted", createdAt: new Date(), updatedAt: new Date(), ...(existing ?? {}), ...(existing ? update : create) };
  };
  prisma.appSetting.findUnique = async ({ where }) => (settings.has(where.key) ? { key: where.key, value: settings.get(where.key) } : null);
  prisma.appSetting.findMany = async ({ where }) => [...settings].filter(([key]) => where.key.in.includes(key)).map(([key, value]) => ({ key, value }));
  prisma.appSetting.upsert = async ({ where, create, update }) => {
    const value = settings.has(where.key) ? update.value : create.value;
    settings.set(where.key, value);
    return { key: where.key, value };
  };
  global.fetch = async () => new Response(JSON.stringify({ data: [{ id: "story-model" }] }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
  t.after(() => {
    prisma.aPIKey.findUnique = originals.findUnique;
    prisma.aPIKey.create = originals.create;
    prisma.aPIKey.upsert = originals.upsert;
    prisma.appSetting.findUnique = originals.settingFindUnique;
    prisma.appSetting.findMany = originals.settingFindMany;
    prisma.appSetting.upsert = originals.settingUpsert;
    global.fetch = originals.fetch;
  });
  return httpFetch;
}

async function postJson(httpFetch, port, path, body) {
  const response = await httpFetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

async function putJson(httpFetch, port, path, body) {
  const response = await httpFetch(`http://127.0.0.1:${port}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
}

test("POST /api/settings/custom-providers defaults new providers to reasoning off", async (t) => {
  const captured = {};
  const httpFetch = installStubs(t, { captured });
  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const { status, json } = await postJson(httpFetch, port, "/api/settings/custom-providers", {
      name: "Quiet Gateway", model: "story-model", baseURL: "https://gateway.example.com/v1",
    });
    assert.equal(status, 201);
    assert.equal(captured.create.reasoningEnabled, false);
    assert.equal(json.data.reasoningEnabled, false);
  } finally {
    server.close();
  }
});

test("POST /api/settings/custom-providers respects an explicit reasoning choice", async (t) => {
  const captured = {};
  const httpFetch = installStubs(t, { captured });
  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const { status, json } = await postJson(httpFetch, port, "/api/settings/custom-providers", {
      name: "Thinking Gateway", model: "story-model", baseURL: "https://gateway.example.com/v1", reasoningEnabled: true,
    });
    assert.equal(status, 201);
    assert.equal(captured.create.reasoningEnabled, true);
    assert.equal(json.data.reasoningEnabled, true);
  } finally {
    server.close();
  }
});

test("PUT /api/settings/api-keys/:provider defaults a first-time provider to reasoning off", async (t) => {
  const captured = {};
  const httpFetch = installStubs(t, { captured });
  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const { status, json } = await putJson(httpFetch, port, "/api/settings/api-keys/deepseek", {
      key: "fixture-key", model: "deepseek-chat",
    });
    assert.equal(status, 200);
    assert.equal(captured.upsert.reasoningEnabled, false);
    assert.equal(json.data.reasoningEnabled, false);
  } finally {
    server.close();
  }
});

test("PUT /api/settings/api-keys/:provider keeps an existing provider's reasoning choice", async (t) => {
  const captured = {};
  const existing = {
    provider: "deepseek", displayName: null, key: "old-key", model: "deepseek-chat", baseURL: null,
    authMode: "bearer", isActive: true, reasoningEnabled: true, reasoningEffort: "high",
    hiddenModels: "[]", availableModels: "[]", concurrencyLimit: 0, requestIntervalMs: 0,
  };
  const httpFetch = installStubs(t, { existing, captured });
  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const { status, json } = await putJson(httpFetch, port, "/api/settings/api-keys/deepseek", { key: "fixture-key" });
    assert.equal(status, 200);
    assert.equal(captured.upsert.reasoningEnabled, true);
    assert.equal(json.data.reasoningEnabled, true);
  } finally {
    server.close();
  }
});
