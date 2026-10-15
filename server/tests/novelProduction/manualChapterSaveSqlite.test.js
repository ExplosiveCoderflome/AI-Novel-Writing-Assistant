const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("manual chapter saves fence concurrent writes and close durable, versioned timelines", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "manual-chapter-save-"));
  const script = String.raw`
const assert = require("node:assert/strict");
const { prisma } = require("./dist/db/prisma");
const { ensureRuntimeDatabaseReady } = require("./dist/db/runtimeMigrations");
const artifacts = require("./dist/services/novel/chapterEditor/application/ChapterArtifactProjectionService");
const syncOriginalArtifacts = artifacts.syncChapterArtifacts;
artifacts.syncChapterArtifacts = async () => {};
const rag = require("./dist/services/novel/novelCoreSupport");
const queuedDeletes = [];
rag.queueRagUpsert = () => {};
rag.queueRagDelete = (...args) => queuedDeletes.push(args);
const { NovelCoreCrudService } = require("./dist/services/novel/novelCoreCrudService");
const { ChapterTimelineFinalizationService, chapterTimelineFinalizationService } = require("./dist/services/novel/runtime/ChapterTimelineFinalizationService");
const { buildTimelineContentHash, TimelineContentVersionError } = require("./dist/modules/timeline");
const { NovelSideEffectJobHandlers } = require("./dist/events/sideEffects/NovelSideEffectJobHandlers");

(async () => {
  await ensureRuntimeDatabaseReady();
  await prisma.novel.create({data:{id:"book",title:"隔离回归"}});
  const original = await prisma.chapter.create({data:{id:"chapter",novelId:"book",order:1,title:"第一章",content:"原稿"}});
  await prisma.storyTimelineEvent.create({data:{id:"old-event",novelId:"book",chapterId:"chapter",chapterIndex:1,eventOrder:1001,title:"旧事件",summary:"旧正文",type:"plot",status:"occurred",visibility:"reader_known",source:"chapter_extraction"}});
  await prisma.storyTimelineEvent.create({data:{id:"manual-event",novelId:"book",chapterId:"chapter",chapterIndex:1,eventOrder:1002,title:"作者设定",summary:"保留作者设定",type:"plot",status:"planned",visibility:"reader_known",source:"manual"}});
  await prisma.timelineHook.create({data:{id:"old-hook",novelId:"book",createdInChapterId:"chapter",createdInChapterIndex:1,title:"旧钩子",description:"旧正文",status:"open",priority:"high"}});
  await prisma.timelineHook.create({data:{id:"incoming-hook",novelId:"book",createdInChapterId:"opening",createdInChapterIndex:0,resolvedInChapterId:"chapter",resolvedInChapterIndex:1,title:"前文钩子",description:"不能由旧稿承接",status:"addressed",priority:"high"}});
  const service = new NovelCoreCrudService();
  service.volumeService.mirrorChapterIntoWorkspace = async () => {};
  const find = prisma.chapter.findFirst.bind(prisma.chapter);
  let readCount = 0, release;
  const barrier = new Promise(resolve => {release = resolve;});
  prisma.chapter.findFirst = async input => {
    const row = await find(input);
    if (input.select?.updatedAt && input.where.id === "chapter") {
      if (++readCount === 2) release();
      await barrier;
    }
    return row;
  };
  const outcomes = await Promise.allSettled(["修订甲", "修订乙"].map(content => service.updateChapter("book", "chapter", {
    content, expectedUpdatedAt: original.updatedAt.toISOString(),
  })));
  prisma.chapter.findFirst = find;
  assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(outcomes.find(result => result.status === "rejected").reason.statusCode, 409);
  const saved = await prisma.chapter.findUniqueOrThrow({where:{id:"chapter"}});
  assert.ok(saved.updatedAt > original.updatedAt);
  assert.equal((await prisma.novelSideEffectJob.findMany({where:{jobType:"chapter.timelineFinalization"}})).length, 1);
  assert.equal((await prisma.novelSideEffectJob.findMany({where:{jobType:"chapter.manualSync"}})).length, 1);
  assert.equal((await prisma.storyTimelineEvent.findUnique({where:{id:"old-event"}})).status, "superseded");
  assert.equal((await prisma.storyTimelineEvent.findUnique({where:{id:"manual-event"}})).status, "planned");
  assert.equal((await prisma.timelineHook.findUnique({where:{id:"old-hook"}})).status, "dropped");
  assert.equal((await prisma.timelineHook.findUnique({where:{id:"incoming-hook"}})).status, "open");

  const context = {currentChapterIndex:1,currentTime:null,previousEvents:[],plannedEventsThisChapter:[],openHooks:[],blockingHooks:[],softHooks:[],addressedHooks:[],forbiddenEvents:[],continuityRequirements:[],latestStateChanges:[]};
  const timelineGate = {result:{status:"passed",score:1,issues:[]},extractedEvents:[{title:"新事件",summary:"来自保留稿",type:"plot",occurred:true,confidence:1,stateChanges:[],possibleHooks:[]}],extractedHooks:[],timeAnchor:{storyDayIndex:2,label:"第二天"},addressedHookIds:[],resolvedHookIds:[],extractorSucceeded:true,timelineContext:context};
  const finalizer = new ChapterTimelineFinalizationService();
  await assert.rejects(finalizer.finalizeCurrentContent({novelId:"book",chapterId:"chapter",content:"原稿",sourceStage:"stale-worker",timelineGate}), TimelineContentVersionError);
  assert.equal(await prisma.storyTimelineEvent.count({where:{novelId:"book",source:"chapter_extraction",status:"occurred"}}), 0);
  const result = await finalizer.finalizeCurrentContent({novelId:"book",chapterId:"chapter",content:saved.content,sourceStage:"test",timelineGate});
  assert.equal(result.checkpointWritten,true);
  assert.equal(await prisma.chapterArtifactSyncCheckpoint.count({where:{chapterId:"chapter",syncMode:"manual_pending",status:"pending"}}),0);
  assert.equal((await prisma.chapter.findUniqueOrThrow({where:{id:"chapter"}})).updatedAt.getTime(), saved.updatedAt.getTime(), "timeline sync must not change editor version");
  await finalizer.finalizeCurrentContent({novelId:"book",chapterId:"chapter",content:saved.content,sourceStage:"reentry",timelineGate});
  assert.equal(await prisma.storyTimelineEvent.count({where:{novelId:"book",source:"chapter_extraction",status:"occurred"}}),1);

  const blank = await prisma.chapter.create({data:{id:"blank",novelId:"book",order:2,title:"空章",content:"",chapterStatus:"unplanned",generationState:"planned"}});
  prisma.chapter.findFirst = async input => {
    const row = await find(input);
    if (input.where.id === blank.id) await prisma.chapter.update({where:{id:blank.id},data:{content:"生成器刚保存的正文",generationState:"drafted"}});
    return row;
  };
  await assert.rejects(service.deleteChapter("book",blank.id), error => error.statusCode === 409);
  prisma.chapter.findFirst = find;
  assert.equal((await prisma.chapter.findUniqueOrThrow({where:{id:blank.id}})).content,"生成器刚保存的正文");
  assert.equal(queuedDeletes.length,0,"a rejected delete must not remove RAG entries");

  // A durable job for a superseded edit never calls the model or overwrites the newer version.
  const job = await prisma.novelSideEffectJob.findFirstOrThrow({where:{jobType:"chapter.timelineFinalization"}});
  await service.updateChapter("book","chapter",{content:"再次编辑",expectedUpdatedAt:saved.updatedAt.toISOString()});
  let invocations = 0;
  chapterTimelineFinalizationService.finalizeCurrentContent = async () => {invocations++;return {checkpointWritten:false};};
  await new NovelSideEffectJobHandlers().execute(job);
  assert.equal(invocations,0);
  const currentJob = await prisma.novelSideEffectJob.findFirstOrThrow({where:{jobType:"chapter.timelineFinalization",id:{not:job.id}}});
  assert.ok((await new NovelSideEffectJobHandlers().execute(currentJob)).deferUntil instanceof Date);
  assert.equal(invocations,1);

  await syncOriginalArtifacts("book", "chapter", "原稿");
  assert.equal(await prisma.chapterSummary.count({where:{chapterId:"chapter"}}),0,"stale saves must not replace derived summaries");

  const beforeGeneration = new ChapterTimelineFinalizationService();
  const pendingContents=[];
  beforeGeneration.finalizeCurrentContent = async input => {pendingContents.push(input.content); return {checkpointWritten:pendingContents.length > 1};};
  beforeGeneration.ensurePreviousChapterFinalized = async () => null;
  await beforeGeneration.ensureBeforeGeneration({novelId:"book",chapterId:blank.id});
  assert.deepEqual(pendingContents,["再次编辑","再次编辑"],"preflight waits for a running background finalizer instead of failing the pipeline");
  console.log("CAS save, raced delete, durable queue, timeline invalidation, stale write fence, reentry and preflight verified");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
`;
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: path.resolve(__dirname, "../.."),
    env: { ...process.env, NODE_ENV: "test", AI_NOVEL_RUNTIME: "desktop", AI_NOVEL_APP_DATA_DIR: directory,
      DATABASE_URL: `file:${path.join(directory, "fixture.db").replace(/\\/g, "/")}` },
    encoding: "utf8", timeout: 120_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}\n${result.error ?? ""}`);
});

test("manual saves and timeline finalization roll back their entire persistence boundary", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-transaction-"));
  const script = String.raw`
