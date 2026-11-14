const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const { createApp } = require("../dist/app.js");
const { prisma } = require("../dist/db/prisma.js");
const { probeStatus } = require("../dist/llm/compatibility/probing.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

// Regression: a newly created custom provider must default to automatic
// compatibility probing, so structured calls can turn reasoning off from the
// first use. The per-provider switch in the compatibility section stays
// available to turn it back off.
test("POST /api/settings/custom-providers enables auto-probe by default", async (t) => {
  const originals = {
    findUnique: prisma.aPIKey.findUnique,
    create: prisma.aPIKey.create,
    settingFindUnique: prisma.appSetting.findUnique,
    settingFindMany: prisma.appSetting.findMany,
    settingUpsert: prisma.appSetting.upsert,
    fetch: global.fetch,
  };
  const httpFetch = originals.fetch.bind(global);
  const settings = new Map();
  prisma.aPIKey.findUnique = async () => null;
  prisma.aPIKey.create = async ({ data }) => ({
    id: "api-key-custom-created",
    provider: data.provider,
    displayName: data.displayName,
    key: data.key,
    model: data.model,
    baseURL: data.baseURL,
    isActive: data.isActive,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
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
    prisma.appSetting.findUnique = originals.settingFindUnique;
    prisma.appSetting.findMany = originals.settingFindMany;
    prisma.appSetting.upsert = originals.settingUpsert;
    global.fetch = originals.fetch;
  });

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const response = await httpFetch(`http://127.0.0.1:${port}/api/settings/custom-providers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "StoryHub Gateway", model: "story-model", baseURL: "https://gateway.example.com/v1" }),
    });
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(settings.get(`modelCompatibility.autoProbe.${payload.data.provider}`), "true");
    // Drain the background probe while the stubbed fetch is still in place.
    const probeDeadline = Date.now() + 15000;
    for (;;) {
      const probe = await probeStatus({ provider: payload.data.provider, model: "story-model", baseURL: "https://gateway.example.com/v1" });
      if (probe.state === "succeeded" || probe.state === "failed" || Date.now() > probeDeadline) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
