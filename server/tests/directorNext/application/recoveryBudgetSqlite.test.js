const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');

test('persisted retry budgets stop repeated process exits and zero-budget failures until explicit recovery',()=>{
 const root=path.resolve(__dirname,'../../../..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'director-recovery-budget-')),script=path.join(dir,'worker.cjs');
 fs.writeFileSync(script,String.raw`
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const server=path.join(process.env.DIRECTOR_NEXT_REPO_ROOT,'server'),fixture=process.env.BUDGET_FIXTURE,mode=process.argv[2];
const {prisma}=require(path.join(server,'dist/db/prisma'));
const {ensureRuntimeDatabaseReady}=require(path.join(server,'dist/db/runtimeMigrations'));
const {createDirectorNextServices}=require(path.join(server,'dist/modules/director'));
const {definePlan}=require(path.join(server,'dist/modules/director/domain'));
const {StepRegistry}=require(path.join(server,'dist/modules/director/application'));
const plan=definePlan({version:'retry-budget-v1',externalArtifacts:['seed'],steps:[{id:'story',label:'故事',requires:['seed'],produces:'story',needs:[],gateable:true,overwrites:[]}]});
const registry=new StepRegistry();
registry.register('story',async context=>{
 if(context.contract.novelId==='zero')throw Error('zero-budget generation failure');
 const file=path.join(fixture,'calls.json'),calls=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
 calls.push({runId:context.runId,budget:context.contract.issuePolicy.pipelinePolicy.maxAutomaticRetries});fs.writeFileSync(file,JSON.stringify(calls));
 process.exit(75);
});
const services=createDirectorNextServices({plan,stepRegistry:registry,
 contractFactory:input=>({runId:input.runId,novelId:input.novelId,driver:'auto',planVersion:plan.version,scope:'book',stepIdsInScope:null,chapterRange:null,
  modelConfig:{route:'stub',model:'no-ai',version:'v1'},issuePolicy:{mode:'completion_first',version:'frozen',pipelinePolicy:{maxAutomaticRetries:mode==='initial'&&input.novelId!=='zero'?1:0,issueActions:{}}},tokenBudget:null,rejectionBudget:3}),
 prepareOpen:async()=>[{type:'seed',scope:'book',status:'confirmed',protectedUserContent:true,contentRef:'seed',contentHash:'seed'}]});
(async()=>{
 if(mode==='initial'){
  await ensureRuntimeDatabaseReady();
  await prisma.novel.create({data:{id:'zero',title:'零重试'}});
  const zero=await services.http.commandService.execute({type:'open_run',novelId:'zero',driver:'auto',stepIdsInScope:null,idempotencyKey:'zero'});
  assert.equal(await services.worker.tick(),true);
  const paused=await prisma.directorNextRunControl.findUniqueOrThrow({where:{runId:zero.runId}});
  assert.equal(paused.status,'paused');assert.equal(await services.worker.tick(),false);
  assert.deepEqual(await prisma.directorNextRunControl.findUniqueOrThrow({where:{runId:zero.runId}}),paused);
  await services.http.commandService.execute({type:'resume',runId:zero.runId,expectedVersion:paused.version,idempotencyKey:'explicit-zero-resume'});
  assert.equal(await services.worker.tick(),true);
  assert.equal((await prisma.directorNextRunControl.findUniqueOrThrow({where:{runId:zero.runId}})).status,'paused');
  assert.equal(await prisma.directorNextEvent.count({where:{runId:zero.runId,type:'execution_failure'}}),2);
  await prisma.novel.create({data:{id:'crash',title:'反复进程中断'}});
  const opened=await services.http.commandService.execute({type:'open_run',novelId:'crash',driver:'auto',stepIdsInScope:null,idempotencyKey:'crash'});
  fs.writeFileSync(path.join(fixture,'run.json'),JSON.stringify({runId:opened.runId,zeroRunId:zero.runId}));
  await services.worker.tick();throw Error('missed abrupt exit');
 }
 const {runId,zeroRunId}=JSON.parse(fs.readFileSync(path.join(fixture,'run.json'),'utf8'));
 const zeroBefore=await prisma.directorNextRunControl.findUniqueOrThrow({where:{runId:zeroRunId}});
 assert.equal(await services.worker.tick(),false,'valid director lease cannot be taken');
 await prisma.directorNextRunControl.update({where:{runId},data:{leaseExpiresAt:new Date(Date.now()-1000)}});
 await services.worker.tick();
 assert.equal(mode,'exhausted','first recovery must reach its saved one-retry generation attempt');
 const paused=await prisma.directorNextRunControl.findUniqueOrThrow({where:{runId}});
 assert.equal(paused.status,'paused');assert.equal(JSON.parse(paused.pauseJson).reason,'execution_retry_budget_exhausted');
 assert.equal(await services.worker.tick(),false);
 assert.deepEqual(await prisma.directorNextRunControl.findUniqueOrThrow({where:{runId}}),paused);
 assert.deepEqual(await prisma.directorNextRunControl.findUniqueOrThrow({where:{runId:zeroRunId}}),zeroBefore);
 const calls=JSON.parse(fs.readFileSync(path.join(fixture,'calls.json'),'utf8'));
 assert.equal(calls.length,2);assert.ok(calls.every(call=>call.runId===runId&&call.budget===1));
 assert.equal(await prisma.directorNextEvent.count({where:{runId,type:'execution_failure'}}),2);
 assert.equal(await prisma.directorNextArtifact.count({where:{producedByRunId:runId,type:'story'}}),0);
 await prisma.$disconnect();
})().catch(async error=>{console.error(error);await prisma.$disconnect();process.exitCode=1;});
`);
 const env={...process.env,NODE_ENV:'test',AI_NOVEL_RUNTIME:'desktop',AI_NOVEL_APP_DATA_DIR:dir,DIRECTOR_NEXT_REPO_ROOT:root,BUDGET_FIXTURE:dir,DATABASE_URL:'file:'+path.join(dir,'budget.db').replace(/\\/g,'/')};
 for(const [mode,status] of [['initial',75],['recover',75],['exhausted',0]]){
  const result=spawnSync(process.execPath,[script,mode],{cwd:root,env,encoding:'utf8',timeout:30000});
  assert.equal(result.status,status,result.stderr+'\n'+result.stdout);
 }
});
