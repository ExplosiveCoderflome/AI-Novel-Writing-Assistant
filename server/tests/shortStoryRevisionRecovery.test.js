const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const { initializeTemporarySqliteDatabase } = require("./testInfrastructure/tempSqliteDatabase.cjs");

const moduleRoot = path.resolve(__dirname, "../src/modules/novel/short-story");
let prisma;
let tempDir;
const direction = { id: "d1", title: "样例", premise: "调查真相", coreExperience: "揭露秘密",
  protagonist: "小林", centralConflict: "证据被隐瞒", endingPromise: "揭开真相", styleKeywords: ["直接"] };
const plan = { title: "样例", targetWordCount: 3000, endingPromise: "揭开真相",
  segments: [1, 2, 3].map((order) => ({ order, targetWordCount: 1000, purpose: "推进" + order })),
  causalContract: { fixedFacts: ["主角持有原始证据"] } };
let sequence = 0;

test.before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "short-story-recovery-"));
  const url = initializeTemporarySqliteDatabase(tempDir, "fixture.db");
  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
});
test.after(async () => {
  await prisma?.$disconnect();
  if (tempDir) {
    assert.equal(path.dirname(tempDir), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(tempDir).startsWith("short-story-recovery-"));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

async function fixture(overrides = {}, planned = true) {
  const id = "fixture-" + ++sequence;
  const novel = await prisma.novel.create({ data: { title: id, narrativeForm: "short_story", targetWordCount: 3000 } });
  const task = await prisma.novelWorkflowTask.create({ data: { novelId: novel.id, lane: "creation_studio",
    title: id, status: "succeeded", checkpointType: "workflow_completed", ...overrides } });
  const intent = await prisma.novelIntentVersion.create({ data: { novelId: novel.id, workflowTaskId: task.id,
    version: 1, status: "active", source: "initial", originalExpression: "原始想法",
    structuredIntentJson: JSON.stringify({ understanding: "揭开真相", recommendedTargetWordCount: 3000,
      directions: [direction, { ...direction, id: "d2" }] }),
    impactScopeJson: JSON.stringify({ selectedDirectionId: "d1" }) } });
  const saved = planned ? await prisma.shortStoryPlan.create({ data: { novelId: novel.id, intentVersionId: intent.id,
    status: "completed", targetWordCount: 3000, endingPromise: plan.endingPromise, structureJson: JSON.stringify(plan),
    segments: { create: plan.segments.map((segment) => ({ novelId: novel.id, order: segment.order,
      targetWordCount: segment.targetWordCount, status: "completed", content: "原文" + segment.order })) } },
    include: { segments: { orderBy: { order: "asc" } } } }) : null;
  return { novel, task, intent, saved };
}

function harness(generate) {
  const calls = [];
  const scheduled = [];
  const cache = new Map();
  class AppError extends Error { constructor(message, statusCode) { super(message); this.statusCode = statusCode; } }
  class Workflow {
    async bootstrapTask(input) { return prisma.novelWorkflowTask.create({ data: { lane: input.lane, title: input.title,
      seedPayloadJson: JSON.stringify(input.seedPayload), status: "queued" } }); }
    async getTaskByIdWithoutHealing(id) { return prisma.novelWorkflowTask.findUnique({where:{id}}); }
    async markTaskWaitingApproval(id, input) {
      const task = await prisma.novelWorkflowTask.findUnique({where:{id}});
      return prisma.novelWorkflowTask.update({where:{id}, data:{status:"waiting_approval",
        seedPayloadJson: JSON.stringify({...JSON.parse(task.seedPayloadJson ?? "{}"), ...input.seedPayload})}});
    }
    async attachNovelToTask(id, novelId) { return prisma.novelWorkflowTask.update({where:{id},data:{novelId,
      resumeTargetJson:JSON.stringify({route:"/novels/:id/story",taskId:id,novelId,lane:"creation_studio",stage:"short_story_plan"})}}); }

    async markTaskRunning(id, input) {
      const task = await prisma.novelWorkflowTask.findUnique({where:{id}});
      return prisma.novelWorkflowTask.update({ where: { id }, data: { status: "running", currentItemKey: input.itemKey,
        currentItemLabel: input.itemLabel, ...(input.seedPayload ? {seedPayloadJson:JSON.stringify({...JSON.parse(task.seedPayloadJson ?? "{}"),...input.seedPayload})} : {}) } });
    }
    async markTaskFailed(id, message, input) { return prisma.novelWorkflowTask.update({ where: { id },
      data: { status: "failed", lastError: message, currentItemKey: input.itemKey, currentItemLabel: input.itemLabel } }); }
    async retryTask(id) { return prisma.novelWorkflowTask.update({ where: { id }, data: { status: "queued", lastError: null } }); }
    async recordCheckpoint(id, input) { return prisma.novelWorkflowTask.update({ where: { id }, data: {
      status: input.checkpointType === "workflow_completed" ? "succeeded" : "waiting_approval",
      checkpointType: input.checkpointType, checkpointSummary: input.checkpointSummary,
      currentItemLabel: input.itemLabel,
    } }); }
  }
  const assets = Object.fromEntries(["shortStoryPlanPrompt", "shortStorySegmentWritePrompt", "shortStoryFullAuditPrompt",
    "shortStoryPatchRepairPrompt", "shortStoryRevisionImpactPrompt"].map((name) => [name, { id: name }]));
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { fileName: file,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const requireStub = (id) => {
      if (id.endsWith("/diagnostics/StructuredDiagnosticStore")) return { latestStructuredDiagnostic: async () => null, canRetryStructuredTask: async () => true };
      if (id === "@prisma/client" || id.startsWith("@ai-novel/shared/")) return require(id);
      if (id.endsWith("/director/NovelDirectorService")) return { NovelDirectorService: class {} };
      if (id.endsWith("/NovelCreateResourceRecommendationService")) return { novelCreateResourceRecommendationService: {
        resolveRequired: async () => ({ genreId:null, primaryStoryModeId:null }) } };
      if (id.endsWith("/workflow/novelWorkflow.shared")) return { parseSeedPayload: (raw) => JSON.parse(raw ?? "{}"),
        resumeTargetToRoute: (target) => target?.novelId ? "/novels/"+target.novelId+"/story" : "/create" };
      if (id.endsWith("/creation/creationIntent.prompts")) return {creationIntentInterpretPrompt: {id:"creationIntentInterpretPrompt"}};
      if (id.endsWith("/creation/shortStoryReference.prompts")) return {shortStoryReferenceExtractPrompt: {id:"shortStoryReferenceExtractPrompt"}};
      if (id === "../../writing-platform") return { supportsWritingPlatformForm: () => true,
        writingPlatformProfileService: {snapshot: async (platform) => ({platform,profileVersion:1,label:"测试平台",guidance:{}})} };
      if (id === "node:crypto") return require(id);
      if (id.endsWith("/bookAnalysis/shared/bookAnalysis.status")) return require("../dist/services/bookAnalysis/shared/bookAnalysis.status");
      if (id === "zod") return require(id);
      if (id === "express") return require(id);
      if (id.endsWith("/middleware/auth")) return require("../dist/middleware/auth");
      if (id.endsWith("/middleware/validate")) return require("../dist/middleware/validate");
      if (id.endsWith("/creation-studio/application/CreationStudioService") && file.endsWith("shortStoryRoutes.ts")) return { creationStudioService: {} };
      if (id.endsWith("/db/prisma")) return { prisma };
      if (id.endsWith("/production/common")) return require("../dist/modules/production/common");
      if (id === "./shortStoryAuditPolicy") return require("../dist/modules/novel/short-story/application/shortStoryAuditPolicy");
      if (id.endsWith("/middleware/errorHandler")) return { AppError };
      if (id.endsWith("/core/promptRunner")) return { runStructuredPrompt: async (input) => {
        calls.push({ asset: input.asset.id, order: input.promptInput.segment?.order, input: input.promptInput });
        return { output: await generate(input) };
      } };
      if (id.endsWith("/shortStory/shortStory.prompts")) return assets;
      if (id.endsWith("/workflow/NovelWorkflowService")) return { NovelWorkflowService: Workflow };
      if (id.endsWith("/storyMode/storyModeProfile")) return { buildStoryModePromptBlock: () => "",
        parseStoryModeProfileJson: () => null };
      if (id.startsWith(".")) {
        let resolved = path.resolve(path.dirname(file), id + ".ts");
        if (!fs.existsSync(resolved)) resolved = path.resolve(path.dirname(file), id, "index.ts");
        assert.ok(resolved.startsWith(path.resolve(moduleRoot,"..") + path.sep), "Only owned source modules may be loaded");
        return load(resolved);
      }
      throw new Error("Unexpected dependency: " + id);
    };
    vm.runInNewContext(code, { module, exports: module.exports, require: requireStub, console, Date,
      setImmediate: (callback) => scheduled.push(callback), setInterval, clearInterval, setTimeout }, { filename: file });
    return module.exports;
  }
  return {
    studio: new (load(path.join(moduleRoot, "application/ShortStoryStudioService.ts")).ShortStoryStudioService)(),
    production: new (load(path.join(moduleRoot, "application/ShortStoryProductionService.ts")).ShortStoryProductionService)(),
    revision: new (load(path.join(moduleRoot, "application/ShortStoryRevisionService.ts")).ShortStoryRevisionService)(),
    calls, scheduled,
    creation: new (load(path.resolve(moduleRoot, "../creation-studio/application/CreationStudioService.ts")).CreationStudioService)(),
    mount(router) { load(path.join(moduleRoot, "http/shortStoryRoutes.ts")).registerShortStoryRoutes(router); },
    mountCreation(router) { router.use(load(path.resolve(moduleRoot, "../creation-studio/http/creationStudioRoutes.ts")).default); },
  };
}

function output(input, strategy = "local_patch") {
  switch (input.asset.id) {
    case "shortStoryRevisionImpactPrompt": return { understoodGoal: "修改线索揭晓", affectedSegmentOrders: [2],
      changesEnding: false, changesScale: false, changesCoreIntent: false, recommendedTargetWordCount: 3000,
      recommendedStrategy: strategy, summary: "保留人物与证据，调整揭晓过程", revisedDirection: { ...direction, title: "新标题" } };
    case "shortStoryPlanPrompt": return { ...plan, title: "新标题", endingPromise: "完整揭晓" };
    case "shortStorySegmentWritePrompt": return { content: "新正文" + input.promptInput.segment.order, continuitySummary: "证据推进" };
    case "shortStoryPatchRepairPrompt": return { patches: input.promptInput.audit.issues.map((issue) => ({
      segmentOrder: issue.affectedSegmentOrders[0], content: "修订正文" + issue.affectedSegmentOrders[0],
    })), residualQualityDebt: [] };
    case "shortStoryFullAuditPrompt": return { decision: "accepted", summary: "完成", issues: [] };
    default: throw new Error("Unexpected prompt");
  }
}
const contents = (novelId) => prisma.shortStorySegment.findMany({ where: { novelId }, orderBy: { order: "asc" } });

test("failed local revision retries the same persisted operation and never enters initial audit", async () => {
  const f = await fixture();
  let failed = false;
  const first = harness((input) => {
    if (input.asset.id === "shortStoryPatchRepairPrompt" && !failed) { failed = true; throw new Error("injected patch failure"); }
    return output(input);
  });
  const preview = await first.studio.previewRevision(f.novel.id, "调整线索");
  await first.studio.applyRevision(f.novel.id, preview.intentVersionId);
  await assert.rejects(first.production.run(f.task.id), /injected patch failure/);
  assert.deepEqual((await contents(f.novel.id)).map((segment) => segment.content), ["原文1", "原文2", "原文3"]);
  assert.equal((await prisma.novelIntentVersion.findUnique({ where: { id: f.intent.id } })).status, "active");
  const restarted = harness(output);
  await Promise.all([
    restarted.studio.retryProduction(f.novel.id),
    restarted.studio.retryProduction(f.novel.id),
  ]);
  await restarted.production.run(f.task.id);
  assert.equal((await prisma.novelWorkflowTask.findUnique({ where: { id: f.task.id } })).attemptCount, 1);
  assert.deepEqual(restarted.calls.map((call) => call.asset), ["shortStoryPatchRepairPrompt"]);
  const rows = await contents(f.novel.id);
  assert.deepEqual(rows.map((segment) => segment.content), ["原文1", "修订正文2", "原文3"]);
  assert.equal(JSON.parse(rows[1].humanSnapshotJson)[0].content, "原文2");
  assert.equal((await prisma.shortStoryRevisionJob.findUnique({ where: { intentVersionId: preview.intentVersionId } })).status, "completed");
  await restarted.studio.applyRevision(f.novel.id, preview.intentVersionId);
  await restarted.production.run(f.task.id);
  assert.equal((await contents(f.novel.id))[1].version, 2, "repeat confirmation must not apply twice");
});

test("full replan stages completed candidates, resumes after failure and atomically publishes the whole story", async () => {
  const f = await fixture();
  const first = harness((input) => {
    if (input.asset.id === "shortStorySegmentWritePrompt" && input.promptInput.segment.order === 2) throw new Error("injected second segment failure");
    return output(input, "full_replan");
  });
  const preview = await first.studio.previewRevision(f.novel.id, "重新安排整篇");
  assert.equal(preview.affectedSegmentIds.length, 3);
  await first.studio.applyRevision(f.novel.id, preview.intentVersionId);
  await assert.rejects(first.production.run(f.task.id), /second segment failure/);
  assert.deepEqual((await contents(f.novel.id)).map((segment) => segment.content), ["原文1", "原文2", "原文3"]);
  assert.equal((await prisma.shortStoryPlan.findUnique({ where: { novelId: f.novel.id } })).endingPromise, plan.endingPromise);
  assert.equal(await prisma.shortStoryRevisionCandidate.count({ where: { jobId: preview.intentVersionId } }), 1);
  const restarted = harness(output);
  await restarted.studio.retryProduction(f.novel.id);
  await restarted.production.run(f.task.id);
  assert.deepEqual(restarted.calls.map((call) => call.order), [2, 3]);
  assert.deepEqual((await contents(f.novel.id)).map((segment) => segment.content), ["新正文1", "新正文2", "新正文3"]);
  assert.equal((await prisma.shortStoryPlan.findUnique({ where: { novelId: f.novel.id } })).endingPromise, "完整揭晓");
});

test("editing any baseline segment while generation is running prevents all candidate publication", async () => {
  const f = await fixture();
  let h;
  h = harness(async (input) => {
    if (input.asset.id === "shortStoryPatchRepairPrompt") await h.studio.updateSegment(f.novel.id, f.saved.segments[0].id,
      { content: "人工编辑", expectedVersion: 1 });
    return output(input);
  });
  const preview = await h.studio.previewRevision(f.novel.id, "调整第二段");
  await h.studio.applyRevision(f.novel.id, preview.intentVersionId);
  await assert.rejects(h.production.run(f.task.id), /重新预览/);
  const rows = await contents(f.novel.id);
  assert.deepEqual(rows.map((segment) => segment.content), ["人工编辑", "原文2", "原文3"]);
  assert.equal((await h.studio.getProjection(f.novel.id)).production.recoveryAction, "preview_revision");
  assert.equal(JSON.parse(rows[0].humanSnapshotJson)[0].content, "原文1");
});

test("replan checkpoint exposes an actionable preview without writing official text or clearing the pause", async () => {
  const f = await fixture({ status: "waiting_approval", checkpointType: "replan_required", checkpointSummary: "关键因果链断裂",
    pendingManualRecovery: true });
  const h = harness(output);
  const projection = await h.studio.getProjection(f.novel.id);
  assert.equal(projection.production.recoveryAction, "preview_replan");
  assert.equal(projection.production.checkpointSummary, "关键因果链断裂");
  await assert.rejects(h.studio.retryProduction(f.novel.id), /确认新的创作方向/);
  await h.production.recoverPending();
  assert.equal(h.scheduled.length, 0);
  const preview = await h.studio.previewRevision(f.novel.id, "", "replan");
  assert.equal(preview.recommendedStrategy, "full_replan");
  assert.equal(preview.endingPromise, "完整揭晓");
  assert.deepEqual((await contents(f.novel.id)).map((segment) => segment.version), [1, 1, 1]);
  assert.equal((await prisma.novelWorkflowTask.findUnique({ where: { id: f.task.id } })).pendingManualRecovery, true);
  await h.studio.applyRevision(f.novel.id, preview.intentVersionId);
  const task = await prisma.novelWorkflowTask.findUnique({ where: { id: f.task.id } });
  assert.equal(task.pendingManualRecovery, false);
  assert.equal(task.checkpointType, null);
  await h.production.run(f.task.id);
  assert.equal((await prisma.novelWorkflowTask.findUnique({ where: { id: f.task.id } })).status, "succeeded");
});

test("a stale preview cannot clear a replan checkpoint or overwrite saved edits", async () => {
  const f = await fixture({ status: "waiting_approval", checkpointType: "replan_required", checkpointSummary: "结构问题" });
  const h = harness(output);
  const preview = await h.studio.previewRevision(f.novel.id, "", "replan");
  await h.studio.updateSegment(f.novel.id, f.saved.segments[0].id, { content: "最新人工正文", expectedVersion: 1 });
  await assert.rejects(h.studio.applyRevision(f.novel.id, preview.intentVersionId), /重新预览/);
  assert.equal(await prisma.shortStoryRevisionJob.count({ where: { workflowTaskId: f.task.id } }), 0);
  assert.equal((await prisma.novelWorkflowTask.findUnique({ where: { id: f.task.id } })).checkpointType, "replan_required");
});

test("cancellation during generation retains official prose and candidates never publish after restart", async () => {
  const f = await fixture();
  const h = harness(async (input) => {
    if (input.asset.id === "shortStorySegmentWritePrompt" && input.promptInput.segment.order === 2) {
      await prisma.novelWorkflowTask.update({ where: { id: f.task.id }, data: { status: "cancelled", cancelRequestedAt: new Date() } });
    }
    return output(input, "full_replan");
  });
  const preview = await h.studio.previewRevision(f.novel.id, "全篇改写");
  await h.studio.applyRevision(f.novel.id, preview.intentVersionId);
  await assert.rejects(h.production.run(f.task.id), /修改已停止/);
  const restarted = harness(output);
  await restarted.production.recoverPending();
  await restarted.production.run(f.task.id);
  assert.equal(restarted.calls.length, 0);
  assert.deepEqual((await contents(f.novel.id)).map((segment) => segment.version), [1, 1, 1]);
  assert.equal((await prisma.novelWorkflowTask.findUnique({ where: { id: f.task.id } })).status, "cancelled");
});

test("legacy failed revisions require a new preview and cannot be mistaken for initial production", async () => {
  const f = await fixture({ status: "failed", currentItemKey: "revision_apply" });
  const h = harness(output);
  await assert.rejects(h.studio.retryProduction(f.novel.id), /重新预览/);
  assert.equal((await h.studio.getProjection(f.novel.id)).production.recoveryAction, "preview_revision");
  await prisma.novelWorkflowTask.update({ where: { id: f.task.id }, data: { status: "running" } });
  await h.production.run(f.task.id);
  assert.equal(h.calls.length, 0);
});

test("startup recovery dispatches an unfinished revision using its persisted job", async () => {
  const f = await fixture();
  const h = harness(output);
  const preview = await h.studio.previewRevision(f.novel.id, "调整第二段");
  await h.studio.applyRevision(f.novel.id, preview.intentVersionId);
  const restarted = harness(output);
  await restarted.production.recoverPending();
  assert.ok(restarted.scheduled.length > 0);
  await restarted.production.run(f.task.id);
  assert.deepEqual(restarted.calls.map((call) => call.asset), ["shortStoryPatchRepairPrompt"]);
  assert.equal((await contents(f.novel.id))[1].content, "修订正文2");
});

test("competing workers cannot generate or publish the same revision twice", async () => {
  const f = await fixture();
  let release, entered;
  const waiting = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  const first = harness(async (input) => {
    if (input.asset.id === "shortStoryPatchRepairPrompt") { entered(); await waiting; }
    return output(input);
  });
  const preview = await first.studio.previewRevision(f.novel.id, "调整第二段");
  await Promise.all([
    first.studio.applyRevision(f.novel.id, preview.intentVersionId),
    first.studio.applyRevision(f.novel.id, preview.intentVersionId),
  ]);
  const running = first.production.run(f.task.id);
  await started;
  const second = harness(() => { throw new Error("duplicate worker invoked model"); });
  await second.production.run(f.task.id);
  release();
  await running;
  assert.equal(second.calls.length, 0);
  assert.equal(await prisma.shortStoryRevisionJob.count({ where: { workflowTaskId: f.task.id } }), 1);
  assert.equal((await contents(f.novel.id))[1].version, 2);
});

test("failure while publishing rolls back text, snapshots, intent, plan and task completion together", async () => {
  const f = await fixture();
  const h = harness((input) => output(input, "full_replan"));
  const preview = await h.studio.previewRevision(f.novel.id, "调整整篇");
  await h.studio.applyRevision(f.novel.id, preview.intentVersionId);
  const segmentId = f.saved.segments[2].id;
  assert.match(segmentId, /^[a-z0-9]+$/);
  await prisma.$executeRawUnsafe("CREATE TRIGGER fail_publish_" + sequence
    + " BEFORE UPDATE ON ShortStorySegment WHEN OLD.id = '" + segmentId
    + "' BEGIN SELECT RAISE(ABORT, 'injected publication failure'); END");
  await assert.rejects(h.production.run(f.task.id));
  const rows = await contents(f.novel.id);
  assert.deepEqual(rows.map((segment) => segment.content), ["原文1", "原文2", "原文3"]);
  assert.deepEqual(rows.map((segment) => segment.humanSnapshotJson), [null, null, null]);
  assert.equal((await prisma.novelIntentVersion.findUnique({ where: { id: f.intent.id } })).status, "active");
  assert.equal((await prisma.shortStoryPlan.findUnique({ where: { novelId: f.novel.id } })).endingPromise, plan.endingPromise);
  assert.equal((await prisma.novelWorkflowTask.findUnique({ where: { id: f.task.id } })).status, "failed");
  assert.equal((await prisma.shortStoryRevisionJob.findUnique({ where: { id: preview.intentVersionId } })).status, "failed");
});

test("editing after a failed revision makes retry request a new preview", async () => {
  const f = await fixture();
  const h = harness((input) => {
    if (input.asset.id === "shortStoryPatchRepairPrompt") throw new Error("interrupted");
    return output(input);
  });
  const preview = await h.studio.previewRevision(f.novel.id, "调整第二段");
  await h.studio.applyRevision(f.novel.id, preview.intentVersionId);
  await assert.rejects(h.production.run(f.task.id));
  await h.studio.updateSegment(f.novel.id, f.saved.segments[2].id, { content: "后续人工修改", expectedVersion: 1 });
  await assert.rejects(h.studio.retryProduction(f.novel.id), /重新预览/);
  assert.equal((await h.studio.getProjection(f.novel.id)).production.recoveryAction, "preview_revision");
});

test("expired worker lease resumes the staged replan after a process restart", async () => {
  const f = await fixture();
  const h = harness((input) => output(input, "full_replan"));
  const preview = await h.studio.previewRevision(f.novel.id, "调整整篇");
  await h.studio.applyRevision(f.novel.id, preview.intentVersionId);
  await prisma.shortStoryRevisionJob.update({ where: { id: preview.intentVersionId },
    data: { status: "running", leaseToken: "crashed-worker", leaseExpiresAt: new Date(Date.now() - 1000),
      candidates: { create: { segmentId: f.saved.segments[0].id, order: 1, targetWordCount: 1000,
        content: "重启前的候选1", continuitySummary: "已保存的连续性" } } } });
  await prisma.novelWorkflowTask.update({ where: { id: f.task.id }, data: { status: "running" } });
  const restarted = harness(output);
  await restarted.production.recoverPending();
  await restarted.production.run(f.task.id);
  assert.deepEqual(restarted.calls.map((call) => call.order), [2, 3]);
  assert.equal(restarted.calls[0].input.previousContinuity, "已保存的连续性");
  assert.equal((await contents(f.novel.id))[0].content, "重启前的候选1");
});

test("initial production retry preserves completed human text and only generates pending segments", async () => {
  const f = await fixture({ status: "failed", checkpointType: "direction_confirmed" });
  await prisma.shortStorySegment.update({ where: { id: f.saved.segments[0].id }, data: { userEditedAt: new Date() } });
  await prisma.shortStorySegment.update({ where: { id: f.saved.segments[2].id }, data: { status: "failed", content: "" } });
  const h = harness(output);
  await h.studio.retryProduction(f.novel.id);
  await h.production.run(f.task.id);
  assert.deepEqual(h.calls.map((call) => call.asset), ["shortStorySegmentWritePrompt", "shortStoryFullAuditPrompt"]);
  assert.deepEqual((await contents(f.novel.id)).map((segment) => segment.content), ["原文1", "原文2", "新正文3"]);
});

test("HTTP requires explicit replan confirmation and rejects ordinary retry and unconfirmed apply", async () => {
  const express = require("express");
  const f = await fixture({ status: "waiting_approval", checkpointType: "replan_required", checkpointSummary: "结构需要调整" });
  const h = harness(output);
  const app = express();
  app.use(express.json());
  const router = express.Router(); h.mount(router); app.use("/novels", router);
  app.use((error, _req, res, _next) => res.status(error.statusCode ?? (error.name === "ZodError" ? 400 : 500)).json({ error: error.message }));
  const server = await new Promise((resolve) => { const opened = app.listen(0, "127.0.0.1", () => resolve(opened)); });
  const base = "http://127.0.0.1:" + server.address().port + "/novels/" + f.novel.id + "/short-story";
  const post = (route, body = {}) => fetch(base + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    assert.equal((await post("/retry")).status, 409);
    const result = await post("/replan-preview");
    assert.equal(result.status, 200);
    const preview = (await result.json()).data;
    assert.equal(preview.mode, "replan");
    assert.equal((await post("/revisions/" + preview.intentVersionId + "/apply", { confirmed: false })).status, 400);
    assert.equal((await post("/revisions/" + preview.intentVersionId + "/apply", { confirmed: true })).status, 202);
    assert.equal((await prisma.novelWorkflowTask.findUnique({ where: { id: f.task.id } })).status, "queued");
  } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

for (const [mode, configured] of [["initial", 6144], ["replan", 4096]]) {
  test(`${mode} short-story writing preserves the configured writer output cap at the SDK boundary`, async (t) => {
    const factory = require("../dist/llm/factory");
    const router = require("../dist/llm/modelRouter");
    const previous = router.resolveModel;
    router.resolveModel = async (taskType, options) => ({ provider: "custom", model: "fixture", temperature: 0.2,
      maxTokens: options.maxTokens ?? configured, requestProtocol: "openai_compatible", structuredResponseFormat: "prompt_json",
      routeKey: taskType, routeDegraded: false });
    factory.setProviderSecretCache("custom", { key: "fixture-key", baseURL: "https://models.invalid/v1", model: "fixture", reasoningEnabled: false });
    t.after(() => { router.resolveModel = previous; factory.setProviderSecretCache("custom", null); });
    const f = await fixture(mode === "initial" ? { status: "queued", checkpointType: null } : {}, mode !== "initial");
    const physicalCaps = [];
    const h = harness(async (input) => {
      if (input.asset.id === "shortStorySegmentWritePrompt") {
        const configuration = await factory.resolveLLMClientOptions("custom", { model: "fixture", taskType: "writer", maxTokens: input.options.maxTokens });
        physicalCaps.push(factory.createLLMFromResolvedOptions(configuration).invocationParams({}).max_tokens);
      }
      return output(input, mode === "replan" ? "full_replan" : "local_patch");
    });
    if (mode === "replan") {
      const preview = await h.studio.previewRevision(f.novel.id, "重新安排整篇");
      await h.studio.applyRevision(f.novel.id, preview.intentVersionId);
    }
    await h.production.run(f.task.id);
    assert.deepEqual(physicalCaps, [configured, configured, configured]);
  });
}

test("first production still plans, writes and audits a new short story", async () => {
  const f = await fixture({ status: "queued", checkpointType: null }, false);
  const h = harness(output);
  await h.production.run(f.task.id);
  assert.deepEqual(h.calls.map((call) => call.asset), ["shortStoryPlanPrompt", "shortStorySegmentWritePrompt",
    "shortStorySegmentWritePrompt", "shortStorySegmentWritePrompt", "shortStoryFullAuditPrompt"]);
  assert.deepEqual((await contents(f.novel.id)).map((segment) => segment.content), ["新正文1", "新正文2", "新正文3"]);
  assert.equal((await prisma.novelWorkflowTask.findUnique({ where: { id: f.task.id } })).status, "succeeded");
});

test("an unchanged patch cannot be reported as a completed revision", async () => {
  const f = await fixture();
  const h = harness((input) => input.asset.id === "shortStoryPatchRepairPrompt"
    ? { patches: [{ segmentOrder: 2, content: "原文2" }], residualQualityDebt: [] } : output(input));
  const preview = await h.studio.previewRevision(f.novel.id, "调整第二段");
  await h.studio.applyRevision(f.novel.id, preview.intentVersionId);
  await assert.rejects(h.production.run(f.task.id), /修改结果与原文相同/);
  assert.equal((await prisma.novelWorkflowTask.findUnique({ where: { id: f.task.id } })).status, "failed");
  assert.equal((await contents(f.novel.id))[1].version, 1);
  assert.equal((await h.studio.getProjection(f.novel.id)).production.recoveryAction, "preview_revision");
});

test("a preview from an earlier checkpoint cannot confirm a replacement checkpoint", async () => {
  const f = await fixture({ status: "waiting_approval", checkpointType: "replan_required", checkpointSummary: "第一份原因" });
  const h = harness(output);
  const preview = await h.studio.previewRevision(f.novel.id, "", "replan");
  await prisma.novelWorkflowTask.update({ where: { id: f.task.id }, data: { checkpointSummary: "新的结构原因" } });
  await assert.rejects(h.studio.applyRevision(f.novel.id, preview.intentVersionId), /任务已变化/);
  assert.equal((await prisma.novelWorkflowTask.findUnique({ where: { id: f.task.id } })).checkpointSummary, "新的结构原因");
});

async function referenceFixture() {
  const doc = await prisma.knowledgeDocument.create({data:{title:"参考原作",fileName:"reference.txt"}});
  const version = await prisma.knowledgeDocumentVersion.create({data:{documentId:doc.id,versionNumber:1,content:"源文完整内容",contentHash:"fixture-hash",charCount:7}});
  await prisma.knowledgeDocument.update({where:{id:doc.id},data:{activeVersionId:version.id,activeVersionNumber:1}});
  const analysis = await prisma.bookAnalysis.create({data:{documentId:doc.id,documentVersionId:version.id,title:"完整拆书",status:"succeeded",
    sections:{create:[{sectionKey:"plot_structure",title:"结构",status:"succeeded",sortOrder:1,editedContent:"结构说明".repeat(4000)+"结局：证据公开，反派承担代价。"},
    {sectionKey:"style_technique",title:"写法",status:"succeeded",sortOrder:2,aiContent:"短对话推进，线索逐次回收。"}]}}});
  return {doc,version,analysis};
}
function creationOutput(input) {
  if(input.asset.id==="shortStoryReferenceExtractPrompt") return {structureLessons:["线索逐步揭晓"],pacingLessons:["行动推进"],styleLessons:["短对话"],endingLessons:["完整回收证据线"],endingEvidence:"available",originalityConstraints:["更换全部人物、世界和事件"]};
  if(input.asset.id==="creationIntentInterpretPrompt") return {understanding:"参考节奏创作全新故事",recommendedNarrativeForm:"short_story",
    recommendedTargetWordCount:3000,confidence:0.9,recommendationReason:"短篇收束",recommendedWritingPlatform:"fanqie_free",writingPlatformConfidence:0.9,
    writingPlatformReason:"短篇读者",directions:[direction,{...direction,id:"d2",title:"另一个方向",premise:"另一个故事前提"}]};
  return output(input);
}
test("reference short story passes verified full-book lessons into direction interpretation", async()=>{
  const f=await referenceFixture(); const h=harness(creationOutput);
  const result=await h.creation.interpret({idea:"写一个新的证据调查故事",preferredNarrativeForm:"short_story",
    reference:{analysisId:f.analysis.id,documentId:f.doc.id,sectionKeys:["plot_structure","style_technique"],goal:"借鉴线索回收和快节奏"}});
  assert.equal(h.calls.find(call=>call.asset==="creationIntentInterpretPrompt").input.reference?.goal,"借鉴线索回收和快节奏");
  assert.equal(result.reference?.analysisId,f.analysis.id);
  assert.match(JSON.stringify(h.calls.find(call=>call.asset==="shortStoryReferenceExtractPrompt").input), /结局：证据公开/);
});

const referenceInput = (f) => ({ idea: "新的证据调查故事", preferredNarrativeForm: "short_story",
  reference: { analysisId: f.analysis.id, documentId: f.doc.id, sectionKeys: ["plot_structure", "style_technique"], goal: "借鉴线索回收和快节奏" } });
const confirmInput = (taskId) => ({ directionId: "d1", narrativeForm: "short_story", targetWordCount: 3000,
  writingPlatform: "fanqie_free", idempotencyKey: "reference:" + taskId });

test("reference extraction keeps prose conclusions alongside structured analysis evidence", async () => {
  const f = await referenceFixture(); const h = harness(creationOutput);
  await prisma.bookAnalysisSection.update({ where: { analysisId_sectionKey: { analysisId: f.analysis.id, sectionKey: "plot_structure" } },
    data: { editedContent: null, structuredDataJson: '{"opening":"证据出现"}', aiContent: "完整结局说明：证据公开，责任兑现。" } });
  await h.creation.interpret(referenceInput(f));
  const extracted = h.calls.find((call) => call.asset === "shortStoryReferenceExtractPrompt");
  assert.match(JSON.stringify(extracted.input.conclusions), /完整结局说明/);
  assert.match(JSON.stringify(extracted.input.conclusions), /证据出现/);
});

test("confirmed reference contract reaches planning, writing, auditing, repairs and natural-language revision", async () => {
  const f = await referenceFixture();
  const h = harness((input) => input.asset.id === "shortStoryFullAuditPrompt"
    ? { decision: "patchable", summary: "调整线索", issues: [{ code: "clue", description: "调整线索", affectedSegmentOrders: [1] }] }
    : creationOutput(input));
  const task = await h.creation.interpret(referenceInput(f));
  const confirmation = await h.creation.confirm(task.taskId, confirmInput(task.taskId));
  await h.production.run(task.taskId);
  let projection = await h.studio.getProjection(confirmation.novelId);
  assert.equal(projection.reference.analysisId, f.analysis.id);
  const snapshot = (await prisma.novel.findUnique({ where: { id: confirmation.novelId } })).shortStoryReferenceJson;
  const preview = await h.studio.previewRevision(confirmation.novelId, "调整第二处线索");
  await h.studio.applyRevision(confirmation.novelId, preview.intentVersionId);
  await h.production.run(task.taskId);
  const expected = ["shortStoryPlanPrompt", "shortStorySegmentWritePrompt", "shortStoryFullAuditPrompt",
    "shortStoryPatchRepairPrompt", "shortStoryRevisionImpactPrompt"];
  for (const asset of expected) {
    const calls = h.calls.filter((call) => call.asset === asset);
    assert.ok(calls.length, asset);
    for (const call of calls) assert.equal(call.input.reference?.goal, "借鉴线索回收和快节奏", asset);
  }
  assert.equal((await prisma.novel.findUnique({ where: { id: confirmation.novelId } })).shortStoryReferenceJson, snapshot);
});

test("reference updates invalidate unconfirmed directions instead of silently changing their source", async () => {
  const f = await referenceFixture(); const h = harness(creationOutput);
  const task = await h.creation.interpret(referenceInput(f));
  await prisma.bookAnalysisSection.update({ where: { analysisId_sectionKey: { analysisId: f.analysis.id, sectionKey: "plot_structure" } },
    data: { editedContent: "新的结构与结局" } });
  await assert.rejects(h.creation.confirm(task.taskId, confirmInput(task.taskId)), /参考拆书已更新/);
  assert.equal((await prisma.novelWorkflowTask.findUnique({ where: { id: task.taskId } })).novelId, null);
});

test("confirmed sources remain immutable after analysis changes and deletion, including restart and replan", async () => {
  const f = await referenceFixture();
  const first = harness(creationOutput);
  const task = await first.creation.interpret(referenceInput(f));
  const result = await first.creation.confirm(task.taskId, confirmInput(task.taskId));
  await first.production.run(task.taskId);
  const saved = (await prisma.novel.findUnique({ where: { id: result.novelId } })).shortStoryReferenceJson;
  await prisma.bookAnalysisSection.update({ where: { analysisId_sectionKey: { analysisId: f.analysis.id, sectionKey: "style_technique" } },
    data: { aiContent: "新的不同写法" } });
  const next = harness((input) => {
    if (input.asset.id === "shortStorySegmentWritePrompt") return { content: "参考重规划" + input.promptInput.segment.order, continuitySummary: "线索推进" };
    return creationOutput(input);
  });
  assert.equal((await next.studio.getProjection(result.novelId)).reference.sourceState, "updated");
  await prisma.knowledgeDocument.update({ where: { id: f.doc.id }, data: { status: "disabled" } });
  assert.equal((await next.studio.getProjection(result.novelId)).reference.sourceState, "unavailable");
  await prisma.bookAnalysis.delete({ where: { id: f.analysis.id } }); // Only data created by this test in its disposable SQLite fixture.
  assert.equal(await prisma.bookAnalysis.findUnique({ where: { id: f.analysis.id } }), null);
  assert.equal((await next.studio.getProjection(result.novelId)).reference.sourceState, "unavailable");
  await prisma.novelWorkflowTask.update({ where: { id: task.taskId }, data: { status: "waiting_approval",
    checkpointType: "replan_required", checkpointSummary: "重排线索" } });
  const preview = await next.studio.previewRevision(result.novelId, "", "replan");
  await next.studio.applyRevision(result.novelId, preview.intentVersionId);
  await next.production.run(task.taskId);
  assert.equal((await prisma.novel.findUnique({ where: { id: result.novelId } })).shortStoryReferenceJson, saved);
  for (const call of next.calls) assert.equal(call.input.reference?.goal, "借鉴线索回收和快节奏");
  await first.creation.confirm(task.taskId, confirmInput(task.taskId)); // repeated confirmation returns the same novel, even when source is disabled.
  assert.equal(await prisma.creationStudioConfirmation.count({ where: { workflowTaskId: task.taskId } }), 1);
});

for (const scenario of ["mismatched_document", "disabled_document", "unfinished_analysis", "empty_conclusions", "empty_structured_conclusions"]) {
  test("unavailable reference is explicit and never falls back to an ordinary story: " + scenario, async () => {
    const f = await referenceFixture(); const h = harness(creationOutput); const input = referenceInput(f);
    if (scenario === "mismatched_document") input.reference.documentId = "different-document";
    if (scenario === "disabled_document") await prisma.knowledgeDocument.update({ where: { id: f.doc.id }, data: { status: "disabled" } });
    if (scenario === "unfinished_analysis") await prisma.bookAnalysis.update({ where: { id: f.analysis.id }, data: { status: "running" } });
    if (scenario === "empty_conclusions") await prisma.bookAnalysisSection.update({
      where: { analysisId_sectionKey: { analysisId: f.analysis.id, sectionKey: "plot_structure" } },
      data: { editedContent: null, aiContent: null, structuredDataJson: null } });
    if (scenario === "empty_structured_conclusions") await prisma.bookAnalysisSection.update({
      where: {analysisId_sectionKey:{analysisId:f.analysis.id,sectionKey:"plot_structure"}},data:{editedContent:null,aiContent:null,structuredDataJson:"{}"}});
    const task = await h.creation.interpret(input);
    assert.equal(task.status, "failed");
    assert.ok(task.error);
    assert.equal(h.calls.length, 0, "missing reference must not trigger ordinary direction generation");
    assert.equal(task.novelId, null);
  });
}

test("ordinary long-form creation still hands off to the configured director launcher", async () => {
  const h = harness((input) => ({ ...creationOutput(input), recommendedNarrativeForm: "long_novel", recommendedTargetWordCount: 100000 }));
  let launches = 0;
  h.creation.configureLongNovelLauncher(async () => {
    launches++;
    const novel = await prisma.novel.create({ data: { title: "长篇回归" } });
    const task = await prisma.novelWorkflowTask.create({ data: { title: "长篇", lane: "auto_director", novelId: novel.id } });
    return { novel, workflowTaskId: task.id };
  });
  const task = await h.creation.interpret({ idea: "长篇创作", preferredNarrativeForm: "long_novel" });
  const result = await h.creation.confirm(task.taskId, { ...confirmInput(task.taskId), narrativeForm: "long_novel", targetWordCount: 100000 });
  assert.equal(result.narrativeForm, "long_novel");
  assert.equal(launches, 1);
  assert.equal((await prisma.novel.findUnique({ where: { id: result.novelId } })).shortStoryReferenceJson, null);
});

test("refreshing a changed reference creates new reviewed directions and permits explicit confirmation", async()=>{
  const f=await referenceFixture();const h=harness(creationOutput);const task=await h.creation.interpret(referenceInput(f));
  await prisma.bookAnalysisSection.update({where:{analysisId_sectionKey:{analysisId:f.analysis.id,sectionKey:"style_technique"}},data:{aiContent:"新的快节奏方法"}});
  const refreshed=await h.creation.regenerate(task.taskId,{narrativeForm:"short_story",targetWordCount:3000,reference:{...referenceInput(f).reference,goal:"更看重反转回收"}});
  assert.equal(refreshed.reference.sourceState,"available");assert.equal(refreshed.reference.goal,"更看重反转回收");
  assert.notEqual(refreshed.reference.analysisRevision,task.reference.analysisRevision);
  assert.equal((await h.creation.confirm(task.taskId,confirmInput(task.taskId))).narrativeForm,"short_story");
});

test("HTTP validates reference selection and preserves its binding through confirmation", async () => {
  const express = require("express");
  const f = await referenceFixture(); const h = harness(creationOutput);
  const app = express(); app.use(express.json()); h.mountCreation(app);
  app.use((error, _req, res, _next) => res.status(error.statusCode ?? (error.name === "ZodError" ? 400 : 500)).json({ error: error.message }));
  const server = await new Promise((resolve) => { const opened = app.listen(0, "127.0.0.1", () => resolve(opened)); });
  const base = "http://127.0.0.1:" + server.address().port;
  const post = (route, body) => fetch(base + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    const input = referenceInput(f);
    assert.equal((await post("/interpret", { ...input, reference: { ...input.reference, goal: " " } })).status, 400);
    assert.equal((await post("/interpret", { ...input, reference: { ...input.reference, sectionKeys: ["unknown"] } })).status, 400);
    const invalid = await post("/interpret", { ...input, reference: { ...input.reference, documentId: "another-document" } });
    assert.equal(invalid.status, 201);
    assert.equal((await invalid.json()).data.status, "failed");
    assert.equal(h.calls.length, 0);
    const created = await post("/interpret", input);
    assert.equal(created.status, 201);
    const task = (await created.json()).data;
    assert.equal(task.reference.analysisId, f.analysis.id);
    const confirmed = await post("/" + task.taskId + "/confirm", confirmInput(task.taskId));
    assert.equal(confirmed.status, 200);
    const result = (await confirmed.json()).data;
    const novel = await prisma.novel.findUnique({ where: { id: result.novelId } });
    assert.equal(JSON.parse(novel.shortStoryReferenceJson).analysisId, f.analysis.id);
  } finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test("reference replan resumes staged candidates after failure with the same confirmed contract", async () => {
  const f = await referenceFixture(); const first = harness(creationOutput);
  const task = await first.creation.interpret(referenceInput(f));
  const result = await first.creation.confirm(task.taskId, confirmInput(task.taskId));
  await first.production.run(task.taskId);
  const baseline = (await contents(result.novelId)).map((segment) => segment.content);
  await prisma.novelWorkflowTask.update({ where: { id: task.taskId }, data: { status: "waiting_approval",
    checkpointType: "replan_required", checkpointSummary: "重排参考节奏" } });
  const failing = harness((input) => {
    if (input.asset.id === "shortStorySegmentWritePrompt") {
      if (input.promptInput.segment.order === 2) throw new Error("injected reference writer failure");
      return { content: "重排正文" + input.promptInput.segment.order, continuitySummary: "重排" };
    }
    return creationOutput(input);
  });
  const preview = await failing.studio.previewRevision(result.novelId, "", "replan");
  await failing.studio.applyRevision(result.novelId, preview.intentVersionId);
  await assert.rejects(failing.production.run(task.taskId), /injected reference writer failure/);
  assert.deepEqual((await contents(result.novelId)).map((segment) => segment.content), baseline);
  const resumed = harness((input) => input.asset.id === "shortStorySegmentWritePrompt"
    ? { content: "重排正文" + input.promptInput.segment.order, continuitySummary: "重排" } : creationOutput(input));
  await resumed.studio.retryProduction(result.novelId);
  await resumed.production.run(task.taskId);
  assert.deepEqual(resumed.calls.filter((call) => call.asset === "shortStorySegmentWritePrompt").map((call) => call.order), [2, 3]);
  assert.deepEqual((await contents(result.novelId)).map((segment) => segment.content), ["重排正文1", "重排正文2", "重排正文3"]);
  for (const call of resumed.calls) assert.equal(call.input.reference.goal, referenceInput(f).reference.goal);
});
