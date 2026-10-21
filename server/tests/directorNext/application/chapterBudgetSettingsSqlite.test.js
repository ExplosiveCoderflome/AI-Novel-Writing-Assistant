const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');

test('budget settings survive process restart while new tasks snapshot the current default',()=>{
 const root=path.resolve(__dirname,'../../../..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'chapter-budget-settings-'));
 const script=path.join(dir,'worker.cjs');
 fs.writeFileSync(script,String.raw`
const assert=require('node:assert/strict'),path=require('node:path');
const server=path.join(process.env.DIRECTOR_NEXT_REPO_ROOT,'server');
const {prisma}=require(path.join(server,'dist/db/prisma'));
const {ensureRuntimeDatabaseReady}=require(path.join(server,'dist/db/runtimeMigrations'));
const {getDirectorChapterBudgetSettings,saveDirectorChapterBudgetSettings}=require(path.join(server,'dist/services/settings/chapterBudget'));
const {createDirectorProductionOptions}=require(path.join(server,'dist/app/director/productionComposition'));
const {PrismaRunRepository}=require(path.join(server,'dist/modules/director/infrastructure'));
const {registerChapterBudgetSettingsRoutes}=require(path.join(server,'dist/routes/settings/chapterBudgetRoutes'));
const express=require(path.join(server,'node_modules/express'));
const {once}=require('node:events');
const {errorHandler}=require(path.join(server,'dist/middleware/errorHandler'));
const options=createDirectorProductionOptions(),runs=new PrismaRunRepository(prisma);
const launchInput={storyInput:'预算测试',estimatedChapterCount:3,worldMode:'skip',targetMode:'opening',provider:'openai',model:'no-model-calls',executionRange:{from:1,to:3}};
async function prepare(runId,chapterTokenLimit,novelId='book') {
 const contract=options.contractFactory({runId,novelId,driver:'auto',stepIdsInScope:null,launchInput:{...launchInput,...(chapterTokenLimit===undefined?{}:{chapterTokenLimit})}});
 await options.prepareOpen(contract);return contract;
}
(async()=>{
 if(process.argv[2]==='create'){
  await ensureRuntimeDatabaseReady();
  assert.deepEqual(await getDirectorChapterBudgetSettings(),{tokenLimit:100000});
  await prisma.novel.create({data:{id:'book',title:'预算设置测试',directorVersion:'v2'}});
  await prisma.novel.create({data:{id:'book-explicit',title:'独立任务预算',directorVersion:'v2'}});
  for(const tokenLimit of [0,16000,10000001,20000.5,'200000',null]) {
   await assert.rejects(()=>saveDirectorChapterBudgetSettings({tokenLimit}));
  }
  assert.deepEqual(await getDirectorChapterBudgetSettings(),{tokenLimit:100000});
  const app=express();app.use(express.json());registerChapterBudgetSettingsRoutes(app);app.use(errorHandler);
  const listener=app.listen(0,'127.0.0.1');await once(listener,'listening');
  const url='http://127.0.0.1:'+listener.address().port+'/auto-director/chapter-budget';
  try {
   assert.deepEqual((await (await fetch(url)).json()).data,{tokenLimit:100000});
   const put=body=>fetch(url,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
   assert.equal((await put({tokenLimit:16000})).status,400);
   assert.equal((await put({tokenLimit:200000,unknown:true})).status,400);
   assert.equal((await put({tokenLimit:200000})).status,200);
  } finally {listener.close();await once(listener,'close');}
  const saved=await prepare('saved-default');assert.equal(saved.launchInput.chapterTokenLimit,200000);await runs.open(saved);
  await saveDirectorChapterBudgetSettings({tokenLimit:300000});
  const explicit=await prepare('explicit',180000,'book-explicit');assert.equal(explicit.launchInput.chapterTokenLimit,180000);await runs.open(explicit);
  assert.equal((await prepare('new-default')).launchInput.chapterTokenLimit,300000);
 }
 assert.deepEqual(await getDirectorChapterBudgetSettings(),{tokenLimit:300000});
 assert.equal((await runs.getContract('saved-default')).launchInput.chapterTokenLimit,200000);
 assert.equal((await runs.getContract('explicit')).launchInput.chapterTokenLimit,180000);
 const saved=await runs.getContract('saved-default');
 const pipeline=require(path.join(server,'dist/services/novel/novelCorePipelineService'));
 const original=pipeline.NovelCorePipelineService.prototype.startPipelineJob;
 pipeline.NovelCorePipelineService.prototype.startPipelineJob=async(_novelId,input)=>{
  assert.equal(input.directorNext.chapterTokenLimit,200000);throw Error('snapshot-boundary-verified');
 };
 try {
  await assert.rejects(()=>options.stepRegistry.get('chapter_batch')({runId:saved.runId,contract:saved,facts:{artifacts:[],debts:[],stopSignal:null}}),/snapshot-boundary-verified/);
 } finally {pipeline.NovelCorePipelineService.prototype.startPipelineJob=original;}
 await prisma.$disconnect();
})().catch(async error=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
`);
 const env={...process.env,NODE_ENV:'test',AI_NOVEL_RUNTIME:'desktop',AI_NOVEL_APP_DATA_DIR:dir,
  DIRECTOR_NEXT_REPO_ROOT:root,DATABASE_URL:'file:'+path.join(dir,'settings.db').replace(/\\/g,'/')};
 for(const mode of ['create','restart']) {
  const result=spawnSync(process.execPath,[script,mode],{cwd:root,env,encoding:'utf8',timeout:60000});
  assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
 }
});
