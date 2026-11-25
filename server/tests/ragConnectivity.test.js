const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const { RagConnectionTestService, createRagConnectionTestRouter } = require("../dist/services/rag/connectivity");
const { authMiddleware } = require("../dist/middleware/auth");
const { errorHandler } = require("../dist/middleware/errorHandler");
const { ragConfig } = require("../dist/config/rag");

const embeddingInput = {
  embeddingProvider: "custom-probe", embeddingModel: "embedding-test",
  embeddingBaseURL: "http://localhost:9999/v1", embeddingTimeoutMs: 5000,
};
const qdrantInput = { qdrantUrl: "http://localhost:6333", qdrantTimeoutMs: 1000 };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
function service(overrides = {}) {
  return new RagConnectionTestService({
    getProvider: async () => null,
    getQdrantConnection: async () => ({}),
    fetch: async () => json({ data: [{ embedding: [0.1, -0.2, 0] }] }),
    ...overrides,
  });
}
function environment(t, values) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
}
async function listen(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test("embedding probe uses draft model, endpoint and key without changing runtime settings", async (t) => {
  const before = JSON.stringify(ragConfig);
  let requests = 0;
  const base = await listen(t, async (req, res) => {
    requests++;
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/prefix/v1/embeddings");
    assert.equal(req.headers.authorization, "Bearer draft-secret");
    let body = "";
    for await (const chunk of req) body += chunk;
    assert.deepEqual(JSON.parse(body), { model: "draft-model", input: ["connection test"] });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ data: [{ embedding: [0.1, -0.2, 0] }] }));
  });
  const probe = service({
    fetch,
    getProvider: async () => ({ key: "saved-secret", baseURL: "http://unused.invalid", isActive: true }),
  });
  const result = await probe.testEmbedding({ ...embeddingInput, embeddingBaseURL: base + "/prefix/v1/", embeddingApiKey: "draft-secret", embeddingModel: "draft-model" });
  assert.equal(result.ok, true);
  assert.equal(result.dimensions, 3);
  assert.ok(result.durationMs >= 0);
  assert.equal(requests, 1);
  assert.equal(JSON.stringify(ragConfig), before);
});

test("blank embedding credentials reuse only the selected active provider", async () => {
  let called = 0;
  const probe = service({
    getProvider: async (provider) => {
      assert.equal(provider, "custom-probe");
      return { key: "saved-secret", baseURL: "http://saved.local/v1/", isActive: true };
    },
    fetch: async (url, init) => {
      called++;
      assert.equal(url, "http://saved.local/v1/embeddings");
      assert.equal(init.headers.Authorization, "Bearer saved-secret");
      assert.equal(init.redirect, "error");
      return json({ data: [{ embedding: [1] }] });
    },
  });
  assert.equal((await probe.testEmbedding({ ...embeddingInput, embeddingBaseURL: "", embeddingApiKey: " " })).ok, true);
  assert.equal(called, 1);
  const inactive = service({ getProvider: async () => ({ key: "inactive-secret", baseURL: "http://inactive.local", isActive: false }) });
  assert.equal((await inactive.testEmbedding({ ...embeddingInput, embeddingBaseURL: "" })).ok, false);
});

test("embedding falls back to provider environment and default address", async (t) => {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldBase = process.env.OPENAI_BASE_URL;
  t.after(() => {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
    if (oldBase === undefined) delete process.env.OPENAI_BASE_URL; else process.env.OPENAI_BASE_URL = oldBase;
  });
  process.env.OPENAI_API_KEY = "env-secret";
  delete process.env.OPENAI_BASE_URL;
  const probe = service({ fetch: async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/embeddings");
    assert.equal(init.headers.Authorization, "Bearer env-secret");
    return json({ data: [{ embedding: [1] }] });
  } });
  assert.equal((await probe.testEmbedding({ ...embeddingInput, embeddingProvider: "openai", embeddingBaseURL: "" })).ok, true);
});

const originCases = [
  { name: "normalized default port and changed path stay same-origin", url: "https://EMBED.example:443/other/v2", same: true },
  { name: "same address reuses credentials", url: "https://embed.example/v1", same: true },
  { name: "changed host with blank key", url: "https://other.example/v1" },
  { name: "changed protocol with blank key", url: "http://embed.example/v1" },
  { name: "changed port with blank key", url: "https://embed.example:8443/v1" },
  { name: "changed host with explicit new key", url: "https://other.example/v1", key: "new-origin-key" },
];

