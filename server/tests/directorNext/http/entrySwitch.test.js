const test=require('node:test');const assert=require('node:assert/strict');const express=require('express');
const {createFrozenDirectorEntry}=require('../../../dist/app/director/entrySwitch');
test('entry switch keeps legacy reads and freezes task writes with a stable source route',async()=>{
 const app=express();let writes=0;app.use('/director',createFrozenDirectorEntry());
 app.get('/director/tasks/:id',(_req,res)=>res.json({history:true}));app.post('/director/tasks',(_req,res)=>{writes++;res.json({});});
 const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));const url='http://127.0.0.1:'+server.address().port;
 try {
  assert.equal((await fetch(url+'/director/tasks/history')).status,200);
  assert.equal((await fetch(url+'/director/tasks',{method:'POST'})).status,409);assert.equal(writes,0);
  const response=await fetch(url+'/director/novels/book/commands',{method:'POST'});assert.equal(response.status,409);assert.equal((await response.json()).sourceRoute,'/lab/director/book');
 } finally {await new Promise(resolve=>server.close(resolve));}
});
test('frozen entries route unopened books to creation and existing task books to their director',async()=>{
 const app=express();app.use(express.json());app.use('/director',createFrozenDirectorEntry({findTaskNovelId:async id=>id==='owned'?'book':null}));
 const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));const url='http://127.0.0.1:'+server.address().port;
 try{
  const post=async(path,body)=>{const response=await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,409);return response.json();};
  assert.equal((await post('/director/tasks',{taskType:'generate_candidates'})).sourceRoute,'/create?form=long_novel');
  assert.equal((await post('/director/tasks',{taskType:'takeover',payload:{novelId:'existing'}})).sourceRoute,'/lab/director/existing');
  assert.equal((await post('/director/tasks/owned/commands',{})).sourceRoute,'/lab/director/book');
  assert.equal((await post('/director/tasks/unopened/commands',{})).sourceRoute,'/create?form=long_novel');
 }finally{await new Promise(resolve=>server.close(resolve));}
});
