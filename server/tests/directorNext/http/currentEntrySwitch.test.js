const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {createFrozenWorkflowEntry,createFrozenDirectorEntry}=require('../../../dist/app/director/entrySwitch');

test('new entry does not expose legacy current identities or enter their projection services',async()=>{
 const app=express();let legacyReads=0;
 app.use('/workflows',createFrozenWorkflowEntry({findTask:async()=>null}));
 app.use('/director',createFrozenDirectorEntry());
 app.get(['/workflows/novels/:novelId/auto-director','/director/novels/:novelId/current','/director/book-automation/:novelId'],(_req,res)=>{legacyReads++;res.json({success:true,data:{id:'old',status:'running'}});});
 const http=app.listen(0);await new Promise(resolve=>http.once('listening',resolve));
 try {
  for(const route of ['/workflows/novels/book%20%2F1/auto-director','/director/novels/book%20%2F1/current','/director/book-automation/book%20%2F1']) {
   const response=await fetch('http://127.0.0.1:'+http.address().port+route);
   assert.equal(response.status,200);const body=await response.json();
   assert.equal(body.data,null);assert.equal(body.sourceRoute,'/lab/director/book%20%2F1');
  }
  assert.equal(legacyReads,0);
 }finally{await new Promise(resolve=>http.close(resolve));}
});
