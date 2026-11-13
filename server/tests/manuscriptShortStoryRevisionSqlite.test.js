const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const dir=fs.mkdtempSync(path.join(os.tmpdir(),"b1-short-revision-"));
Object.assign(process.env,{NODE_ENV:"test",AI_NOVEL_RUNTIME:"desktop",AI_NOVEL_APP_DATA_DIR:dir,DATABASE_URL:`file:${path.join(dir,"short.db")}`});
const runnerPath=require.resolve("../dist/prompting/core/promptRunner");
function mockOutput({asset,promptInput}){
  if(asset.id==="manuscript.chapter.extract")return {summary:promptInput.sourceText.slice(0,40),characters:[],facts:[],unresolved:[],evidence:[{quote:promptInput.sourceText.slice(0,Math.min(8,promptInput.sourceText.length))}]};
  if(asset.id==="manuscript.outline.merge")return {summary:"短篇原稿基线",theme:"",tone:"",endingDirection:"原稿结局"};
  if(asset.id==="manuscript.outline.verify")return {warnings:[]};
  if(asset.id==="manuscript.chapter.diagnose")return {diagnosticCards:[]};
  if(asset.id==="novel.chapter_editor.rewrite_candidates")return {candidates:[1,2].map(index=>({label:`修订候选${index}`,content:index===1?"修订后的短篇正文":"另一版修订后的短篇正文",summary:"保留原稿事实",rationale:"调整表达",riskNotes:[],semanticTags:[]}))};
  throw Error(`UNEXPECTED_PROMPT_ASSET:${asset.id}`);
}
require.cache[runnerPath]={id:runnerPath,filename:runnerPath,loaded:true,exports:{runStructuredPrompt:async request=>({output:request.asset.outputSchema.parse(mockOutput(request))})}};
const {prisma}=require("../dist/db/prisma");
const {ensureRuntimeDatabaseReady}=require("../dist/db/runtimeMigrations");
const {ManuscriptImportService}=require("../dist/modules/novel/manuscript/application/ManuscriptImportService");
const {ManuscriptWorkspaceService}=require("../dist/modules/novel/manuscript/application/ManuscriptWorkspaceService");
const {ManuscriptRevisionService,registerManuscriptRevisionTasks}=require("../dist/modules/novel/manuscript/application/ManuscriptRevisionService");
const {ManuscriptBaselineService,registerManuscriptBaselineTask}=require("../dist/modules/novel/manuscript/application/ManuscriptBaselineService");
const {ManuscriptTaskService}=require("../dist/modules/novel/manuscript/application/ManuscriptTasks");
const {takeManuscriptSnapshot,readActiveManuscriptChapters}=require("../dist/modules/novel/manuscript/application/ManuscriptWorkspaceService");
const {ManuscriptStructureService}=require("../dist/modules/novel/manuscript/application/ManuscriptStructureService");
const service=new ManuscriptImportService();
const baselines=new ManuscriptBaselineService();
const revisions=new ManuscriptRevisionService();
const tasks=new ManuscriptTaskService();
let sequence=0;
const key=()=>`short-revision-${++sequence}`;
test.before(async()=>{await ensureRuntimeDatabaseReady();registerManuscriptBaselineTask();registerManuscriptRevisionTasks();});
test.after(async()=>{await prisma.$disconnect();fs.rmSync(dir,{recursive:true,force:true});});

