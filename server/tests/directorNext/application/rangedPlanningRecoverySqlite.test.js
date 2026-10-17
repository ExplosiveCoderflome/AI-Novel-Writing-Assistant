const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {initializeTemporarySqliteDatabase}=require('../../testInfrastructure/tempSqliteDatabase.cjs');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ranged-planning-recovery-'));
process.env.DATABASE_URL=initializeTemporarySqliteDatabase(directory,'recovery.db');
process.env.NODE_ENV='test';process.env.AI_NOVEL_RUNTIME='desktop';process.env.AI_NOVEL_APP_DATA_DIR=directory;
const {prisma}=require('../../../dist/db/prisma');
const {NovelVolumeService}=require('../../../dist/services/novel/volume/NovelVolumeService');
const {ChapterRouteWindowService}=require('../../../dist/services/novel/planning/ChapterRouteWindowService');
const {buildVolumeWorkspaceDocument}=require('../../../dist/services/novel/volume/volumeWorkspaceDocument');
const {directorProductionPlan}=require('../../../dist/modules/director/steps/planDefinition');
const {createChapterRouteWindowStepHandler}=require('../../../dist/modules/director/steps/planning/chapterRouteWindow');
const {createDirectorNextServices}=require('../../../dist/modules/director/bootstrap');
const {StepRegistry}=require('../../../dist/modules/director/application');
const {PrismaRunRepository,PrismaArtifactLedger,PrismaEventLog}=require('../../../dist/modules/director/infrastructure');
const {checkAction,createPlanOrchestrator}=require('../../../dist/modules/director/domain');
const {contract,runningControl}=require('../fixtures');
const {resumeBusiness}=require('../../../dist/app/director/savedContent');
let sequence=0;
test.after(()=>prisma.$disconnect());
async function fixture(){
 const novelId='book-'+(++sequence),volumeId='volume-'+sequence;
 await prisma.novel.create({data:{id:novelId,title:'第34章起续写',estimatedChapterCount:90}});
 const volumes=new NovelVolumeService();volumes.syncPayoffLedger=()=>{};
 const chapters=Array.from({length:34},(_,index)=>({id:novelId+'-plan-'+(index+1),volumeId,chapterOrder:index+1,beatKey:'opening',
  title:'已保存标题'+(index+1),summary:'已保存概要',taskSheet:'作者保留的任务',sceneCards:'作者保留的场景',payoffRefs:[],
  exclusiveEvent:'保留独占事件',endingState:'保留章末状态',nextChapterEntryState:'保留下章入口',styleContract:'保留写法约定'}));
 const initial=buildVolumeWorkspaceDocument({novelId,volumes:[{id:volumeId,novelId,sortOrder:1,title:'作者卷名',summary:'作者卷纲',
  status:'active',openingHook:'保留开卷钩子',primaryPressureSource:'保留主要压力',coreSellingPoint:'保留卖点',midVolumeRisk:'保留中段风险',payoffType:'保留兑现类型',openPayoffs:[],chapters}],beatSheets:[{volumeId,volumeSortOrder:1,status:'generated',beats:[{key:'opening',label:'开局',summary:'原节奏',chapterSpanHint:'36章',mustDeliver:['原任务']}]}]});
 await volumes.updateVolumesWithOptions(novelId,initial,{emitEvent:false,syncPayoffLedger:false,syncToChapterExecution:false});
 await volumes.updateVolumesWithOptions(novelId,{beatSheets:initial.beatSheets},{emitEvent:false,syncPayoffLedger:false,syncToChapterExecution:false});
 await prisma.chapter.createMany({data:chapters.map(plan=>({id:novelId+'-chapter-'+plan.chapterOrder,novelId,order:plan.chapterOrder,
  title:plan.title,content:plan.chapterOrder<34?'必须保留正文'+plan.chapterOrder:'',taskSheet:'已保存执行任务',sceneCards:'已保存执行场景'}))});
 const before=await volumes.getVolumes(novelId,{hydrateCanonical:false});
 const candidate={...before,volumes:before.volumes.map(volume=>({...volume,title:'不应覆盖的AI卷名',chapters:[
  {...volume.chapters[33],title:'不应覆盖的AI标题',taskSheet:'不应覆盖的AI任务'},
  ...[35,36].map(order=>({...volume.chapters[33],id:novelId+'-plan-'+order,chapterOrder:order,chapterId:null,title:'新增路线'+order,taskSheet:null,sceneCards:null})),
 ]})),beatSheets:before.beatSheets.map(sheet=>({...sheet,beats:sheet.beats.map(beat=>({...beat,summary:'不应覆盖的AI节奏'}))}))};
 return {novelId,volumeId,volumes,before,candidate};
}

