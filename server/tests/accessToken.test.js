const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { authMiddleware, establishAccessSession } = require("../dist/middleware/auth");

function environment(t, values) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) value === undefined ? delete process.env[key] : process.env[key] = value;
  t.after(() => { for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value; });
}
function authorize({ ip = "127.0.0.1", host = "localhost", headers = {}, url = "/api/novels", method = "GET" } = {}) {
  let status, passed = false;
  const req = { socket: { remoteAddress: ip }, hostname: host, headers, get: key => headers[key], originalUrl: url, method };
  const res = { status(value) { status = value; return this; }, json() {} };
  authMiddleware(req, res, () => { passed = true; });
  return { passed, status };
}
async function listen(t, app) {
  const server = await new Promise(resolve => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("unset tokens keep access open so protection stays opt-in", t => {
  environment(t, { NODE_ENV: "production", AI_NOVEL_ACCESS_TOKEN: undefined });
  assert.equal(authorize().passed, true);
  assert.equal(authorize({ ip: "192.168.1.8", host: "192.168.1.2" }).passed, true);
  assert.equal(authorize({ headers: { origin: "https://writing.example" } }).passed, true);
  environment(t, { AI_NOVEL_ACCESS_TOKEN: "   " });
  assert.equal(authorize({ ip: "192.168.1.8" }).passed, true);
});

test("configured tokens protect local and remote requests, reject query credentials and preserve signed callback routes", t => {
  environment(t, { NODE_ENV: "production", AI_NOVEL_ACCESS_TOKEN: "test-secret" });
  assert.equal(authorize().status, 401);
  assert.equal(authorize({ headers: { authorization: "Bearer wrong" } }).status, 401);
  assert.equal(authorize({ url: "/api/novels?token=test-secret" }).status, 401);
  assert.equal(authorize({ headers: { authorization: "Bearer test-secret" }, ip: "192.168.1.8" }).passed, true);
  assert.equal(authorize({ headers: { cookie: "ai_novel_access=test-secret" } }).passed, true);
  assert.equal(authorize({ headers: { cookie: "ai_novel_access=%zz" } }).status, 401);
  for (const channel of ["dingtalk", "wecom"]) {
    assert.equal(authorize({ url: `/api/auto-director/channel-callbacks/${channel}`, method: "POST" }).passed, true);
    assert.equal(authorize({ url: `/api/auto-director/channel-callbacks/${channel}/execute?signature=fixture` }).passed, true);
  }
  assert.equal(authorize({ url: "/api/auto-director/channel-callbacks/wecom/other" }).status, 401);
  assert.equal(authorize({ url: "/api/health" }).passed, true);
});

test("browser session cookie authorizes ordinary and streaming requests without URL tokens", async t => {
  environment(t, { NODE_ENV: "production", AI_NOVEL_ACCESS_TOKEN: "test-secret" });
  const app = express();
  app.use("/api", authMiddleware);
  app.post("/api/access/session", establishAccessSession);
  app.get("/api/stream", (_req, res) => res.type("text/event-stream").send("data: ready\n\n"));
  const base = await listen(t, app);
  const denied = await fetch(`${base}/api/access/session`, { method: "POST" });
  assert.equal(denied.status, 401);
  const session = await fetch(`${base}/api/access/session`, { method: "POST", headers: { Authorization: "Bearer test-secret" } });
  assert.equal(session.status, 200);
  const cookie = session.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\/api/);
  const response = await fetch(`${base}/api/stream`, { headers: { Cookie: cookie.split(";")[0] } });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /data: ready/);
});

test("application entry protects routes even when a router has no auth middleware", async t => {
  environment(t, { NODE_ENV: "production", AI_NOVEL_ACCESS_TOKEN: "test-secret", AI_NOVEL_DATABASE_MODE: "sqlite", DATABASE_URL: "file:./.tmp/access-token-unused.db" });
  const { createApp } = require("../dist/app");
  const base = await listen(t, createApp());
  for (const path of ["/api/novels", "/api/director-next/unknown", "/api/settings/api-keys", "/api/access/session"]) {
    assert.equal((await fetch(base + path)).status, 401, path);
  }
  assert.equal((await fetch(base + "/api/health")).status, 200);
});

test("callbacks still reject invalid channel credentials using their own validator", async t => {
  environment(t, { NODE_ENV: "production", AI_NOVEL_ACCESS_TOKEN: "test-secret", AI_NOVEL_DATABASE_MODE: "sqlite", DATABASE_URL: "file:./.tmp/access-token-unused.db" });
  const settings = require("../dist/services/settings/AutoDirectorChannelSettingsService");
  const original = settings.getAutoDirectorChannelSettings;
  settings.getAutoDirectorChannelSettings = async () => ({ dingtalk: { callbackToken: "channel-only" }, wecom: { callbackToken: "channel-only" } });
  t.after(() => { settings.getAutoDirectorChannelSettings = original; });
  const router = require("../dist/routes/autoDirectorChannelCallbacks").default;
  const app = express();
  app.use(express.json());
  app.use("/api", authMiddleware);
  app.use("/api/auto-director/channel-callbacks", router);
  app.use((error, _req, res, _next) => res.status(error.statusCode ?? 500).json({ message: error.message }));
  const base = await listen(t, app);
  const response = await fetch(base + "/api/auto-director/channel-callbacks/dingtalk", { method: "POST",
    headers: { "Content-Type": "application/json", "x-auto-director-dingtalk-token": "invalid" },
    body: JSON.stringify({ userId: "fixture", callbackId: "fixture", eventId: "fixture", taskId: "fixture", actionCode: "continue_auto_execution" }) });
  assert.equal(response.status, 403);
  assert.match((await response.json()).message, /callback token/);
});
