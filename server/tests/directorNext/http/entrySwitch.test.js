const test=require('node:test');const assert=require('node:assert/strict');const express=require('express');
const {createFrozenDirectorEntry}=require('../../../dist/app/director/entrySwitch');
const boundary={isV2:async()=>true,canExecuteLegacyTask:async()=>false,canRecoverLegacyPipelineJob:async()=>false};
test('frozen workflow and recovery entrances cannot enqueue old director commands',async()=>{
 const {createFrozenWorkflowEntry,createFrozenTaskEntry,createFrozenFollowUpEntry}=require('../../../dist/app/director/entrySwitch');
 const app=express();app.use(express.json());let writes=0;
 const findTask=async id=>id==='manual'?{lane:'manual_create',novelId:'manual-book'}:id==='opening'?{lane:'auto_director',novelId:null}:{lane:'auto_director',novelId:'book'};
 app.use('/workflows',createFrozenWorkflowEntry({findTask,...boundary}));app.use('/tasks',createFrozenTaskEntry({...boundary,findTask,findPipelineOwner:async id=>id==='owned-job'?'book':null}));app.use('/follow-ups',createFrozenFollowUpEntry(boundary));app.use('/callbacks',createFrozenFollowUpEntry(boundary));
 app.use((_req,res)=>{writes++;res.json({allowed:true});});
 const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));const url='http://127.0.0.1:'+server.address().port;
 const post=(path,body={})=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  for(const suffix of ['continue','production-experience','repair-chapter-titles']){
   const response=await post('/workflows/old/'+suffix);assert.equal(response.status,409);assert.equal((await response.json()).sourceRoute,'/lab/director/book');
  }
  assert.equal((await post('/workflows/bootstrap',{lane:'auto_director',novelId:'book'})).status,409);
  assert.equal((await post('/workflows/bootstrap',{lane:'manual_create',workflowTaskId:'old'})).status,409);
  assert.equal((await post('/workflows/opening/continue')).status,409);
  for(const action of ['retry','cancel','archive'])assert.equal((await post('/tasks/novel_workflow/old/'+action)).status,409);
  for(const action of ['retry','cancel','archive'])assert.equal((await post('/tasks/novel_pipeline/owned-job/'+action)).status,409);
  for(const path of ['/tasks/recovery-candidates/novel_workflow/old/resume','/tasks/recovery-candidates/novel_workflow/opening/resume','/tasks/recovery-candidates/novel_pipeline/owned-job/resume','/tasks/recovery-candidates/resume-all'])assert.equal((await post(path)).status,409);
  for(const path of ['/follow-ups/old/actions','/follow-ups/batch-actions','/callbacks/dingtalk','/callbacks/wecom'])assert.equal((await post(path)).status,409);
  for(const path of ['/callbacks/wecom/execute','/callbacks/wecom/execute/'])assert.equal((await fetch(url+path)).status,409);assert.equal(writes,0);
  for(const [path,body] of [['/workflows/bootstrap',{lane:'auto_director'}],['/workflows/bootstrap',{lane:'auto_director',workflowTaskId:'opening'}],['/workflows/bootstrap',{lane:'manual_create',novelId:'manual-book'}],['/workflows/manual/continue',{}],['/workflows/sync-stage',{novelId:'manual-book'}],['/tasks/image/image-id/retry',{}]])assert.equal((await post(path,body)).status,200);
  assert.equal((await fetch(url+'/workflows/novels/book/auto-director')).status,200);
  assert.equal((await fetch(url+'/follow-ups/overview')).status,200);
  assert.equal((await post('/tasks/recovery-candidates/image_generation/image/resume')).status,200);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('entry switch keeps legacy reads and freezes task writes with a stable source route',async()=>{
 const app=express();let writes=0;app.use('/director',createFrozenDirectorEntry(boundary));
 app.get('/director/tasks/:id',(_req,res)=>res.json({history:true}));app.post('/director/tasks',(_req,res)=>{writes++;res.json({});});
 const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));const url='http://127.0.0.1:'+server.address().port;
 try {
  assert.equal((await fetch(url+'/director/tasks/history')).status,200);
  assert.equal((await fetch(url+'/director/tasks',{method:'POST'})).status,200);assert.equal(writes,1,'V1 pre-book form remains available');
  const response=await fetch(url+'/director/novels/book/commands',{method:'POST'});assert.equal(response.status,409);assert.equal((await response.json()).sourceRoute,'/lab/director/book');
 } finally {await new Promise(resolve=>server.close(resolve));}
});
test('frozen entries route unopened books to creation and existing task books to their director',async()=>{
 const app=express();app.use(express.json());app.use('/director',createFrozenDirectorEntry({...boundary,findTaskNovelId:async id=>id==='owned'?'book':null}));
 const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));const url='http://127.0.0.1:'+server.address().port;
 try{
  const post=async(path,body)=>{const response=await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,409);return response.json();};
  assert.equal((await post('/director/tasks',{taskType:'generate_candidates',payload:{directorVersion:'v2'}})).sourceRoute,'/create?form=long_novel');
  assert.equal((await post('/director/tasks',{taskType:'takeover',payload:{novelId:'existing'}})).sourceRoute,'/lab/director/existing');
  assert.equal((await post('/director/tasks/owned/commands',{})).sourceRoute,'/lab/director/book');
  assert.equal((await post('/director/tasks/unopened/commands',{})).sourceRoute,'/create?form=long_novel');
 }finally{await new Promise(resolve=>server.close(resolve));}
});
