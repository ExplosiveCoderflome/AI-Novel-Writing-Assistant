const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");
const {
  CreationStudioService,
  creationStudioService,
} = require("../dist/modules/novel/creation-studio/application/CreationStudioService.js");

const reference = {
  analysisId: "analysis-1",
  documentId: "document-1",
  sectionKeys: ["plot_structure", "style_technique"],
  goal: "借鉴结构、节奏与写法，创作新的完整短篇",
};

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

test("reference goal supplies the default creative idea while original creation still requires one", async () => {
  const service = new CreationStudioService();
  let bootstrapInput;
  let interpretationInput;
  service.workflowService.bootstrapTask = async (input) => {
    bootstrapInput = input;
    return { id: "task-1" };
  };
  service.runInterpretation = async (taskId, input) => {
    interpretationInput = input;
    return { taskId, idea: input.idea };
  };

  await service.interpret({ reference, preferredNarrativeForm: "short_story" });
  const expectedIdea = `创作目标：${reference.goal}`;
  assert.equal(interpretationInput.idea, expectedIdea);
  assert.equal(bootstrapInput.seedPayload.idea, expectedIdea);
  assert.equal(bootstrapInput.seedPayload.referenceSelection, reference);

  await assert.rejects(
    () => service.interpret({ idea: "   ", preferredNarrativeForm: "short_story" }),
    /请先写下你想创作的内容/,
  );
});

test("interpret route accepts an omitted idea only with a reference selection", async (t) => {
  const originalInterpret = creationStudioService.interpret;
  const received = [];
  creationStudioService.interpret = async (input) => {
    received.push(input);
    return {
      taskId: "task-1",
      status: "running",
      progress: 0.04,
      currentAction: "正在理解你的想法",
      idea: input.idea ?? "",
      interpretation: null,
      selectedDirectionId: null,
      novelId: null,
      productionTaskId: null,
      resumeRoute: "/create?taskId=task-1",
      error: null,
    };
  };
  t.after(() => { creationStudioService.interpret = originalInterpret; });

  const server = http.createServer(createApp());
  const port = await listen(server);
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

  const referenceResponse = await fetch(`http://127.0.0.1:${port}/api/creation-studio/interpret`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reference, preferredNarrativeForm: "short_story" }),
  });
  assert.equal(referenceResponse.status, 201);
  assert.equal(received.length, 1);
  assert.equal(received[0].idea, undefined);
  assert.deepEqual(received[0].reference, reference);

  const originalResponse = await fetch(`http://127.0.0.1:${port}/api/creation-studio/interpret`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idea: "", preferredNarrativeForm: "short_story" }),
  });
  assert.equal(originalResponse.status, 400);
  assert.equal(received.length, 1);
});
