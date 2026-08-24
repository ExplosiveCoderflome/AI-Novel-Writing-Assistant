const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildWorkflowSeedPayload } = require("../dist/services/novel/director/runtime/novelDirectorHelpers.js");
const { directorCandidateResponseSchema } = require("../dist/services/novel/director/runtime/novelDirectorSchemas.js");
const {
  DirectorProductionExperienceService,
  buildProductionExperienceSeed,
  parseSelectedExperience,
} = require("../dist/services/novel/director/commands/DirectorProductionExperienceService.js");
const { prisma } = require("../dist/db/prisma.js");

const confirmRuntimeSource = fs.readFileSync(
  path.resolve(__dirname, "../src/services/novel/director/runtime/novelDirectorConfirmRuntime.ts"),
  "utf8",
);
const outlinePhaseSource = fs.readFileSync(
  path.resolve(__dirname, "../src/services/novel/director/phases/novelDirectorStructuredOutlinePhase.ts"),
  "utf8",
);

function candidate(title) {
  return {
    workingTitle: title,
    titleOptions: [],
    logline: "主角必须解决一个足以推动长篇故事的危机。",
    positioning: "清晰的长篇类型定位",
    sellingPoint: "稳定兑现读者期待",
    coreConflict: "主角与长期阻力持续对抗",
    protagonistPath: "从被动求生走向主动承担",
    endingDirection: "完成核心承诺",
    hookStrategy: "用迫近危险和连续兑现推动追读",
    progressionLoop: "发现问题、作出选择、承担后果并升级目标",
    whyItFits: "承接用户的一句话灵感",
    recommendedWritingPlatform: "fanqie_free",
    writingPlatformReason: "适合高冲突、快推进的移动端长篇阅读。",
    toneKeywords: ["紧张", "成长"],
    targetChapterCount: 120,
  };
}

function directorSeed() {
  const directorInput = {
    idea: "一座城市只剩七天。",
    candidate: candidate("七日之城"),
    runMode: "auto_to_ready",
  };
  return {
    ...buildWorkflowSeedPayload(directorInput),
    directorInput,
  };
}

test("legacy explicit auto_to_ready seed remains compatible", () => {
  const seed = buildWorkflowSeedPayload({
    idea: "一座城市只剩七天。",
    runMode: "auto_to_ready",
  });
  assert.equal(seed.runMode, "auto_to_ready");
  assert.equal(seed.productionExperience, undefined);
});

test("fast-start director waits for the user to choose a production interface", () => {
  assert.doesNotMatch(confirmRuntimeSource, /productionExperience:\s*"simple"/);
  assert.doesNotMatch(confirmRuntimeSource, /creationExperience:\s*"simple"/);
  assert.match(outlinePhaseSource, /checkpointType:\s*"production_experience_required"/);
  assert.doesNotMatch(outlinePhaseSource, /continueSimpleProduction/);
});

test("production interface selection keeps the same full-book automation", () => {
  const seed = directorSeed();
  for (const experience of ["simple", "professional"]) {
    const nextSeed = buildProductionExperienceSeed(seed, experience);
    assert.equal(parseSelectedExperience(nextSeed), experience);
    assert.equal(nextSeed.runMode, "full_book_autopilot");
    assert.equal(nextSeed.directorInput.runMode, "full_book_autopilot");
    assert.equal(nextSeed.autoExecutionPlan.mode, "book");
    assert.equal(nextSeed.autoExecutionPlan.autoReview, true);
    assert.equal(nextSeed.autoExecutionPlan.autoRepair, true);
    assert.equal(nextSeed.autoApproval.enabled, true);
    assert.ok(nextSeed.autoApproval.approvalPointCodes.includes("chapter_execution_continue"));
    assert.ok(nextSeed.autoApproval.approvalPointCodes.includes("replan_continue"));
  }
});

test("complete-workspace selection starts the same chapter execution", async () => {
  const originals = {
    findUnique: prisma.novelWorkflowTask.findUnique,
    transaction: prisma.$transaction,
  };
  let checkpointUpdate = null;
  let commandInput = null;
  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "director-task-1",
    lane: "auto_director",
    novelId: "novel-1",
    status: "waiting_approval",
    checkpointType: "production_experience_required",
    seedPayloadJson: JSON.stringify(directorSeed()),
  });
  prisma.$transaction = async (operation) => operation({
    novelWorkflowTask: {
      updateMany: async (input) => {
        checkpointUpdate = input;
        return { count: 1 };
      },
    },
    novel: { update: async () => ({}) },
  });

  try {
    const service = new DirectorProductionExperienceService({
      enqueueContinueCommand: async (_taskId, input) => {
        commandInput = input;
        return { commandId: "command-1" };
      },
    });
    const result = await service.select("director-task-1", "professional");
    assert.equal(result.targetRoute, "/novels/novel-1/edit");
    assert.equal(result.backgroundStarted, true);
    assert.equal(checkpointUpdate.data.checkpointType, "chapter_batch_ready");
    assert.equal(JSON.parse(checkpointUpdate.data.seedPayloadJson).runMode, "full_book_autopilot");
    assert.deepEqual(commandInput, { continuationMode: "auto_execute_range", forceResume: true });
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    prisma.$transaction = originals.transaction;
  }
});

test("production interface selection waits until preparation is complete", async () => {
  const originals = {
    findUnique: prisma.novelWorkflowTask.findUnique,
    taskUpdate: prisma.novelWorkflowTask.update,
    novelUpdate: prisma.novel.update,
    transaction: prisma.$transaction,
  };
  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "director-task-1",
    lane: "auto_director",
    novelId: "novel-1",
    status: "running",
    checkpointType: null,
    seedPayloadJson: JSON.stringify(directorSeed()),
  });
  try {
    await assert.rejects(
      new DirectorProductionExperienceService().select("director-task-1", "simple"),
      /还没有完成正文生产前的准备/,
    );
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    prisma.novelWorkflowTask.update = originals.taskUpdate;
    prisma.novel.update = originals.novelUpdate;
    prisma.$transaction = originals.transaction;
  }
});

test("director candidate contract requires exactly two directions", () => {
  assert.equal(directorCandidateResponseSchema.safeParse({
    candidates: [candidate("方向一"), candidate("方向二")],
  }).success, true);
  assert.equal(directorCandidateResponseSchema.safeParse({
    candidates: [candidate("只有一个方向")],
  }).success, false);
});
