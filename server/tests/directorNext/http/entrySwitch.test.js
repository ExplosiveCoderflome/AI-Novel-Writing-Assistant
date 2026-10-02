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
