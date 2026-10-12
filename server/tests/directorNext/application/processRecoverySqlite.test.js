const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

test('a separate worker recovers committed artifacts after abrupt exit without restarting paused or legacy runs', () => {
  const root = path.resolve(__dirname, '../../../..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'director-process-recovery-'));
  const script = path.join(dir, 'worker.cjs');
  fs.writeFileSync(script, String.raw`
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const server=path.join(process.env.DIRECTOR_NEXT_REPO_ROOT,'server');
const {prisma}=require(path.join(server,'dist/db/prisma'));
const {ensureRuntimeDatabaseReady}=require(path.join(server,'dist/db/runtimeMigrations'));
const {createDirectorNextServices}=require(path.join(server,'dist/modules/director'));
const {definePlan}=require(path.join(server,'dist/modules/director/domain'));
const {StepRegistry}=require(path.join(server,'dist/modules/director/application'));
const {PrismaArtifactLedger,PrismaRunRepository}=require(path.join(server,'dist/modules/director/infrastructure'));
const fixture=process.env.PROCESS_RECOVERY_FIXTURE, mode=process.argv[2];
const plan=definePlan({version:'process-test-v1',externalArtifacts:['novel_seed'],steps:[
 {id:'story_macro',label:'故事',requires:['novel_seed'],produces:'story_macro',needs:[],gateable:true,overwrites:[]},
 {id:'character_cast',label:'角色',requires:['story_macro'],produces:'character_cast',needs:[],gateable:true,overwrites:[]}
]});
const registry=new StepRegistry();
for(const step of plan.steps)registry.register(step.id,async context=>{
 const file=path.join(fixture,'calls.json'), calls=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
 calls[step.id]=(calls[step.id]??0)+1;fs.writeFileSync(file,JSON.stringify(calls));
 return {artifact:{scope:'book',status:'draft',protectedUserContent:false,contentRef:step.id+':'+context.runId,contentHash:step.id}};
});
const services=createDirectorNextServices({plan,stepRegistry:registry,
 contractFactory:input=>({runId:input.runId,novelId:input.novelId,driver:input.driver,planVersion:plan.version,scope:'book',stepIdsInScope:null,chapterRange:null,
  modelConfig:{route:'stub',model:'no-ai',version:'v1'},issuePolicy:{mode:'completion_first',version:'v1'},tokenBudget:null,rejectionBudget:3}),
 prepareOpen:async()=>[{type:'novel_seed',scope:'book',status:'confirmed',protectedUserContent:true,contentRef:'seed',contentHash:'seed'}]});
const historical=async()=>({tasks:await prisma.novelWorkflowTask.findMany({orderBy:{id:'asc'}}),commands:await prisma.directorRunCommand.findMany({orderBy:{id:'asc'}}),chapter:await prisma.chapter.findUnique({where:{id:'saved-chapter'}})});
(async()=>{
 if(mode==='crash'){
  await ensureRuntimeDatabaseReady();
  await prisma.novel.create({data:{id:'book',title:'跨进程验证'}});
  await prisma.novel.create({data:{id:'paused-book',title:'人工暂停'}});
  await prisma.chapter.create({data:{id:'saved-chapter',novelId:'book',order:1,title:'作者正文',content:'不能被恢复覆盖'}});
  await prisma.novelWorkflowTask.create({data:{id:'old-task',novelId:'book',lane:'auto_director',title:'冻结旧任务',status:'running',pendingManualRecovery:true,seedPayloadJson:'invalid seed must not be read'}});
  await prisma.directorRunCommand.create({data:{id:'old-command',taskId:'old-task',commandType:'continue',status:'queued',idempotencyKey:'old'}});
  fs.writeFileSync(path.join(fixture,'history.json'),JSON.stringify(await historical()));
  const paused=await services.http.commandService.execute({type:'open_run',novelId:'paused-book',driver:'auto',stepIdsInScope:null,idempotencyKey:'pause-fixture'});
  const repo=new PrismaRunRepository();await repo.transition(paused.runId,{type:'start'},0);
  await repo.transition(paused.runId,{type:'pause',pause:{kind:'manual_recovery',reason:'explicit-user-boundary'}},1);
  const opened=await services.http.commandService.execute({type:'open_run',novelId:'book',driver:'auto',stepIdsInScope:null,idempotencyKey:'crash-fixture'});
  fs.writeFileSync(path.join(fixture,'runs.json'),JSON.stringify({opened:opened.runId,paused:paused.runId}));
  const record=PrismaArtifactLedger.prototype.record;
  PrismaArtifactLedger.prototype.record=async function(input){await record.call(this,input);if(input.type==='story_macro')process.exit(73);};
  await services.worker.tick();throw Error('worker did not reach crash boundary');
 }
 const ids=JSON.parse(fs.readFileSync(path.join(fixture,'runs.json'),'utf8'));
 const repo=new PrismaRunRepository(), pausedBefore=await repo.getControl(ids.paused);
 assert.equal((await repo.getControl(ids.opened)).status,'running');
 assert.equal(await services.worker.tick(),false,'foreign unexpired lease must remain exclusive');
 // Advance the lease boundary in this isolated fixture; no live database or wall-clock sleep.
 await prisma.directorNextRunControl.update({where:{runId:ids.opened},data:{leaseExpiresAt:new Date(Date.now()-1000)}});
 assert.equal(await services.worker.tick(),true);
 assert.equal(await services.worker.tick(),true);
 assert.equal((await repo.getControl(ids.opened)).status,'completed');
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture,'calls.json'),'utf8')),{story_macro:1,character_cast:1});
 assert.equal(await services.worker.tick(),false);
 assert.deepEqual(await repo.getControl(ids.paused),pausedBefore);
 assert.deepEqual(JSON.parse(JSON.stringify(await historical())),JSON.parse(fs.readFileSync(path.join(fixture,'history.json'),'utf8')));
 await prisma.$disconnect();
})().catch(async error=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
`);
  const env = {...process.env, NODE_ENV:'test', AI_NOVEL_RUNTIME:'desktop', AI_NOVEL_APP_DATA_DIR:dir,
    DIRECTOR_NEXT_REPO_ROOT:root, PROCESS_RECOVERY_FIXTURE:dir, DATABASE_URL:'file:'+path.join(dir,'recovery.db').replace(/\\/g,'/')};
  const first = spawnSync(process.execPath,[script,'crash'],{cwd:root,env,encoding:'utf8',timeout:30000});
  assert.equal(first.status,73,first.stderr);
  const second = spawnSync(process.execPath,[script,'recover'],{cwd:root,env,encoding:'utf8',timeout:30000});
  assert.equal(second.status,0,second.stderr);
});
