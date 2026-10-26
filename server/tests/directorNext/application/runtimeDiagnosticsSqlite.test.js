const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('../../production/batch/fixture.cjs');
const {readDirectorRuntimeStatus}=require('../../../dist/modules/director/application');
const {PrismaRunRepository,PrismaEventLog}=require('../../../dist/modules/director/infrastructure');
test('saved runtime diagnostics remain readable without production storage and never modify the database',async t=>{
 const f=await fixture(t),events=new PrismaEventLog(f.db);
 await f.db.directorNextRunControl.update({where:{runId:f.contract.runId},data:{status:'paused',version:8,
  pauseJson:JSON.stringify({kind:'manual_recovery',reason:'execution_retry_budget_exhausted'}),cursorStepId:null}});
 await events.append({runId:f.contract.runId,type:'execution_failure',payload:{stepId:'chapter_batch',message:'模型缺少明确的上下文窗口配置。'}});
 await f.db.$executeRawUnsafe('DROP TABLE "ProductionUnitRun"');
 const snapshot=async()=>JSON.stringify(await Promise.all([f.db.directorNextRun.findMany(),f.db.directorNextRunControl.findMany(),f.db.directorNextEvent.findMany(),f.db.chapter.findMany()]));
 const before=await snapshot(),deps={runRepository:new PrismaRunRepository(f.db),eventLog:events};
 for(let i=0;i<3;i++){
  const view=await readDirectorRuntimeStatus(deps,f.contract.runId,f.contract.novelId);
  assert.equal(view.status,'paused');assert.equal(view.controlVersion,8);assert.equal(view.lastFailure.code,'kernel_model_window_missing');
  assert.equal(Object.hasOwn(view,'availableActions'),false);assert.equal(Object.hasOwn(view,'progress'),false);
 }
 assert.equal(await snapshot(),before);
});
