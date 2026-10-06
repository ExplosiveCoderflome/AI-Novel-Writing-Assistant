const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

test('saved gates survive process exits at opening, waiting and edited confirmation without replaying protected content', () => {
  const root = path.resolve(__dirname, '../../../..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'director-gate-process-'));
  const script = path.join(dir, 'gate-worker.cjs');
  fs.writeFileSync(script, String.raw`
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const server=path.join(process.env.DIRECTOR_NEXT_REPO_ROOT,'server'), fixture=process.env.GATE_PROCESS_FIXTURE;
const {prisma}=require(path.join(server,'dist/db/prisma'));
const {ensureRuntimeDatabaseReady}=require(path.join(server,'dist/db/runtimeMigrations'));
const {createDirectorNextServices}=require(path.join(server,'dist/modules/director'));
const {definePlan,createGateOrchestrator}=require(path.join(server,'dist/modules/director/domain'));
const {StepRegistry,FactsLoader}=require(path.join(server,'dist/modules/director/application'));
const {PrismaArtifactLedger,PrismaRunRepository,PrismaQualityDebtRepository,PrismaEventLog}=require(path.join(server,'dist/modules/director/infrastructure'));
const mode=process.argv[2], plan=definePlan({version:'gate-process-v1',externalArtifacts:['novel_seed','chapter_draft'],steps:[
 {id:'macro',label:'故事',requires:['novel_seed'],produces:'story_macro',needs:[],gateable:true,overwrites:['story_macro']},
 {id:'cast',label:'角色',requires:['story_macro'],produces:'character_cast',needs:[],gateable:false,overwrites:['character_cast']}
]});
const file=name=>path.join(fixture,name+'.json');
const save=(name,value)=>fs.writeFileSync(file(name),JSON.stringify(value));
const read=name=>JSON.parse(fs.readFileSync(file(name),'utf8'));
const registry=new StepRegistry();
for(const step of plan.steps)registry.register(step.id,async context=>{
 const calls=fs.existsSync(file('calls'))?read('calls'):{};
 calls[step.id]=(calls[step.id]??0)+1;save('calls',calls);
 return {artifact:{scope:'book',status:step.gateable?'draft':'confirmed',protectedUserContent:false,
   contentRef:step.id+':'+context.contract.novelId,contentHash:'generated-'+step.id}};
});
const services=createDirectorNextServices({plan,stepRegistry:registry,
 contractFactory:input=>({runId:input.runId,novelId:input.novelId,driver:input.driver,planVersion:plan.version,scope:'book',
   stepIdsInScope:input.stepIdsInScope,chapterRange:null,modelConfig:{route:'stub',model:'no-ai',version:'v1'},
   issuePolicy:{mode:'completion_first',version:'v1'},tokenBudget:null,rejectionBudget:3}),
 prepareOpen:async()=>[{type:'novel_seed',scope:'book',status:'confirmed',protectedUserContent:true,contentRef:'seed',contentHash:'seed'}],
 // A saved-content port fixture, not the production AI generator or editor.
 readEditedArtifact:async({contract,type,contentRef},tx)=>{
   assert.equal(type,'story_macro');
   const novel=await tx.novel.findUniqueOrThrow({where:{id:contract.novelId}});
   return {contentRef,contentHash:novel.description};
 }});
const runs=new PrismaRunRepository(), ledger=new PrismaArtifactLedger();
const factsLoader=new FactsLoader({runRepository:runs,artifactLedger:ledger,qualityDebtRepository:new PrismaQualityDebtRepository(),eventLog:new PrismaEventLog()});
const history=async()=>({chapter:await prisma.chapter.findUniqueOrThrow({where:{id:'saved-chapter'}}),
 task:await prisma.novelWorkflowTask.findUniqueOrThrow({where:{id:'old-task'}}),
 commands:await prisma.directorRunCommand.findMany({orderBy:{id:'asc'}})});
const snapshot=async runId=>({control:await prisma.directorNextRunControl.findUniqueOrThrow({where:{runId}}),
 artifacts:await prisma.directorNextArtifact.findMany({where:{novelId:'book'},orderBy:{id:'asc'}}),
 events:await prisma.directorNextEvent.findMany({where:{runId},orderBy:{seq:'asc'}}),
 commands:await prisma.directorNextCommand.findMany({where:{runId},orderBy:{id:'asc'}})});
const next=async runId=>createGateOrchestrator().next({plan,...await factsLoader.load(runId)});
(async()=>{
 if(mode==='open'){
  await ensureRuntimeDatabaseReady();
  await prisma.novel.create({data:{id:'book',title:'阶段跨进程验证',description:'saved-original'}});
  await prisma.chapter.create({data:{id:'saved-chapter',novelId:'book',order:1,title:'作者正文',content:'正文不能被重算覆盖'}});
  await prisma.novelWorkflowTask.create({data:{id:'old-task',novelId:'book',lane:'auto_director',title:'历史',status:'running',seedPayloadJson:'must not read'}});
  await prisma.directorRunCommand.create({data:{id:'old-command',taskId:'old-task',commandType:'continue',status:'queued',idempotencyKey:'old'}});
  const opened=await services.http.commandService.execute({type:'open_run',novelId:'book',driver:'assisted',stepIdsInScope:null,idempotencyKey:'open'});
  save('run',opened.runId);
  await ledger.record({novelId:'book',type:'character_cast',scope:'book',status:'confirmed',protectedUserContent:false,contentRef:'old-cast',contentHash:'old'});
  await ledger.record({novelId:'book',type:'chapter_draft',scope:'chapter:1',status:'user_edited',protectedUserContent:true,contentRef:'chapter:saved-chapter',contentHash:'author'});
  assert.equal(await services.worker.tick(),true);
  assert.equal(await services.worker.tick(),true);
  assert.equal((await runs.getControl(opened.runId)).status,'waiting_gate');
  save('waiting',await snapshot(opened.runId));save('history',await history());
  process.exit(73);
 }
 const runId=read('run');
 if(mode==='wait'){
  assert.equal((await runs.getControl(runId)).status,'waiting_gate');
  assert.deepEqual((await next(runId)).artifactTypes,['story_macro']);
  assert.equal(await services.worker.tick(),false,'waiting for confirmation is not worker work');
  await services.http.projectionService.get(runId);
  assert.deepEqual(JSON.parse(JSON.stringify(await snapshot(runId))),read('waiting'));
  // A waiting book must not prevent another book from completing its authorized range.
  await prisma.novel.create({data:{id:'other',title:'另一书'}});
  const other=await services.http.commandService.execute({type:'open_run',novelId:'other',driver:'auto',stepIdsInScope:[],idempotencyKey:'other'});
  assert.equal(await services.worker.tick(),true);
  assert.equal((await runs.getControl(other.runId)).status,'completed');
  assert.deepEqual(JSON.parse(JSON.stringify(await snapshot(runId))),read('waiting'));
  assert.deepEqual(read('calls'),{macro:1});
  process.exit(74);
 }
 if(mode==='edit'){
  await prisma.novel.update({where:{id:'book'},data:{description:'saved-user-edit'}});
  const control=await runs.getControl(runId);
  await services.http.commandService.execute({type:'resolve_gate',runId,decision:'confirm_after_edit',expectedVersion:control.version,idempotencyKey:'edited'});
  const refs=await ledger.listByNovel('book');
  const macro=refs.find(a=>a.type==='story_macro'&&a.version===2);
  assert.equal(macro.status,'user_edited');assert.equal(macro.protectedUserContent,true);
  assert.equal(refs.find(a=>a.type==='character_cast').status,'stale');
  assert.deepEqual(await next(runId),{kind:'run_step',stepId:'cast'});
  save('edited',await snapshot(runId));process.exit(75);
 }
 assert.deepEqual(JSON.parse(JSON.stringify(await snapshot(runId))),read('edited'));
 assert.deepEqual(await next(runId),{kind:'run_step',stepId:'cast'});
 assert.equal(await services.worker.tick(),false,'the original worker lease is still valid');
 await prisma.directorNextRunControl.update({where:{runId},data:{leaseExpiresAt:new Date(Date.now()-1000)}});
 assert.equal(await services.worker.tick(),true);assert.equal(await services.worker.tick(),true);
 assert.equal((await runs.getControl(runId)).status,'completed');
 assert.deepEqual(read('calls'),{macro:1,cast:1});
 const final=await snapshot(runId), macro=final.artifacts.find(a=>a.type==='story_macro'&&a.version===2);
 assert.equal(macro.contentHash,'saved-user-edit');assert.equal(macro.protectedUserContent,true);
 assert.equal(final.artifacts.filter(a=>a.type==='story_macro').length,2);
 const beforeDraft=read('waiting').artifacts.find(a=>a.type==='chapter_draft');
 assert.deepEqual(JSON.parse(JSON.stringify(final.artifacts.find(a=>a.type==='chapter_draft'))),beforeDraft);
 const replay=await services.http.commandService.execute({type:'resolve_gate',runId,decision:'confirm_after_edit',expectedVersion:read('waiting').control.version,idempotencyKey:'edited'});
 assert.equal(replay.replayed,true);
 assert.deepEqual(await snapshot(runId),final);
 assert.deepEqual(JSON.parse(JSON.stringify(await history())),read('history'));
 await prisma.$disconnect();
})().catch(async error=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
`);
  const env = {...process.env, NODE_ENV:'test', AI_NOVEL_RUNTIME:'desktop', AI_NOVEL_APP_DATA_DIR:dir,
    DIRECTOR_NEXT_REPO_ROOT:root, GATE_PROCESS_FIXTURE:dir,
    DATABASE_URL:'file:'+path.join(dir,'gates.db').replace(/\\/g,'/')};
  for (const [mode,expected] of [['open',73],['wait',74],['edit',75],['recover',0]]) {
    const result = spawnSync(process.execPath,[script,mode],{cwd:root,env,encoding:'utf8',timeout:30000});
    assert.equal(result.status,expected,`${mode}: ${result.stderr}\n${result.stdout}`);
  }
});
