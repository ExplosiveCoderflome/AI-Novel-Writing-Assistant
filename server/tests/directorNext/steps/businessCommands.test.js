const test=require('node:test');const assert=require('node:assert/strict');
const {resumeBusiness,cancelBusiness}=require('../../../dist/app/director/savedContent');
const {parsePipelinePayload}=require('../../../dist/services/novel/pipelineJobState');
const decision={issueCode:'quality.replan_required',action:'pause_for_manual',reason:'章节路线需要调整',locked:true,policySource:'task_snapshot',retryExhaustedAction:'pause_for_manual',chapterOrder:1};
test('explicit replan recovery requires a saved route newer than the paused job and retains issue history',async()=>{
 const job={id:'job',novelId:'book',pendingManualRecovery:true,updatedAt:new Date('2026-10-03T00:00:00Z'),payload:JSON.stringify({directorNext:{runId:'run',decisions:[decision]},replanAlertDetails:['明确需要重规划']})};
 let updated,versionTime=new Date('2026-10-02T00:00:00Z');
 const tx={directorNextEvent:{findFirst:async()=>({payloadJson:JSON.stringify({jobId:'job'})})},generationJob:{findUniqueOrThrow:async()=>job,update:async input=>{updated=input;}},volumePlanVersion:{findFirst:async()=>({updatedAt:versionTime})}};
 await assert.rejects(()=>resumeBusiness({runId:'run',novelId:'book'},tx),e=>e.statusCode===400);assert.equal(updated,undefined);
 versionTime=new Date('2026-10-03T01:00:00Z');await resumeBusiness({runId:'run',novelId:'book'},tx);
 const payload=parsePipelinePayload(updated.data.payload);assert.equal(payload.directorNext.resolvedDecisionCount,1);assert.equal(payload.directorNext.decisions.length,1);assert.equal(updated.data.pendingManualRecovery,false);
});
test('cancelling a run requests only owned jobs and leaves foreign jobs and prose untouched',async()=>{
 const updates=[];const tx={generationJob:{findMany:async()=>[
  {id:'owned',status:'running',payload:JSON.stringify({directorNext:{runId:'run',decisions:[]}})},
  {id:'foreign',status:'queued',payload:'{}'},
  {id:'pending',status:'queued',payload:JSON.stringify({directorNext:{runId:'run',decisions:[]}})}],update:async input=>updates.push(input)}};
 await cancelBusiness({runId:'run',novelId:'book'},tx);
 assert.deepEqual(updates.map(row=>row.where.id),['owned','pending']);assert.ok(updates[0].data.cancelRequestedAt instanceof Date);assert.equal(updates[0].data.status,undefined);assert.equal(updates[1].data.status,'cancelled');
});
