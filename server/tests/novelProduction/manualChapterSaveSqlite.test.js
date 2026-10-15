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
const artifacts = require("./dist/services/novel/novelChapterArtifacts");
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