const assert = require("node:assert/strict");
const { prisma } = require("./dist/db/prisma");
const { ensureRuntimeDatabaseReady } = require("./dist/db/runtimeMigrations");
const artifacts = require("./dist/services/novel/chapterEditor/application/ChapterArtifactProjectionService");
let artifactSyncs = 0;
artifacts.syncChapterArtifacts = async () => { artifactSyncs++; };
const rag = require("./dist/services/novel/novelCoreSupport");
let ragUpserts = 0;
rag.queueRagUpsert = () => { ragUpserts++; };
const { NovelCoreCrudService } = require("./dist/services/novel/novelCoreCrudService");
const { ChapterTimelineFinalizationService } = require("./dist/services/novel/runtime/ChapterTimelineFinalizationService");
const { buildTimelineContentHash, TimelineContentVersionError, TimelineFinalizationStore } = require("./dist/modules/timeline");

(async () => {
  await ensureRuntimeDatabaseReady();
  await prisma.novel.create({data:{id:"book",title:"事务隔离回归"}});
  const original = await prisma.chapter.create({data:{id:"chapter",novelId:"book",order:1,title:"第一章",content:"原稿"}});
  await prisma.storyTimelineEvent.create({data:{id:"old-event",novelId:"book",chapterId:"chapter",chapterIndex:1,eventOrder:1001,title:"旧事件",summary:"原稿事件",type:"plot",status:"occurred",visibility:"reader_known",source:"chapter_extraction"}});
  await prisma.timelineHook.create({data:{id:"old-hook",novelId:"book",createdInChapterId:"chapter",createdInChapterIndex:1,title:"旧钩子",description:"原稿钩子",status:"open",priority:"high"}});
  await prisma.chapterTimeAnchor.create({data:{novelId:"book",chapterId:"chapter",chapterIndex:1,storyDayIndex:1,timeLabel:"第一天"}});
  await prisma.chapterArtifactSyncCheckpoint.create({data:{novelId:"book",chapterId:"chapter",contentHash:buildTimelineContentHash("原稿"),artifactType:"timeline_finalization",syncMode:"stable",status:"succeeded",sourceType:"chapter_runtime",sourceStage:"fixture"}});
  const service = new NovelCoreCrudService();
  service.volumeService.mirrorChapterIntoWorkspace = async () => {};
  const snapshot = async () => ({
    chapter: await prisma.chapter.findUniqueOrThrow({where:{id:"chapter"}}),
    events: await prisma.storyTimelineEvent.findMany({where:{novelId:"book"},orderBy:{id:"asc"}}),
    hooks: await prisma.timelineHook.findMany({where:{novelId:"book"},orderBy:{id:"asc"}}),
    anchors: await prisma.chapterTimeAnchor.findMany({where:{novelId:"book"},orderBy:{id:"asc"}}),
    checkpoints: await prisma.chapterArtifactSyncCheckpoint.findMany({where:{novelId:"book"},orderBy:{id:"asc"}}),
    jobs: await prisma.novelSideEffectJob.findMany({where:{novelId:"book"},orderBy:{id:"asc"}}),
  });
  const before = await snapshot();
  // Fail after text, invalidation and pending checkpoint writes, at the actual queue INSERT.
  await prisma.$executeRawUnsafe("CREATE TRIGGER reject_timeline_job BEFORE INSERT ON NovelSideEffectJob WHEN NEW.jobType = 'chapter.timelineFinalization' BEGIN SELECT RAISE(ABORT, 'test queue unavailable'); END");
  const injectedConstraint = error => error.code === "P2003";
  await assert.rejects(service.updateChapter("book","chapter",{content:"未提交修订",expectedUpdatedAt:original.updatedAt.toISOString()}),injectedConstraint);
  assert.deepEqual(await snapshot(), before, "timeline queue failure must also roll back text, editor version, manual sync revision/job and every timeline invalidation");
  await assert.rejects(service.createChapter("book",{title:"未提交章节",order:2,content:"未提交正文"}),injectedConstraint);
  assert.equal(await prisma.chapter.count({where:{novelId:"book"}}),1,"create must not leave a chapter without its durable queue job");
  assert.deepEqual(await snapshot(), before);
  assert.equal(artifactSyncs,0,"post-commit projections must not run for a rolled-back save");
  assert.equal(ragUpserts,0,"rolled-back saves must not publish RAG work");
  await prisma.$executeRawUnsafe("DROP TRIGGER reject_timeline_job");

  const saved = await service.updateChapter("book","chapter",{content:"已提交修订",expectedUpdatedAt:original.updatedAt.toISOString()});
  const pending = await snapshot();
  assert.deepEqual(pending.jobs.map(job => job.jobType).sort(), ["chapter.manualSync", "chapter.timelineFinalization"]);
  assert.equal(pending.checkpoints.filter(row=>row.syncMode === "manual_pending" && row.status === "pending").length,1);
  const context = {currentChapterIndex:1,currentTime:null,previousEvents:[],plannedEventsThisChapter:[],openHooks:[],blockingHooks:[],softHooks:[],addressedHooks:[],forbiddenEvents:[],continuityRequirements:[],latestStateChanges:[]};
  const timelineGate = {result:{status:"passed",score:1,issues:[]},extractedEvents:[{title:"修订事件",summary:"新稿事件",type:"plot",occurred:true,confidence:1,stateChanges:[],possibleHooks:[]}],extractedHooks:[],timeAnchor:{storyDayIndex:2,label:"第二天"},addressedHookIds:[],resolvedHookIds:[],extractorSucceeded:true,timelineContext:context};
  // Both stable and degraded success writes fail. No partial extracted rows may escape either transaction.
  await prisma.$executeRawUnsafe("CREATE TRIGGER reject_checkpoint_insert BEFORE INSERT ON ChapterArtifactSyncCheckpoint WHEN NEW.status = 'succeeded' BEGIN SELECT RAISE(ABORT, 'test checkpoint unavailable'); END");
  await prisma.$executeRawUnsafe("CREATE TRIGGER reject_checkpoint_update BEFORE UPDATE ON ChapterArtifactSyncCheckpoint WHEN NEW.status = 'succeeded' BEGIN SELECT RAISE(ABORT, 'test checkpoint unavailable'); END");
  const finalizer = new ChapterTimelineFinalizationService();
  await assert.rejects(finalizer.finalizeCurrentContent({novelId:"book",chapterId:"chapter",content:saved.content,sourceStage:"failure-test",timelineGate}),injectedConstraint);
  const failed = await snapshot();
  assert.deepEqual(failed.chapter,pending.chapter,"derived persistence must retain the editor version");
  assert.deepEqual(failed.events,pending.events,"events cannot commit before their success checkpoint");
  assert.deepEqual(failed.hooks,pending.hooks);
  assert.deepEqual(failed.anchors,pending.anchors,"fallback anchor cannot commit without its checkpoint");
  assert.deepEqual(failed.jobs,pending.jobs);
  assert.deepEqual(failed.checkpoints.find(row=>row.syncMode === "manual_pending"),pending.checkpoints.find(row=>row.syncMode === "manual_pending"));
  assert.equal(failed.checkpoints.filter(row=>row.contentHash === buildTimelineContentHash(saved.content) && row.status === "succeeded").length,0);
  await prisma.$executeRawUnsafe("DROP TRIGGER reject_checkpoint_insert");
  await prisma.$executeRawUnsafe("DROP TRIGGER reject_checkpoint_update");

  const completed = await finalizer.finalizeCurrentContent({novelId:"book",chapterId:"chapter",content:saved.content,sourceStage:"retry-test",timelineGate});
  assert.equal(completed.checkpointWritten,true,"a failed persistence attempt remains retryable");
  assert.equal(await prisma.storyTimelineEvent.count({where:{novelId:"book",source:"chapter_extraction",status:"occurred"}}),1);
  assert.equal(await prisma.chapterArtifactSyncCheckpoint.count({where:{chapterId:"chapter",syncMode:"manual_pending",status:"pending"}}),0);
  await assert.rejects(finalizer.finalizeCurrentContent({novelId:"book",chapterId:"chapter",content:"过期正文",sourceStage:"stale-test",timelineGate}),TimelineContentVersionError);
  assert.equal(await prisma.chapterArtifactSyncCheckpoint.count({where:{chapterId:"chapter",contentHash:buildTimelineContentHash("过期正文"),status:"succeeded"}}),0);
  assert.equal(await prisma.storyTimelineEvent.count({where:{novelId:"book",source:"chapter_extraction",status:"occurred"}}),1);
  // Another worker completes after this worker reads a failed/expired claim.
  const claimStore = new TimelineFinalizationStore();
  const findCheckpoint = prisma.chapterArtifactSyncCheckpoint.findUnique.bind(prisma.chapterArtifactSyncCheckpoint);
  for (const status of ["failed", "running"]) {
    const contentHash = "claim-race-" + status;
    const checkpoint = await prisma.chapterArtifactSyncCheckpoint.create({data:{novelId:"book",chapterId:"chapter",contentHash,artifactType:"timeline_finalization",syncMode:"stable",status,updatedAt:new Date(0)}});
    prisma.chapterArtifactSyncCheckpoint.findUnique = async input => {
      const row = await findCheckpoint(input);
      if (row && input.where.novelId_chapterId_contentHash_artifactType_syncMode?.contentHash === contentHash) {
        await prisma.chapterArtifactSyncCheckpoint.update({where:{id:checkpoint.id},data:{status:"succeeded",updatedAt:new Date(0)}});
      }
      return row;
    };
    try {
      assert.equal(await claimStore.claimCheckpoint({novelId:"book",chapterId:"chapter",contentHash,syncMode:"stable",sourceStage:"race-test",metadata:{}}),"running");
    } finally {
      prisma.chapterArtifactSyncCheckpoint.findUnique = findCheckpoint;
    }
    assert.equal((await findCheckpoint({where:{id:checkpoint.id}})).status,"succeeded","a late reclaim must not overwrite a completed checkpoint");
    assert.equal(await claimStore.claimCheckpoint({novelId:"book",chapterId:"chapter",contentHash,syncMode:"stable",sourceStage:"reentry-test",metadata:{}}),"already_done");
  }
  console.log("real SQLite save/enqueue rollback, finalization/checkpoint rollback and retry verified");
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>prisma.$disconnect());
`;
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: path.resolve(__dirname, "../.."),
    env: { ...process.env, NODE_ENV: "test", AI_NOVEL_RUNTIME: "desktop", AI_NOVEL_APP_DATA_DIR: directory,
      DATABASE_URL: `file:${path.join(directory, "fixture.db").replace(/\\/g, "/")}` },
    encoding: "utf8", timeout: 120_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}\n${result.error ?? ""}`);
});
