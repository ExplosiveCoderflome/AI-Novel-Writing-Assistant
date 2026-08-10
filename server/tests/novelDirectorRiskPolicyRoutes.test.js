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

test("novel director risk policy route saves a complete override or clears it to inherit global settings", async () => {
  const originals = {
    findUnique: prisma.novel.findUnique,
    updateMany: prisma.novel.updateMany,
  };
  const novel = {
    id: "novel-director-risk-policy-test",
    directorIssuePolicyOverridesJson: null,
  };
  prisma.novel.findUnique = async () => ({ ...novel });
  prisma.novel.updateMany = async ({ data }) => {
    novel.directorIssuePolicyOverridesJson = data.directorIssuePolicyOverridesJson;
    return { count: 1 };
  };

  const server = http.createServer(createApp());
  const port = await listen(server);
  const url = `http://127.0.0.1:${port}/api/novels/${novel.id}/auto-director/risk-policy`;
  try {
    const getResponse = await fetch(url);
    assert.equal(getResponse.status, 200);
    assert.equal((await getResponse.json()).data.override, null);

    const putResponse = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ override: { noticeThreshold: 6, pauseThreshold: 7 } }),
    });
    assert.equal(putResponse.status, 200);
    assert.deepEqual((await putResponse.json()).data.override, { noticeThreshold: 6, pauseThreshold: 7 });

    const clearResponse = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ override: null }),
    });
    assert.equal(clearResponse.status, 200);
    assert.equal((await clearResponse.json()).data.override, null);

    const invalidResponse = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ override: { noticeThreshold: 8, pauseThreshold: 8 } }),
    });
    assert.equal(invalidResponse.status, 400);
  } finally {
    prisma.novel.findUnique = originals.findUnique;
    prisma.novel.updateMany = originals.updateMany;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
