import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath,pathToFileURL} from "node:url";
import {nodeStyles} from "./support/nodeStyles.js";
const clientDir=fileURLToPath(new URL("../",import.meta.url)),output=path.join(clientDir,"tests",`.b1-interactions-${process.pid}.mjs`);
let run,dom,restore=[];
before(async()=>{
 const {JSDOM}=createRequire(new URL("../../site/package.json",import.meta.url))("jsdom");
 dom=new JSDOM('<div id="root"></div>',{url:"http://localhost/"});
 for(const name of ["window","document","navigator","HTMLElement","HTMLInputElement","Element","Node","NodeFilter","Event","CustomEvent","MutationObserver","getComputedStyle","sessionStorage","localStorage"]) {const descriptor=Object.getOwnPropertyDescriptor(globalThis,name);restore.push(()=>descriptor?Object.defineProperty(globalThis,name,descriptor):delete globalThis[name]);Object.defineProperty(globalThis,name,{configurable:true,value:dom.window[name]});}
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,"IS_REACT_ACT_ENVIRONMENT");restore.push(()=>descriptor?Object.defineProperty(globalThis,"IS_REACT_ACT_ENVIRONMENT",descriptor):delete globalThis.IS_REACT_ACT_ENVIRONMENT);globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});dom.window.confirm=()=>true;
 const {build}=createRequire(import.meta.resolve("vite"))("esbuild");
 await build({stdin:{resolveDir:clientDir,loader:"tsx",contents:`
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import Page from './src/pages/novels/manuscript/ManuscriptRevisionPage';
import {apiClient} from './src/api/client';
export async function run(scenario) {
 const requests=[];window.matchMedia=()=>({matches:scenario==='mobile',addEventListener(){},removeEventListener(){}});
 const source={id:'source',sourceHash:'immutable-source',rawHash:'raw',version:1,charCount:19,byteCount:30,encoding:'utf-8',originalFileName:'test.txt'};
 let unit={id:'u1',chapterId:'c1',title:'来信',displayOrder:1,status:'active',workingRevision:1,contentHash:'old-hash',sourceRanges:[{start:0,end:9}],content:'原稿正文',originalText:'原稿正文',updatedAt:'2026-11-11T09:00:00Z'};
 const second={...unit,id:'u2',chapterId:'c2',title:'出港',displayOrder:2,content:'第二章不变'};
 let proposal=null;
 const project={id:'project',novelId:'book',title:'雾港原稿',structureVersion:1,baselineOutlineRevisionId:scenario==='unconfirmed'?null:'frozen',baselineOutlineProjectId:'baseline',workingOutlineProjectId:'working',workingOutlineRevisionId:'working-r1'};
 const workspace=()=>({project,source,units:[unit,second],currentUnit:unit,proposals:proposal?[proposal]:[],syncState:'complete'});
 apiClient.defaults.adapter=async config=>{
  const body=config.data?JSON.parse(config.data):null;requests.push({url:config.url,method:config.method,body});let data;
  if(config.url.includes('/workspace'))data=workspace();
  else if(config.url.endsWith('/revision-previews')) {proposal={id:'p1',unitId:'u1',kind:'revision',status:scenario==='stale'?'stale':'pending',candidates:[{id:'candidate-1',label:'方案一',content:'候选正文',summary:'丰富逃离过程，身份不变',diffChunks:[{id:'d1',type:'delete',text:'原稿正文'},{id:'i1',type:'insert',text:'候选正文'}]}]};data=proposal;}
  else if(config.url.endsWith('/apply')) {if(scenario==='conflict')throw Object.assign(new Error('本章或工作大纲有更新，候选已过期。'),{response:{status:409,data:{success:false,error:'本章或工作大纲有更新，候选已过期。'}},config});unit={...unit,content:'候选正文',contentHash:'after-hash',workingRevision:2};proposal={...proposal,status:'applied',appliedReceipt:{beforeContent:'原稿正文',afterHash:'after-hash'}};data={saved:true};}
  else if(config.url.endsWith('/manual-save')){unit={...unit,content:body.content,contentHash:'manual-hash',workingRevision:2};data={saved:true};}
  else if(config.url.endsWith('/undo')){unit={...unit,content:'原稿正文',contentHash:'undo-hash',workingRevision:3};data={saved:true};}
  else if(config.url.endsWith('/reject')){proposal={...proposal,status:'rejected'};data={};}
  else throw new Error('Unexpected B1 request '+config.url);
  return {data:{success:true,data},status:200,statusText:'OK',headers:{},config};
 };
 const cache=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0},mutations:{retry:false,gcTime:0}}});
 const root=createRoot(document.getElementById('root'));
 const flush=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});};
 const click=async(label)=>{const button=[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===label);if(!button)throw Error('Missing '+label+': '+document.body.textContent);if(button.disabled)throw Error('Disabled '+label);await act(async()=>button.click());await flush();};
 try {
  await act(async()=>root.render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={['/novels/book/revision']}><Routes><Route path='/novels/:id/revision' element={<Page/>}/></Routes></MemoryRouter></QueryClientProvider>));await flush();
  if(scenario==='mobile'||scenario==='unconfirmed') return {text:document.body.textContent,requests,unit,second};
  if(scenario==='manual') {await click('测试手改');const blocked=[...document.querySelectorAll('button')].find(button=>button.textContent==='生成修文候选').disabled;await click('保存当前手改');return {blocked,text:document.body.textContent,requests,unit,second};}
  await click('生成修文候选');const before=unit.content;const beforeText=document.body.textContent;
  if(scenario==='stale')return {before,beforeText,disabled:[...document.querySelectorAll('button')].find(button=>button.textContent==='采纳并保存本章').disabled,requests,unit};
  if(scenario==='reject'){await click('放弃候选');return {before,text:document.body.textContent,requests,unit};}
  await click('采纳并保存本章');
  if(scenario==='undo')await click('撤回最新采纳');
  return {before,beforeText,text:document.body.textContent,requests,unit,second};
 } finally {await act(async()=>root.unmount());cache.clear();}
}
`},bundle:true,platform:"node",format:"esm",packages:"external",alias:{"@":path.join(clientDir,"src")},define:{"import.meta.env":"{}"},outfile:output,plugins:[nodeStyles,{name:"b1-text-editor-seam",setup(build){build.onLoad({filter:/ChapterTextEditor\.tsx$/},()=>({loader:"tsx",contents:`import React from 'react';export default function Editor(props){return <div><p>{props.value}</p><button onClick={()=>props.onChange(props.value+'手改')}>测试手改</button></div>;}`}));}}]});
 ({run}=await import(pathToFileURL(output).href));
});
after(()=>{if(fs.existsSync(output))fs.unlinkSync(output);dom?.window.close();restore.reverse().forEach(fn=>fn());});
test("B1预览不写正文，显式采纳只传候选ID且不自动下一章",async()=>{const result=await run("apply");assert.equal(result.before,"原稿正文");assert.equal(result.unit.content,"候选正文");assert.equal(result.second.content,"第二章不变");assert.ok(result.text.includes("候选已采纳并保存，仅改动本章"));const apply=result.requests.find(item=>item.url.endsWith("/apply"));assert.equal(apply.body.candidateId,"candidate-1");assert.equal(apply.body.baseContentHash,"old-hash");assert.equal(apply.body.content,undefined);assert.equal(result.requests.filter(item=>item.url.includes("revision-previews")).length,1);});
test("B1手改先保存，生成候选保持禁用，刷新后正文不回跳",async()=>{const result=await run("manual");assert.equal(result.blocked,true);assert.equal(result.unit.content,"原稿正文手改");assert.ok(!result.text.includes("有未保存手改"));const save=result.requests.find(item=>item.url.endsWith("/manual-save"));assert.equal(save.body.baseContentHash,"old-hash");assert.equal(save.body.baseUnitRevision,1);});
test("B1过期候选保持可对照但不可覆盖",async()=>{const result=await run("stale");assert.equal(result.disabled,true);assert.equal(result.unit.content,"原稿正文");assert.match(result.beforeText,/候选仅供对照/);});
test("B1拒绝候选不写正文",async()=>{const result=await run("reject");assert.equal(result.unit.content,"原稿正文");assert.ok(result.requests.some(item=>item.url.endsWith("/reject")));assert.ok(!result.requests.some(item=>item.url.endsWith("/apply")));});
test("B1撤回使用afterHash并留在本章",async()=>{const result=await run("undo");assert.equal(result.unit.content,"原稿正文");assert.equal(result.second.content,"第二章不变");assert.equal(result.requests.find(item=>item.url.endsWith("/undo")).body.expectedAfterHash,"after-hash");});
test("B1采纳冲突保留工作正文与待审候选",async()=>{const result=await run("conflict");assert.equal(result.unit.content,"原稿正文");assert.match(result.text,/候选已过期/);assert.match(result.text,/方案一/);});
test("B1手机深链不装配桌面工作区，不请求模型或数据",async()=>{const result=await run("mobile");assert.match(result.text,/请在电脑端导入或确认结构修订/);assert.equal(result.requests.length,0);});
test("B1未确认原纲时不自动开始反推或修文",async()=>{const result=await run("unconfirmed");assert.match(result.text,/确认原纲后启用 AI 修文/);assert.equal(result.requests.filter(item=>item.method!=="get").length,0);});
