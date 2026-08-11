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

test("auto director risk policy settings route returns defaults, persists updates, and validates ordering", async () => {
  const originals = {
    findMany: prisma.appSetting.findMany,
    upsert: prisma.appSetting.upsert,
    transaction: prisma.$transaction,
  };
  const values = new Map();
  prisma.appSetting.findMany = async ({ where }) => where.key.in
    .filter((key) => values.has(key))
    .map((key) => ({ key, value: values.get(key) }));
  prisma.appSetting.upsert = async ({ where, update }) => {
    values.set(where.key, update.value);
    return { key: where.key, value: update.value };
  };
  prisma.$transaction = async (operations) => Promise.all(operations);

  const server = http.createServer(createApp());
  const port = await listen(server);
  try {
    const getResponse = await fetch(`http://127.0.0.1:${port}/api/settings/auto-director/risk-policy`);
    assert.equal(getResponse.status, 200);
    assert.deepEqual((await getResponse.json()).data, { noticeThreshold: 5, pauseThreshold: 8 });

    const putResponse = await fetch(`http://127.0.0.1:${port}/api/settings/auto-director/risk-policy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noticeThreshold: 6, pauseThreshold: 7 }),
    });
    assert.equal(putResponse.status, 200);
    assert.deepEqual((await putResponse.json()).data, { noticeThreshold: 6, pauseThreshold: 7 });

    const invalidResponse = await fetch(`http://127.0.0.1:${port}/api/settings/auto-director/risk-policy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noticeThreshold: 8, pauseThreshold: 8 }),
    });
    assert.equal(invalidResponse.status, 400);
  } finally {
    prisma.appSetting.findMany = originals.findMany;
    prisma.appSetting.upsert = originals.upsert;
    prisma.$transaction = originals.transaction;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
