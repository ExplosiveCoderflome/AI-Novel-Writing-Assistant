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

function put(port, path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({ host: "127.0.0.1", port, path, method: "PUT",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      });
    req.on("error", reject);
    req.end(payload);
  });
}

// Regression: updating a novel that does not exist returned 500 while reading
// the same id correctly returned 404.
test("PUT /api/novels/:id returns 404 for a missing novel", async (t) => {
  const original = prisma.novel.findUnique;
  prisma.novel.findUnique = async () => null;
  t.after(() => { prisma.novel.findUnique = original; });

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const response = await put(port, "/api/novels/novel-does-not-exist", { title: "x" });
    assert.equal(response.status, 404);
    assert.equal(response.body.success, false);
    assert.match(response.body.error, /小说不存在/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
