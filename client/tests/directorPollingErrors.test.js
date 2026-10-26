import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
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
