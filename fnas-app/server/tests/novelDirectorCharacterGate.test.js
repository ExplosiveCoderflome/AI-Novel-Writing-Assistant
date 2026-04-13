const test = require("node:test");
const assert = require("node:assert/strict");

const {
  runDirectorCharacterSetupPhase,
} = require("../dist/services/novel/director/novelDirectorPipelinePhases.js");

function buildRequest(runMode = "auto_to_ready") {
  return {
    title: "大秦迷局",
    idea: "打工人刘雪婷穿越到秦朝成为太监，最后发现自己竟然就是赵高。",
    writingMode: "original",
    projectMode: "ai_led",
    narrativePov: "third_person",
    pacePreference: "balanced",
    emotionIntensity: "medium",
    aiFreedom: "medium",
    estimatedChapterCount: 120,
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.5,
    runMode,
    candidate: {
      id: "candidate_1",
      workingTitle: "大秦迷局",
      logline: "现代打工人穿进秦宫成为太监，最终发现自己就是赵高。",
      positioning: "历史穿越宫廷权谋。",
      sellingPoint: "身份反差和终局自我揭穿。",
      coreConflict: "她想活命，却被一步步推向赵高命运。",
      protagonistPath: "从求生到主动卷入权力中枢。",
      endingDirection: "身份真相揭晓并改写命运。",
      hookStrategy: "用秦宫危机和身份谜团持续抬压。",
      progressionLoop: "求生 - 卷入 - 发现 - 反压。",
      whyItFits: "题材和反转锚点明确。",
      toneKeywords: ["历史", "权谋", "身份反转"],
      targetChapterCount: 120,
    },
  };
}

test("director character phase pauses at review checkpoint when cast quality gate fails", async () => {
  const workflowCalls = [];
  let applyCalls = 0;

  const invalidCastOptions = [
    {
      id: "cast_bad",
      title: "功能位方案",
      summary: "抽象阵容。",
      whyItWorks: "无",
      recommendedReason: "无",
      status: "draft",
      sourceStoryInput: null,
      members: [
        {
          id: "m1",
          optionId: "cast_bad",
          sortOrder: 0,
          name: "谜团催化剂",
          role: "主角",
          gender: "unknown",
          castRole: "protagonist",
          relationToProtagonist: "主角本人",
          storyFunction: "推动谜团",
          shortDescription: "",
          outerGoal: "",
          innerNeed: "",
          fear: "",
          wound: "",
          misbelief: "",
          secret: "",
          moralLine: "",
          firstImpression: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      relations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const paused = await runDirectorCharacterSetupPhase({
    taskId: "task_1",
    novelId: "novel_1",
    request: buildRequest(),
    dependencies: {
      workflowService: {
        bootstrapTask: async (payload) => workflowCalls.push({ type: "bootstrap", payload }),
        recordCheckpoint: async (taskId, payload) => workflowCalls.push({ type: "checkpoint", taskId, payload }),
      },
      novelContextService: {},
      volumeService: {},
      characterPreparationService: {
        generateCharacterCastOptions: async () => invalidCastOptions,
        assessCharacterCastOptions: () => ({
          options: [
            {
              optionIndex: 0,
              optionId: "cast_bad",
              title: "功能位方案",
              autoApplicable: false,
              issues: [
                {
                  code: "abstract_name",
                  optionIndex: 0,
                  optionTitle: "功能位方案",
                  message: "角色名“谜团催化剂”仍像功能位或抽象槽位，不能直接入库。",
                },
              ],
            },
          ],
          autoApplicableOptionIndex: null,
          autoApplicableOptionId: null,
          blockingReasons: ["功能位方案: 角色名“谜团催化剂”仍像功能位或抽象槽位，不能直接入库。"],
        }),
        applyCharacterCastOption: async () => {
          applyCalls += 1;
        },
      },
    },
    callbacks: {
      buildDirectorSeedPayload: (_request, novelId, extra) => ({ novelId, ...extra }),
      markDirectorTaskRunning: async (taskId, stage, itemKey, itemLabel) => {
        workflowCalls.push({ type: "running", taskId, stage, itemKey, itemLabel });
      },
    },
  });

  assert.equal(paused, true);
  assert.equal(applyCalls, 0);
  const checkpointCall = workflowCalls.find((call) => call.type === "checkpoint");
  assert.ok(checkpointCall);
  assert.equal(checkpointCall.payload.checkpointType, "character_setup_required");
  assert.match(checkpointCall.payload.checkpointSummary, /不能直接自动应用/);
});