test("imported short story requires confirmed baseline before semantic revision",async()=>{
  const text="第一场\r\n\r\n第二场";
  const created=await service.create({bytes:Buffer.from(text),title:"短篇",narrativeForm:"short_story",requestKey:"short-revision-import"});
  const split=await service.split(created.sessionId,1,created.sourceHash,"rules");
  const ready=await service.partition(created.sessionId,split.version,created.sourceHash,split.units.map(unit=>({...unit,needsReview:false})));
  const result=await service.confirm(created.sessionId,ready.version,created.sourceHash,ready.coverage.coverageHash,"短篇", "short-revision-confirm");
  const project=await prisma.manuscriptProject.findUniqueOrThrow({where:{id:result.projectId}});
  const unit=await prisma.manuscriptUnit.findFirstOrThrow({where:{projectId:project.id}});
  const workspace=await new ManuscriptWorkspaceService().get(project.id,unit.id);
  const base={expectedStructureVersion:project.structureVersion,baseUnitRevision:unit.workingRevision,baseContentHash:unit.contentHash,baselineOutlineRevisionId:null,baseWorkingOutlineRevisionId:null,requestKey:"short-diagnosis"};
  const revisions=new ManuscriptRevisionService();
  await assert.rejects(()=>revisions.diagnose(project.id,unit.id,{...base,provider:"mock",model:"mock",temperature:0}),/BASELINE_REQUIRED/);
  assert.equal(workspace.currentUnit.originalText,text.slice(unit.sourceRangesJson ? JSON.parse(unit.sourceRangesJson)[0].start : 0, JSON.parse(unit.sourceRangesJson).at(-1).end));
  assert.equal(project.baselineOutlineRevisionId,null);
  assert.equal(await prisma.manuscriptRevisionProposal.count({where:{projectId:project.id,kind:"outline_baseline"}}),0);
  await assert.rejects(()=>new ManuscriptStructureService().preview(project.id,{expectedStructureVersion:project.structureVersion,requestKey:"short-structure",operations:[{kind:"insert_unit",title:"新增一节"}]}),/SHORT_STORY_STRUCTURE_UNAVAILABLE/);
  assert.equal((await prisma.novelWorkflowTask.count({where:{novelId:result.novelId}})),0);
  assert.equal((await prisma.novelIntentVersion.count({where:{novelId:result.novelId}})),0);
  assert.equal((await prisma.manuscriptRevisionProposal.count({where:{projectId:project.id,kind:{in:["diagnosis","rewrite"]}}})),0);
});