test("embedding credentials are reused only for the configured origin, including environment keys", async (t) => {
  for (const source of ["saved", "environment", "environment-key-with-saved-url"]) {
    for (const scenario of originCases) {
      await t.test(`${source}: ${scenario.name}`, async (t) => {
        environment(t, { OPENAI_API_KEY: "env-key", OPENAI_BASE_URL: "https://embed.example/v1" });
        const requests = [];
        const probe = service({
          getProvider: async () => source === "environment" ? null : {
            key: source === "saved" ? "saved-key" : null, baseURL: "https://embed.example/v1", isActive: true,
          },
          fetch: async (url, init) => {
            requests.push({url, key: init.headers.Authorization});
            return json({data: [{embedding: [1]}]});
          },
        });
        const result = await probe.testEmbedding({ ...embeddingInput, embeddingProvider: "openai",
          embeddingBaseURL: scenario.url, embeddingApiKey: scenario.key ?? " " });
        if (!scenario.same && !scenario.key) {
          assert.equal(result.ok, false);
          assert.match(result.message, /填写.*API Key/);
          assert.equal(requests.length, 0, "authenticated provider must request a new key before sending");
        } else {
          assert.equal(result.ok, true);
          assert.deepEqual(requests, [{url: new URL(scenario.url).href.replace(/\/+$/, "") + "/embeddings",
            key: "Bearer " + (scenario.key ?? (source === "saved" ? "saved-key" : "env-key"))}]);
        }
      });
    }
  }
});

test("keyless embedding services can probe a new origin without saved or environment credentials", async (t) => {
  environment(t, { OLLAMA_API_KEY: "env-secret", OLLAMA_BASE_URL: "http://saved.local/v1" });
  for (const provider of ["ollama", "custom-probe"]) {
    let calls = 0;
    const result = await service({
      getProvider: async () => ({key: "saved-secret", baseURL: "http://saved.local/v1", isActive: true}),
      fetch: async (_url, init) => {
        calls++;
        assert.equal(init.headers.Authorization, undefined);
        return json({data: [{embedding: [1]}]});
      },
    }).testEmbedding({...embeddingInput, embeddingProvider: provider, embeddingBaseURL: "http://new.local/v1"});
    assert.equal(result.ok, true);
    assert.equal(calls, 1);
  }
});

test("Qdrant origin checks cover saved and environment credentials before either request", async (t) => {
  for (const source of ["saved", "environment", "environment-key-with-saved-url"]) {
    for (const scenario of originCases) {
      await t.test(`${source}: ${scenario.name}`, async (t) => {
        environment(t, { QDRANT_API_KEY: "env-key", QDRANT_URL: "https://embed.example/v1" });
        const requests = [];
        const expectedKey = scenario.key ?? (scenario.same ? source === "saved" ? "saved-key" : "env-key" : undefined);
        const probe = service({
          getQdrantConnection: async () => source === "environment" ? {} : {
            url: "https://embed.example/v1", apiKey: source === "saved" ? "saved-key" : undefined,
          },
          fetch: async (url, init) => {
            requests.push(url);
            assert.equal(init.headers?.["api-key"], expectedKey);
            return json({result: {collections: []}});
          },
        });
        const result = await probe.testQdrant({...qdrantInput, qdrantUrl: scenario.url, qdrantApiKey: scenario.key ?? " "});
        assert.equal(result.ok, true);
        const base = new URL(scenario.url).href.replace(/\/+$/, "");
        assert.deepEqual(requests, [base + "/readyz", base + "/collections"]);
      });
    }
  }
});

test("Qdrant requiring authentication at a new origin prompts for a key without forwarding old credentials", async (t) => {
  environment(t, {QDRANT_API_KEY: "env-secret", QDRANT_URL: "http://saved.local"});
  let requests = 0;
  const result = await service({
    getQdrantConnection: async () => ({url: "http://saved.local", apiKey: "saved-secret"}),
    fetch: async (_url, init) => {
      requests++;
      assert.equal(init.headers?.["api-key"], undefined);
      return new Response("upstream secret", {status: 401});
    },
  }).testQdrant({...qdrantInput, qdrantUrl: "http://new.local"});
  assert.equal(result.ok, false);
  assert.equal(result.httpStatus, 401);
  assert.match(result.message, /API Key/);
  assert.equal(requests, 1);
});

test("clearing Qdrant key overrides all saved, environment and draft keys on both origins", async (t) => {
  environment(t, {QDRANT_API_KEY: "env-secret", QDRANT_URL: "http://saved.local"});
  for (const url of ["http://saved.local", "http://new.local"]) {
    const result = await service({
      getQdrantConnection: async () => { assert.fail("clear key must not load saved credentials"); },
      fetch: async (_url, init) => {
        assert.equal(init.headers?.["api-key"], undefined);
        return json({result: {collections: []}});
      },
    }).testQdrant({...qdrantInput, qdrantUrl: url, qdrantApiKey: "draft-secret", clearQdrantApiKey: true});
    assert.equal(result.ok, true);
  }
});

test("embedding rejects empty, malformed and nonnumeric vectors", async () => {
  for (const body of [null, {}, { data: [] }, { data: [{ embedding: [] }] }, { data: [{ embedding: ["1"] }] }, { data: [{ embedding: [null] }] }, { data: [{ embedding: [1] }, { embedding: [2] }] }]) {
    const result = await service({ fetch: async () => json(body) }).testEmbedding(embeddingInput);
    assert.equal(result.ok, false, JSON.stringify(body));
    assert.equal(result.dimensions, undefined);
  }
  const malformed = await service({ fetch: async () => new Response("invalid json") }).testEmbedding(embeddingInput);
  assert.equal(malformed.ok, false);
});

