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

test("auto director channel settings routes expose saved config and allow clearing overrides", async () => {
  const originals = {
    findMany: prisma.appSetting.findMany,
    upsert: prisma.appSetting.upsert,
  };
  const upsertCalls = [];

  prisma.appSetting.findMany = async () => ([
    {
      key: "autoDirector.baseUrl",
      value: "https://writer.example.test",
    },
    {
      key: "autoDirector.channels.dingtalk.webhookUrl",
      value: "https://relay.example.test/dingtalk",
    },
    {
      key: "autoDirector.channels.dingtalk.callbackToken",
      value: "ding-callback-token",
    },
    {
      key: "autoDirector.channels.dingtalk.operatorMapJson",
      value: "{\"ding_user_1\":\"user_1\"}",
    },
    {
      key: "autoDirector.channels.wecom.webhookUrl",
      value: "https://relay.example.test/wecom",
    },
  ]);
  prisma.appSetting.upsert = async ({ where, create, update }) => {
    upsertCalls.push({ where, create, update });
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
    const getResponse = await fetch(`http://127.0.0.1:${port}/api/settings/auto-director/channels`);
    assert.equal(getResponse.status, 200);
    const getPayload = await getResponse.json();
    assert.equal(getPayload.success, true);
    assert.equal(getPayload.data.baseUrl, "https://writer.example.test");
    assert.equal(getPayload.data.dingtalk.webhookUrl, "https://relay.example.test/dingtalk");
    assert.equal(getPayload.data.dingtalk.callbackToken, "ding-callback-token");
    assert.equal(getPayload.data.dingtalk.operatorMapJson, "{\"ding_user_1\":\"user_1\"}");
    assert.equal(getPayload.data.wecom.webhookUrl, "https://relay.example.test/wecom");

    const putResponse = await fetch(`http://127.0.0.1:${port}/api/settings/auto-director/channels`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        baseUrl: "",
        dingtalk: {
          webhookUrl: "",
          callbackToken: "",
          operatorMapJson: "",
          eventTypes: ["auto_director.exception"],
        },
        wecom: {
          webhookUrl: "",
          callbackToken: "",
          operatorMapJson: "",
        },
      }),
    });
    assert.equal(putResponse.status, 200);
    const putPayload = await putResponse.json();
    assert.equal(putPayload.success, true);
    assert.equal(putPayload.data.baseUrl, "");
    assert.equal(putPayload.data.dingtalk.webhookUrl, "");
    assert.equal(putPayload.data.dingtalk.callbackToken, "");
    assert.equal(putPayload.data.dingtalk.operatorMapJson, "");
    assert.deepEqual(putPayload.data.dingtalk.eventTypes, ["auto_director.exception"]);
    assert.equal(putPayload.data.wecom.webhookUrl, "");
    assert.equal(putPayload.data.wecom.callbackToken, "");
    assert.equal(putPayload.data.wecom.operatorMapJson, "");
    assert.deepEqual(
      putPayload.data.wecom.eventTypes,
      [
        "auto_director.approval_required",
        "auto_director.auto_approved",
        "auto_director.exception",
        "auto_director.recovered",
        "auto_director.completed",
      ],
    );

    assert.deepEqual(
      upsertCalls.map((item) => ({
        key: item.where.key,
        value: item.update.value,
      })),
      [
        { key: "autoDirector.baseUrl", value: "" },
        { key: "autoDirector.channels.dingtalk.webhookUrl", value: "" },
        { key: "autoDirector.channels.dingtalk.callbackToken", value: "" },
        { key: "autoDirector.channels.dingtalk.operatorMapJson", value: "" },
        { key: "autoDirector.channels.dingtalk.eventTypes", value: "auto_director.exception" },
        { key: "autoDirector.channels.wecom.webhookUrl", value: "" },
        { key: "autoDirector.channels.wecom.callbackToken", value: "" },
        { key: "autoDirector.channels.wecom.operatorMapJson", value: "" },
        {
          key: "autoDirector.channels.wecom.eventTypes",
          value: "auto_director.approval_required,auto_director.auto_approved,auto_director.exception,auto_director.recovered,auto_director.completed",
        },
      ],
    );
  } finally {
    prisma.appSetting.findMany = originals.findMany;
    prisma.appSetting.upsert = originals.upsert;
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