test("imported short story confirms a real baseline, adopts and withdraws a revision with CAS receipts and contiguous export",async()=>{
  const text="第一节：雨\r\n雨落在窗沿。\r\n\r\n第二节：信\r\n她拆开信封。";
  const created=await service.create({bytes:Buffer.from(text),title:"可修订短篇",narrativeForm:"short_story",requestKey:key()});
  const split=await service.split(created.sessionId,1,created.sourceHash,"rules");
  const ready=await service.partition(created.sessionId,split.version,created.sourceHash,split.units.map(unit=>({...unit,needsReview:false})));
  const confirmed=await service.confirm(created.sessionId,ready.version,created.sourceHash,ready.coverage.coverageHash,"可修订短篇",key());
  const project=await prisma.manuscriptProject.findUniqueOrThrow({where:{id:confirmed.projectId}});
  const units=await prisma.manuscriptUnit.findMany({where:{projectId:project.id},orderBy:{displayOrder:"asc"}});
  const baseline=await baselines.preview(project.id,{sourceHash:created.sourceHash,expectedStructureVersion:project.structureVersion,requestKey:key(),provider:"mock",model:"mock",temperature:0});
  assert.equal(baseline.status,"generating");
  await tasks.execute(baseline.id);
  const baselineView=await new ManuscriptWorkspaceService().proposal(project.id,baseline.id);
  assert.equal(baselineView.status,"pending");
  const frozen=await baselines.confirm(project.id,{proposalId:baseline.id,candidateRevisionId:baselineView.candidateRevisionId,sourceHash:created.sourceHash,coverageHash:baselineView.coverageHash,expectedStructureVersion:project.structureVersion,requestKey:key()});
  assert.ok(frozen.project.baselineOutlineRevisionId);
  assert.equal(frozen.project.baselineSourceType,"inferred_from_manuscript");

  const target=units[0];
  const snapshot=await takeManuscriptSnapshot(prisma,project.id,target.id);
  const base={expectedStructureVersion:snapshot.structureVersion,baseUnitRevision:snapshot.unitRevision,baseContentHash:snapshot.contentHash,baselineOutlineRevisionId:snapshot.baselineRevisionId,baseWorkingOutlineRevisionId:snapshot.workingRevisionId,requestKey:key(),operation:"polish",instruction:"调整表达",provider:"mock",model:"mock",temperature:0};
  const proposal=await revisions.rewrite(project.id,target.id,base);
  await tasks.execute(proposal.id);
  const pending=await new ManuscriptWorkspaceService().proposal(project.id,proposal.id);
  assert.equal(pending.status,"pending");
  const beforeRanges=units.map(unit=>unit.sourceRangesJson);
  await prisma.$executeRawUnsafe('CREATE TRIGGER short_revision_atomicity BEFORE UPDATE ON "ShortStorySegment" BEGIN SELECT RAISE(ABORT, \'injected short revision failure\'); END');
  try {
    await assert.rejects(()=>revisions.apply(project.id,proposal.id,{...base,requestKey:key(),candidateId:pending.candidates[0].id}));
  } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER short_revision_atomicity');
  }
  const rolledBackUnit=await prisma.manuscriptUnit.findUniqueOrThrow({where:{id:target.id}});
  const rolledBackSegment=await prisma.shortStorySegment.findFirstOrThrow({where:{novelId:confirmed.novelId,order:1}});
  assert.equal(rolledBackUnit.workingRevision,1);
  assert.equal(rolledBackSegment.content,text.slice(JSON.parse(target.sourceRangesJson)[0].start,JSON.parse(target.sourceRangesJson)[0].end));
  const applied=await revisions.apply(project.id,proposal.id,{...base,requestKey:key(),candidateId:pending.candidates[0].id});
  assert.equal(applied.afterContent,"修订后的短篇正文");
  assert.equal(applied.afterUnitRevision,applied.beforeUnitRevision+1);
  assert.equal((await prisma.manuscriptRevisionProposal.findUniqueOrThrow({where:{id:proposal.id}})).status,"applied");
  const afterApply=await prisma.manuscriptUnit.findMany({where:{projectId:project.id},orderBy:{displayOrder:"asc"}});
  const appliedSegments=await prisma.shortStorySegment.findMany({where:{novelId:confirmed.novelId},orderBy:{order:"asc"}});
  assert.equal(afterApply[0].workingRevision,2);
  assert.equal(appliedSegments[0].content,"修订后的短篇正文");
  assert.deepEqual(afterApply.map(unit=>unit.sourceRangesJson),beforeRanges);
  assert.equal((await readActiveManuscriptChapters(prisma,confirmed.novelId)).map(unit=>unit.content).join(""),appliedSegments.map(segment=>segment.content).join(""));

  const undone=await revisions.undo(project.id,proposal.id,{expectedStructureVersion:applied.structureVersion,expectedAfterHash:applied.afterHash,requestKey:key()});
  assert.equal(undone.afterContent,applied.beforeContent);
  assert.equal(undone.afterUnitRevision,applied.afterUnitRevision+1);
  const afterUndo=await prisma.manuscriptUnit.findMany({where:{projectId:project.id},orderBy:{displayOrder:"asc"}});
  const undoSegments=await prisma.shortStorySegment.findMany({where:{novelId:confirmed.novelId},orderBy:{order:"asc"}});
  assert.equal(afterUndo[0].workingRevision,3);
  assert.equal(undoSegments[0].content,applied.beforeContent);
  assert.deepEqual(afterUndo.map(unit=>unit.sourceRangesJson),beforeRanges);
  assert.equal((await readActiveManuscriptChapters(prisma,confirmed.novelId)).map(unit=>unit.content).join(""),undoSegments.map(segment=>segment.content).join(""));
  await assert.rejects(()=>revisions.undo(project.id,proposal.id,{expectedStructureVersion:applied.structureVersion,expectedAfterHash:applied.afterHash,requestKey:key()}),/REVISION_BASE_STALE/);
});
