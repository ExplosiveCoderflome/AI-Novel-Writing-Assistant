const { setup } = require('../persistence/sqliteFixture.cjs');
const assert = require('node:assert/strict');
const api = require('../../../dist/app/director/productionKernel');
async function fixture(t) {
  assert.equal(typeof api.chooseProductionBatchImplementation, 'function', 'durable batch implementation selection must be exported');
  const f = await setup(t);
  const contract = {runId:'batch-1',novelId:'novel-1',executionEpoch:0,driver:'auto',planVersion:'test-v1',scope:'chapters:1-3',
    stepIdsInScope:['chapter_batch'],chapterRange:{from:1,to:3},issuePolicy:{mode:'completion_first',version:'policy-v1'},
    modelConfig:{route:'test',model:'test',version:'model-v1'},tokenBudget:null,rejectionBudget:3};
  await f.db.novel.update({where:{id:'novel-1'},data:{directorVersion:'v2'}});
  await f.db.directorNextRun.create({data:{id:'batch-1',novelId:'novel-1',driver:'auto',planVersion:'test-v1',contractJson:JSON.stringify(contract)}});
  await f.db.directorNextRunControl.create({data:{runId:'batch-1',novelId:'novel-1',version:2,status:'running',cursorStepId:'chapter_batch',leaseOwner:'worker:1',leaseExpiresAt:new Date(Date.now()+60000)}});
  const context={runId:'batch-1',contract,control:{version:2,status:'running',pause:null,gate:null,cursorStepId:'chapter_batch',failureReason:null},
    execution:{leaseOwner:'worker:1'},facts:{artifacts:[],debts:[],stopSignal:null},step:{id:'chapter_batch'}};
  return {...f,api,contract,context};
}
module.exports={fixture};
