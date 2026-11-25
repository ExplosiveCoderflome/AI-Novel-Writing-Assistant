const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

// Route tests must not initialize a database adapter or depend on a generated
// SQLite/PostgreSQL client. Services may retain delegates on import; executing
// any unexpected query fails immediately.
const databaseModule = require.resolve("../dist/db/prisma");
require.cache[databaseModule] = {
  id: databaseModule, filename: databaseModule, loaded: true,
  exports: {prisma: new Proxy({}, {get(_target, model) {
    return new Proxy({}, {get(_delegate, operation) {
      return () => { throw new Error(`Unexpected database query in opening route test: ${String(model)}.${String(operation)}`); };
    }});
  }})},
};
const { DirectorCommandService } = require("../dist/services/novel/director/commands/DirectorCommandService");
const { buildWorkflowSeedPayload } = require("../dist/services/novel/director/runtime/novelDirectorHelpers");
const { errorHandler } = require("../dist/middleware/errorHandler");
const router = require("../dist/services/novel/director/http/novelDirector").default;
const { createConfirmRequest } = require("./director/commands/fixtures/DirectorCommandFixture");

test("candidate command routes accept restored AI-recommended null counts and retain numeric validation", async (t) => {
  const methods = {
    refine_candidates: "enqueueRefineCandidatesCommand",
    patch_candidate: "enqueuePatchCandidateCommand",
    refine_titles: "enqueueRefineTitlesCommand",
    confirm_candidate: "enqueueConfirmCandidateCommand",
  };
  const calls = [];
  for (const [commandType, method] of Object.entries(methods)) {
    const original = DirectorCommandService.prototype[method];
    assert.equal(typeof original, "function", method);
    t.after(() => { DirectorCommandService.prototype[method] = original; });
    DirectorCommandService.prototype[method] = async (input) => {
      calls.push({ commandType, input });
      return { commandId: "mock-command", taskId: "saved-task", commandType, status: "queued" };
    };
  }
  const app = express();
  app.use(express.json(), router, errorHandler);
  const server = await new Promise(resolve => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const candidate = createConfirmRequest().candidate;
  const batch = {id: "batch-1", round: 1, roundLabel: "首轮", idea: "原想法", candidates: [candidate], createdAt: new Date().toISOString()};
  const qualityPolicy = require("@ai-novel/shared/types/directorIssue").DIRECTOR_ISSUE_POLICY_PRESETS.find(p => p.id === "quality_first").policy;
  const payload = {issueGovernanceVersion: 1, issuePolicy: qualityPolicy, issuePolicySource: "novel", idea: "原想法", previousBatches: [batch], batchId: batch.id, candidateId: candidate.id, candidate, feedback: "增加探索", directorVersion: "v2"};
  const post = (commandType, value) => fetch(`http://127.0.0.1:${server.address().port}/tasks/saved-task/commands`, {
    method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({commandType, payload: {...payload, estimatedChapterCount: value}}),
  });
  for (const commandType of Object.keys(methods)) {
    for (const value of [null, undefined, 260]) {
      const response = await post(commandType, value);
      assert.equal(response.status, 202, await response.text());
      const call = calls.at(-1);
      assert.equal(call.input.estimatedChapterCount, value ?? undefined);
      assert.equal(call.input.workflowTaskId, "saved-task");
      assert.equal(call.commandType, commandType);
      if (commandType === "confirm_candidate") {
        assert.deepEqual(call.input.issuePolicy, qualityPolicy);
        assert.equal(call.input.issueGovernanceVersion, 1);
        assert.equal(call.input.issuePolicySource, "novel");
      }
    }
    const accepted = calls.length;
    for (const value of [0, -1, 1.5, 2001, "260", ""]) {
      assert.equal((await post(commandType, value)).status, 400);
    }
    assert.equal(calls.length, accepted);
  }
});

test("opening seeds persist the difference between AI recommendation and an explicit count", () => {
  for (const value of [undefined, 30, 260]) {
    const seed = JSON.parse(JSON.stringify(buildWorkflowSeedPayload({idea: "简单想法", estimatedChapterCount: value})));
    assert.equal(seed.basicForm.estimatedChapterCount, value ?? null);
    assert.equal(seed.basicForm.estimatedChapterCountSource, value == null ? "default" : "user");
  }
});
