const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {createOriginalOpeningEntry}=require('../../../dist/app/director/opening');
const {createFrozenDirectorEntry}=require('../../../dist/app/director/entrySwitch');
test('original opening allows only pre-book candidate work and confirmation, dispatching accepted command ids',async()=>{
 const scheduled=[];const app=express();app.use(express.json());
 app.use('/director',createOriginalOpeningEntry({readTask:async id=>({novelId:id==='published'?'existing':null}),schedule:id=>scheduled.push(id)}));
 app.use('/director',createFrozenDirectorEntry());app.post('/director/tasks/:id/commands',(_req,res)=>res.status(202).json({success:true,data:{commandId:'accepted'}}));
 app.post('/director/tasks',(_req,res)=>res.status(202).json({success:true,data:{commandId:'generated'}}));
 const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));const url='http://127.0.0.1:'+server.address().port;
 try {const post=(path,body)=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await post('/director/tasks',{taskType:'generate_candidates',payload:{}})).status,202);
 for(const commandType of ['refine_candidates','patch_candidate','refine_titles','confirm_candidate'])assert.equal((await post('/director/tasks/unopened/commands',{commandType})).status,202);
 assert.equal((await post('/director/tasks/published/commands',{commandType:'confirm_candidate'})).status,409);
 assert.equal((await post('/director/tasks/unopened/commands',{commandType:'continue'})).status,409);
 assert.equal((await post('/director/tasks',{taskType:'takeover',payload:{novelId:'existing'}})).status,409);
 assert.deepEqual(scheduled,['generated','accepted','accepted','accepted','accepted']);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
