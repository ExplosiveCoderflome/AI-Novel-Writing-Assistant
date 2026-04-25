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

test("auto director approval preferences expose defaults and persist concrete approval points", async () => {
  const originals = {
    findMany: prisma.appSetting.findMany,
    upsert: prisma.appSetting.upsert,
  };
  const upsertCalls = [];
  let savedValue = "";

  prisma.appSetting.findMany = async ({ where }) => {
    const keys = where?.key?.in ?? [];
    if (keys.includes("autoDirector.approvalPreference.approvalPointCodes") && savedValue) {
      return [{
        key: "autoDirector.approvalPreference.approvalPointCodes",
        value: savedValue,
      }];
    }
    return [];
  };
  prisma.appSetting.upsert = async ({ where, create, update }) => {
    upsertCalls.push({ where, create, update });
    savedValue = update.value;
    return {
      id: `${create.key}-setting`,
      key: create.key,
      value: create.value,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  };

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const getResponse = await fetch(`http://127.0.0.1:${port}/api/settings/auto-director/approval-preferences`);
    assert.equal(getResponse.status, 200);
    const getPayload = await getResponse.json();
    assert.equal(getPayload.success, true);
    assert.deepEqual(
      getPayload.data.approvalPointCodes,
      [
        "candidate_direction_confirmed",
        "character_setup_ready",
        "volume_strategy_ready",
        "structured_outline_ready",
      ],
    );
    assert.ok(getPayload.data.groups.length >= 2);
    assert.ok(getPayload.data.approvalPoints.some((item) => item.code === "chapter_execution_continue"));

    const putResponse = await fetch(`http://127.0.0.1:${port}/api/settings/auto-director/approval-preferences`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        approvalPointCodes: [
          "chapter_execution_continue",
          "chapter_execution_continue",
          "rewrite_cleanup_confirmed",
        ],
      }),
    });
    assert.equal(putResponse.status, 200);
    const putPayload = await putResponse.json();
    assert.equal(putPayload.success, true);
    assert.deepEqual(putPayload.data.approvalPointCodes, [
      "chapter_execution_continue",
      "rewrite_cleanup_confirmed",
    ]);
    assert.deepEqual(upsertCalls.map((item) => ({
      key: item.where.key,
      value: item.update.value,
    })), [{
      key: "autoDirector.approvalPreference.approvalPointCodes",
      value: "chapter_execution_continue,rewrite_cleanup_confirmed",
    }]);

    const invalidResponse = await fetch(`http://127.0.0.1:${port}/api/settings/auto-director/approval-preferences`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        approvalPointCodes: ["not_a_real_point"],
      }),
    });
    assert.equal(invalidResponse.status, 400);
  } finally {
    prisma.appSetting.findMany = originals.findMany;
    prisma.appSetting.upsert = originals.upsert;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
