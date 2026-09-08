const test = require("node:test");
const assert = require("node:assert/strict");

const {
  runDirectorVolumeStrategyPhase,
} = require("../dist/services/novel/director/phases/novelDirectorPipelinePhases.js");

function buildRequest() {
  return {
    title: "短篇测试",
    idea: "一部三幕结构的紧凑小说。",
    writingMode: "original",
    projectMode: "ai_led",
    estimatedChapterCount: 32,
    runMode: "auto_to_ready",
    candidate: {
      workingTitle: "短篇测试",
      targetChapterCount: 32,
    },
  };
}

test("auto-director strategy ignores the initialization placeholder volume", async () => {
  const generationCalls = [];
  const strategyWorkspace = {
    volumes: [],
    strategyPlan: { recommendedVolumeCount: 3, targetChapterCount: 32 },
  };
  const critiqueWorkspace = {
    ...strategyWorkspace,
    critiqueReport: { overallRisk: "low" },
  };
  const skeletonWorkspace = {
    ...critiqueWorkspace,
    volumes: [{ id: "volume-1" }, { id: "volume-2" }, { id: "volume-3" }],
  };

  const result = await runDirectorVolumeStrategyPhase({
    taskId: "task-1",
    novelId: "novel-1",
    request: buildRequest(),
    dependencies: {
      workflowService: {
        bootstrapTask: async () => null,
      },
      volumeService: {
        generateVolumes: async (_novelId, options) => {
          generationCalls.push(options);
          if (options.scope === "strategy") return strategyWorkspace;
          if (options.scope === "strategy_critique") return critiqueWorkspace;
          if (options.scope === "skeleton") return skeletonWorkspace;
          throw new Error(`unexpected scope: ${options.scope}`);
        },
        updateVolumes: async (_novelId, workspace) => workspace,
      },
    },
    callbacks: {
      buildDirectorSeedPayload: (_request, novelId, extra) => ({ novelId, ...extra }),
      markDirectorTaskRunning: async () => null,
    },
  });

  assert.equal(generationCalls[0].scope, "strategy");
  assert.equal(generationCalls[0].respectExistingVolumeCount, false);
  assert.equal(generationCalls[1].scope, "strategy_critique");
  assert.equal(generationCalls[2].scope, "skeleton");
  assert.equal(result.volumes.length, 3);
});