test("HTTP errors and thrown exceptions never expose upstream secrets", async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    const result = await service({ fetch: async () => new Response("private-key-in-upstream-body", { status }) }).testEmbedding(embeddingInput);
    assert.equal(result.ok, false);
    assert.equal(result.httpStatus, status);
    assert.match(result.message, new RegExp(String(status)));
    assert.doesNotMatch(JSON.stringify(result), /private-key/);
  }
  const result = await service({ fetch: async () => { throw new Error("private-key-in-error"); } }).testEmbedding(embeddingInput);
  assert.equal(result.ok, false);
  assert.doesNotMatch(JSON.stringify(result), /private-key/);
});

test("probe timeout covers response body reading", async (t) => {
  const base = await listen(t, (_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.write('{"data":');
  });
  const result = await service({ fetch }).testEmbedding({ ...embeddingInput, embeddingBaseURL: base, embeddingTimeoutMs: 50 });
  assert.equal(result.ok, false);
  assert.match(result.message, /超时/);
});

test("Qdrant verifies readiness and authenticated reads without writing", async (t) => {
  const requests = [];
  const before = JSON.stringify(ragConfig);
  const base = await listen(t, (req, res) => {
    requests.push(req.url);
    assert.equal(req.method, "GET");
    assert.equal(req.headers["api-key"], "saved-qdrant-secret");
    res.end(req.url === "/prefix/readyz" ? "all shards ready" : JSON.stringify({ result: { collections: [] } }));
  });
  const result = await service({ fetch, getQdrantConnection: async () => ({ url: base, apiKey: "saved-qdrant-secret" }) }).testQdrant({ ...qdrantInput, qdrantUrl: base + "/prefix/" });
  assert.equal(result.ok, true);
  assert.match(result.message, /未测试写入权限/);
  assert.deepEqual(requests, ["/prefix/readyz", "/prefix/collections"]);
  assert.equal(JSON.stringify(ragConfig), before);
});

test("Qdrant draft key overrides saved key; clear key sends no credential", async () => {
  for (const clear of [false, true]) {
    const result = await service({
      getQdrantConnection: async () => { assert.fail("draft or clear must not read saved key"); },
      fetch: async (_url, init) => {
        assert.equal(init.headers?.["api-key"], clear ? undefined : "draft-secret");
        return json({ result: { collections: [] } });
      },
    }).testQdrant({ ...qdrantInput, qdrantApiKey: "draft-secret", clearQdrantApiKey: clear });
    assert.equal(result.ok, true);
  }
});

test("Qdrant readiness alone is insufficient: collections auth and format must pass", async () => {
  for (const response of [() => json({ error: "secret" }, 403), () => json({ result: {} })]) {
    const result = await service({ fetch: async (url) => url.endsWith("/readyz") ? new Response("ready") : response() }).testQdrant(qdrantInput);
    assert.equal(result.ok, false);
    assert.doesNotMatch(JSON.stringify(result), /secret/);
  }
});

test("HTTP endpoints enforce access, validate drafts and do not cache results", async (t) => {
  const originalToken = process.env.AI_NOVEL_ACCESS_TOKEN;
  process.env.AI_NOVEL_ACCESS_TOKEN = "probe-access-token";
  t.after(() => {
    if (originalToken === undefined) delete process.env.AI_NOVEL_ACCESS_TOKEN;
    else process.env.AI_NOVEL_ACCESS_TOKEN = originalToken;
  });
  let calls = 0;
  const probe = service({ fetch: async () => { calls++; return json({ data: [{ embedding: [1] }] }); } });
  const app = express();
  app.use(express.json(), authMiddleware);
  app.use("/api/rag/connection-tests", createRagConnectionTestRouter(probe));
  app.use(errorHandler);
  const base = await listen(t, app);
  const post = (route, input, authorized = true) => fetch(base + "/api/rag/connection-tests/" + route, {
    method: "POST", headers: { "Content-Type": "application/json", ...(authorized ? { Authorization: "Bearer probe-access-token" } : {}) }, body: JSON.stringify(input),
  });
  assert.equal((await post("embedding", embeddingInput, false)).status, 401);
  for (const invalid of ["not a url", "file:///tmp/probe", "https://user:password@host", "http://host?key=secret", "http://host#fragment"]) {
    assert.equal((await post("qdrant", { ...qdrantInput, qdrantUrl: invalid })).status, 400);
    assert.equal((await post("embedding", { ...embeddingInput, embeddingBaseURL: invalid })).status, 400);
  }
  assert.equal((await post("embedding", { ...embeddingInput, embeddingModel: " " })).status, 400);
  assert.equal((await post("embedding", { ...embeddingInput, embeddingTimeoutMs: 0 })).status, 400);
  assert.equal(calls, 0);
  const response = await post("embedding", embeddingInput);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).data.ok, true);
  assert.equal(calls, 1);
  const qdrantResponse = await post("qdrant", qdrantInput);
  assert.equal(qdrantResponse.status, 200);
  assert.equal((await qdrantResponse.json()).data.ok, false);
});