test('actual production plan resumes a protected 34–36 route window, appends missing routes and preserves saved plans and prose',async()=>{
 const f=await fixture();let generations=0;
 const originalProse=await prisma.chapter.findMany({where:{novelId:f.novelId},orderBy:{order:'asc'}});
 f.volumes.generateVolumes=async(_id,options)=>{generations++;assert.equal(options.persistIntermediateDocuments,false);
  // A saved edit arrives while AI is running; the append transaction must use this latest fact.
  await prisma.volumeChapterPlan.update({where:{id:f.novelId+'-plan-34'},data:{taskSheet:'生成期间作者新任务'}});
  return f.candidate;
 };
 const routes=new ChapterRouteWindowService(f.volumes),registry=new StepRegistry();
 registry.register('volume_chapter_list',createChapterRouteWindowStepHandler({inputProvider:async()=>({targetVolumeId:f.volumeId}),
  routeService:routes,volumeService:f.volumes,contentHash:JSON.stringify}));
 const options={plan:directorProductionPlan,stepRegistry:registry,resumeBusiness,
  contractFactory:input=>contract({...input,planVersion:directorProductionPlan.version,chapterRange:{from:34,to:36}})};
 let services=createDirectorNextServices(options);
 const runs=new PrismaRunRepository(prisma),ledger=new PrismaArtifactLedger(prisma),events=new PrismaEventLog(prisma);
 const {runId}=await services.http.commandService.execute({type:'open_run',novelId:f.novelId,driver:'auto',stepIdsInScope:['volume_chapter_list'],idempotencyKey:f.novelId+'-open'});
 const base={novelId:f.novelId,scope:'book',protectedUserContent:true,producedByRunId:runId,contentHash:'saved',contentRef:'saved'};
 for(const type of ['novel_seed','story_macro','book_contract','world_skeleton','character_cast','volume_strategy','volume_beat_sheet','chapter_task_sheet'])
  await ledger.record({...base,type,status:'confirmed'});
 await ledger.record({...base,type:'volume_chapter_list',status:'stale'});
 await runs.transition(runId,{type:'start'},0);
 await events.append({runId,type:'action_rejected',payload:{code:'protected_content',action:{kind:'run_step',stepId:'volume_chapter_list'}}});
 await events.append({runId,type:'stop_signal',payload:{kind:'safety',reason:'protected_content',source:'runtime',action:'pause_for_manual'}});
 await runs.transition(runId,{type:'pause',pause:{kind:'safety',reason:'protected_content'}},1);
 services=createDirectorNextServices(options);
 await services.worker.tick();assert.equal(generations,0);
 assert.equal((await runs.getControl(runId)).status,'paused');
 const resume={type:'resume',runId,expectedVersion:2,idempotencyKey:f.novelId+'-resume'};
 await services.http.commandService.execute(resume);
 assert.equal((await services.http.commandService.execute(resume)).replayed,true);
 await services.worker.tick();await services.worker.tick();
 assert.equal((await runs.getControl(runId)).status,'completed',JSON.stringify(await events.list(runId)));assert.equal(generations,1);
 const saved=await f.volumes.getVolumes(f.novelId,{hydrateCanonical:false});
 assert.equal(saved.volumes[0].chapters.length,36);assert.equal(saved.volumes[0].title,'作者卷名');
 assert.equal(saved.volumes[0].chapters[33].title,'已保存标题34');assert.equal(saved.volumes[0].chapters[33].taskSheet,'生成期间作者新任务');
 assert.equal(saved.beatSheets[0].beats[0].summary,'原节奏');
 for(const key of ['openingHook','primaryPressureSource','coreSellingPoint','midVolumeRisk','payoffType'])assert.equal(saved.volumes[0][key],f.before.volumes[0][key]);
 for(const plan of saved.volumes[0].chapters.slice(0,34))for(const key of ['beatKey','exclusiveEvent','endingState','nextChapterEntryState','styleContract'])assert.equal(plan[key],f.before.volumes[0].chapters.find(row=>row.id===plan.id)[key]);
 const prose=await prisma.chapter.findMany({where:{novelId:f.novelId},orderBy:{order:'asc'}});
 assert.equal(prose.length,36);assert.equal(prose[32].content,'必须保留正文33');assert.equal(prose[33].taskSheet,'已保存执行任务');
 const protectedFields=rows=>rows.map(({id,order,title,content,taskSheet,sceneCards})=>({id,order,title,content,taskSheet,sceneCards}));
 assert.deepEqual(protectedFields(prose.slice(0,34)),protectedFields(originalProse));
 assert.equal(prose[34].content,'');assert.equal(prose[35].content,'');
 assert.equal((await events.list(runId)).filter(row=>row.type==='action_rejected').length,1);
 const refs=await prisma.directorNextArtifact.findMany({where:{novelId:f.novelId,type:'volume_chapter_list'},orderBy:{version:'desc'}});
 assert.equal(refs[0].protectedUserContent,true);
});

