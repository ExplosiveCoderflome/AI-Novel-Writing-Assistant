const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");
const { NovelService } = require("../dist/services/novel/NovelService.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

function createWorkspace(novelId) {
  return {
    novelId,
    workspaceVersion: "v2",
    volumes: [],
    strategyPlan: null,
    critiqueReport: null,
    beatSheets: [],
    rebalanceDecisions: [],
    readiness: {
      canGenerateStrategy: true,
      canGenerateSkeleton: false,
      canGenerateBeatSheet: false,
      canGenerateChapterList: false,
      blockingReasons: ["请先生成卷战略建议。"],
    },
    derivedOutline: "",
    derivedStructuredOutline: "",
    source: "empty",
    activeVersionId: null,
  };
}

test("volume workspace routes expose v2 fields and accept new scopes plus legacy aliases", async () => {
  const originalMethods = {
    getVolumes: NovelService.prototype.getVolumes,
    generateVolumes: NovelService.prototype.generateVolumes,
    updateVolumes: NovelService.prototype.updateVolumes,
  };
  const novelId = "novel-volume-route-test";
  NovelService.prototype.getVolumes = async () => createWorkspace(novelId);
  NovelService.prototype.generateVolumes = async () => createWorkspace(novelId);
  NovelService.prototype.updateVolumes = async () => createWorkspace(novelId);

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const getResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/volumes`);
    assert.equal(getResponse.status, 200);
    const getPayload = await getResponse.json();
    assert.equal(getPayload.data.workspaceVersion, "v2");
    assert.ok(Array.isArray(getPayload.data.beatSheets));
    assert.ok(Array.isArray(getPayload.data.rebalanceDecisions));

    const strategyResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/volumes/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scope: "strategy" }),
    });
    assert.equal(strategyResponse.status, 200);

    const strategyWithEmptyWorkspaceResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/volumes/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scope: "strategy",
        draftWorkspace: createWorkspace(novelId),
      }),
    });
    assert.equal(strategyWithEmptyWorkspaceResponse.status, 200);

    const updateEmptyWorkspaceResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/volumes`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createWorkspace(novelId)),
    });
    assert.equal(updateEmptyWorkspaceResponse.status, 200);

    const aliasResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/volumes/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scope: "book" }),
    });
    assert.equal(aliasResponse.status, 200);

    const missingTargetResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/volumes/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scope: "chapter_list" }),
    });
    assert.equal(missingTargetResponse.status, 400);
  } finally {
    Object.assign(NovelService.prototype, originalMethods);
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
