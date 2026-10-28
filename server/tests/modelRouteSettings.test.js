const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');const {once}=require('node:events');
const {prisma}=require('../dist/db/prisma');
const auth=require('../dist/middleware/auth');
test.mock.method(auth,'authMiddleware',(_req,_res,next)=>next());
const router=require('../dist/routes/llm').default;
const {errorHandler}=require('../dist/middleware/errorHandler');
test('users can save an output allowance above the old administrative ceilings',async t=>{
 let saved;const original=prisma.modelRouteConfig.upsert;
 prisma.modelRouteConfig.upsert=async input=>{saved=input.create;return saved;};
 t.after(()=>{prisma.modelRouteConfig.upsert=original;});
 const app=express();app.use(express.json());app.use('/llm',router);app.use(errorHandler);
 const server=app.listen(0);await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url=`http://127.0.0.1:${server.address().port}/llm/model-routes`;
 const body={taskType:'writer',provider:'deepseek',model:'deepseek-flash',maxTokens:65536};
 const response=await fetch(url,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal(response.status,200);assert.equal(saved.maxTokens,65536);
 for(const maxTokens of [0,-1,1.5]){
  const invalid=await fetch(url,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({...body,maxTokens})});
  assert.equal(invalid.status,400);
 }
 const old={find:prisma.appSetting.findMany,save:prisma.appSetting.upsert,transaction:prisma.$transaction};
 const settings=[];
 prisma.appSetting.findMany=async()=>[];
 prisma.appSetting.upsert=async input=>{settings.push(input.create);return input.create;};
 prisma.$transaction=async operations=>Promise.all(operations);
 try{
  const fallback=await fetch(url.replace('model-routes','structured-fallback'),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({maxTokens:65536})});
  assert.equal(fallback.status,200);assert.equal((await fallback.json()).data.maxTokens,65536);
  assert.equal(settings.find(row=>row.key==='structuredFallback.maxTokens').value,'65536');
 }finally{prisma.appSetting.findMany=old.find;prisma.appSetting.upsert=old.save;prisma.$transaction=old.transaction;}
});