test('the production append permission does not authorize full-volume overwrite or unrelated protected steps',()=>{
 const facts={artifacts:['novel_seed','story_macro','book_contract','world_skeleton','character_cast','volume_strategy','volume_beat_sheet','chapter_task_sheet']
  .map(type=>({type,scope:'book',version:1,status:'confirmed',protectedUserContent:true})),debts:[],stopSignal:null};
 for(const range of [null,{from:0,to:36},{from:36,to:34}]){
  const verdict=checkAction({action:{kind:'run_step',stepId:'volume_chapter_list'},plan:directorProductionPlan,contract:contract({chapterRange:range}),
   control:runningControl(),facts,tokensUsed:0,rejections:0});assert.equal(verdict.code,'protected_content');
 }
 const runContract=contract({chapterRange:{from:34,to:36}});
 const action=createPlanOrchestrator().next({plan:directorProductionPlan,contract:runContract,facts});
 assert.equal(action.stepId,'volume_chapter_list');
 assert.equal(checkAction({action,plan:directorProductionPlan,contract:runContract,control:runningControl(),facts,tokensUsed:0,rejections:0}).ok,true);
 const detailFacts={...facts,artifacts:[...facts.artifacts,{type:'volume_chapter_list',scope:'book',version:1,status:'confirmed',protectedUserContent:true}]};
 assert.equal(checkAction({action:{kind:'run_step',stepId:'chapter_detail_bundle'},plan:directorProductionPlan,contract:runContract,
  control:runningControl(),facts:detailFacts,tokensUsed:0,rejections:0}).code,'protected_content');
 const stop={kind:'manual_recovery',reason:'quality pause',source:'quality',action:'pause_for_manual'};
 assert.equal(createPlanOrchestrator().next({plan:directorProductionPlan,contract:{...runContract,issuePolicy:{mode:'quality_first'}},facts:{...facts,stopSignal:stop}}).kind,'pause');
});

test('a failed route append rolls back new empty chapters, plan links and workspace together',async()=>{
 const f=await fixture(),before=await prisma.volumePlanVersion.findFirst({where:{novelId:f.novelId,status:'active'}});
 await prisma.$executeRawUnsafe(`CREATE TRIGGER reject_route_${sequence} BEFORE INSERT ON VolumeChapterPlan WHEN NEW.id = '${f.novelId}-plan-36' BEGIN SELECT RAISE(ABORT,'plan storage failed'); END`);
 await assert.rejects(f.volumes.appendMissingRoutes(f.novelId,f.candidate));
 assert.equal(await prisma.chapter.count({where:{novelId:f.novelId}}),34);
 assert.equal(await prisma.volumeChapterPlan.count({where:{volume:{novelId:f.novelId}}}),34);
 const after=await prisma.volumePlanVersion.findUnique({where:{id:before.id}});
 assert.equal(after.contentJson,before.contentJson);assert.equal(after.updatedAt.getTime(),before.updatedAt.getTime());
});
