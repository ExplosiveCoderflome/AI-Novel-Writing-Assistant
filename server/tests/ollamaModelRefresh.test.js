const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const express = require("express");
const settingsRouter = require("../dist/routes/settings.js").default;
const { errorHandler } = require("../dist/middleware/errorHandler.js");
const { secretStore } = require("../dist/services/settings/secretStore/index.js");

test("refreshing Ollama models explains a refused connection and preserves endpoint fallback", async (t) => {
  const baseURL = "http://127.0.0.1:11434";
  t.mock.method(secretStore, "getProvider", async () => ({ baseURL: baseURL + "/v1" }));
  const request = globalThis.fetch;
  const refused = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
  const endpoints = [];
  let compatibleEndpointAvailable = false;
  t.mock.method(globalThis, "fetch", async (url) => {
    endpoints.push(url);
    if (compatibleEndpointAvailable && url === baseURL + "/v1/models") {
      return Response.json({ data: [{ id: "llama3.2" }] });
    }
    throw new TypeError("fetch failed", { cause: refused });
  });

  const app = express();
  app.use("/api/settings", settingsRouter);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await once(server, "listening");
  const url = "http://127.0.0.1:" + server.address().port + "/api/settings/api-keys/ollama/refresh-models";

  const failed = await request(url, { method: "POST" });
  assert.equal(failed.status, 400);
  assert.match((await failed.json()).error, /Ollama.*服务是否已启动.*API 地址.*密钥可留空/);
  assert.deepEqual(endpoints.splice(0), [baseURL + "/api/tags", baseURL + "/v1/models"]);

  compatibleEndpointAvailable = true;
  const succeeded = await request(url, { method: "POST" });
  assert.equal(succeeded.status, 200);
  assert.deepEqual((await succeeded.json()).data.models, ["llama3.2"]);
  assert.deepEqual(endpoints, [baseURL + "/api/tags", baseURL + "/v1/models"]);
});
