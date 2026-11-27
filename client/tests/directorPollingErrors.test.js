import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript-legacy';
import axios from 'axios';

function interceptorHarness(){
 const notices=[];
 function load(path){
  const file=new URL(`../src/${path}.ts`,import.meta.url);
  const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  const exports={};
  const imports={axios,'@/lib/constants':{API_BASE_URL:'https://unused.invalid/api',API_TIMEOUT_MS:1000},
   '@/components/ui/toast':{toast:{error:(...args)=>notices.push(args)}}};
  vm.runInThisContext(`(function(require,exports){${source}\n})`,{filename:file.pathname})(name=>{
   if(name==='@/lib/apiErrors')return load('lib/apiErrors');
   if(name in imports)return imports[name];throw Error(`Unexpected dependency ${name}`);
  },exports);return exports;
 }
 return {client:load('api/client').apiClient,notices};
}
test('three failed polling requests stay inline and rejected; one failed user command raises one toast',async()=>{
 const {client,notices}=interceptorHarness();let calls=0;
 const adapter=async config=>{calls++;throw new axios.AxiosError('request failed','ERR_BAD_RESPONSE',config,null,
  {status:503,statusText:'Unavailable',headers:{},config,data:{success:false,error:'正文运行服务未就绪。',code:'director_projection_unavailable',requestId:'correlation'}});};
 for(let i=0;i<3;i++)await assert.rejects(client.get('/director-next/records',{adapter,errorPresentation:'inline'}),
  error=>error.status===503&&error.code==='director_projection_unavailable'&&error.requestId==='correlation');
 assert.equal(calls,3);assert.equal(notices.length,0);
 await assert.rejects(client.post('/director-next/commands',{}, {adapter}));assert.equal(notices.length,1);
 const result=await client.get('/director-next/records',{errorPresentation:'inline',adapter:async config=>({status:200,statusText:'OK',headers:{},config,data:{success:true,data:[]}})});
 assert.equal(result.data.success,true);assert.equal(notices.length,1);
});
test('network failures in polling remain observable without a global toast',async()=>{
 const {client,notices}=interceptorHarness();
 await assert.rejects(client.get('/director-next/records',{errorPresentation:'inline',adapter:async config=>{throw new axios.AxiosError('lost network','ERR_NETWORK',config);}}),/网络连接失败/);
 assert.equal(notices.length,0);
});

for(const format of ['txt','zip'])test(`${format} download conflicts preserve the final-review message and recovery action`,async()=>{
 const {client,notices}=interceptorHarness();
 const payload={success:false,error:'请在导演台确认完稿检查，再导出全书。',
  sourceRoute:'/lab/director/finished?delivery=review',sourceActionLabel:'打开完稿检查',requestId:'export-conflict'};
 const adapter=async config=>{throw new axios.AxiosError('Request failed with status code 409','ERR_BAD_RESPONSE',config,null,
  {status:409,statusText:'Conflict',headers:{'content-type':'application/json'},config,data:new Blob([JSON.stringify(payload)],{type:'application/json'})});};
 await assert.rejects(client.get(`/novels/finished/export?format=${format}`,{responseType:'blob',adapter}),error=>{
  assert.equal(error.message,'请在导演台确认完稿检查，再导出全书。');assert.equal(error.status,409);
  assert.equal(error.requestId,'export-conflict');assert.deepEqual(error.details,payload);return true;
 });
 assert.equal(notices.length,1);assert.equal(notices[0][0],'请在导演台确认完稿检查，再导出全书。');
 assert.equal(notices[0][1].action.label,'打开完稿检查');
 const previous=globalThis.window,locations=[];
 try{globalThis.window={location:{assign:route=>locations.push(route)}};notices[0][1].action.onClick();}
 finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
 assert.deepEqual(locations,['/lab/director/finished?delivery=review']);
});

test('inline download failures retain decoded errors without a global toast',async()=>{
 const {client,notices}=interceptorHarness();
 const adapter=async config=>{throw new axios.AxiosError('request failed','ERR_BAD_RESPONSE',config,null,
  {status:503,statusText:'Unavailable',headers:{},config,data:new Blob([JSON.stringify({success:false,error:'导出服务暂不可用。',code:'export_unavailable'})])});};
 await assert.rejects(client.get('/export',{responseType:'blob',adapter,errorPresentation:'inline'}),error=>error.message==='导出服务暂不可用。'&&error.code==='export_unavailable'&&error.status===503);
 assert.equal(notices.length,0);
});

test('non-JSON download failures retain their original HTTP status and fallback message',async()=>{
 const {client,notices}=interceptorHarness();
 const adapter=async config=>{throw new axios.AxiosError('Request failed with status code 409','ERR_BAD_RESPONSE',config,null,
  {status:409,statusText:'Conflict',headers:{},config,data:new Blob(['<html>Unavailable</html>'],{type:'text/html'})});};
 await assert.rejects(client.get('/export',{responseType:'blob',adapter}),error=>error.status===409&&error.message==='Request failed with status code 409');
 assert.equal(notices.length,1);assert.equal(notices[0][1]?.action,undefined);
});

test('decoded download errors cannot offer an external recovery destination',async()=>{
 const {client,notices}=interceptorHarness();
 const adapter=async config=>{throw new axios.AxiosError('request failed','ERR_BAD_RESPONSE',config,null,
  {status:409,statusText:'Conflict',headers:{},config,data:new Blob([JSON.stringify({success:false,error:'稿件待确认。',sourceRoute:'//outside.invalid/review'})])});};
 await assert.rejects(client.get('/export',{responseType:'blob',adapter}),/稿件待确认/);
 assert.equal(notices.length,1);assert.equal(notices[0][1]?.action,undefined);
});

test('successful binary downloads keep their Blob and do not raise error notices',async()=>{
 const {client,notices}=interceptorHarness(),blob=new Blob([new Uint8Array([0x50,0x4b,0x03,0x04])],{type:'application/zip'});
 const result=await client.get('/export',{responseType:'blob',adapter:async config=>({status:200,statusText:'OK',headers:{},config,data:blob})});
 assert.equal(result.data,blob);assert.equal(notices.length,0);
});
