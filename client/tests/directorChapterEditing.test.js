import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {nodeStyles} from './support/nodeStyles.js';

const clientDir=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(clientDir,'tests',`.director-chapter-editing-${process.pid}.mjs`);
let run,dom,restore=[];

before(async()=>{
  // Reuse the repository's existing DOM dependency; no real server, browser or AI call.
  const {JSDOM}=createRequire(new URL('../../site/package.json',import.meta.url))('jsdom');
  dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'});
  for(const name of ['window','document','navigator','HTMLElement','HTMLInputElement','Element','Node','NodeFilter','Event','CustomEvent','MutationObserver','getComputedStyle','sessionStorage','localStorage']) {
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,name);
    restore.push(()=>descriptor ? Object.defineProperty(globalThis,name,descriptor) : delete globalThis[name]);
    Object.defineProperty(globalThis,name,{configurable:true,value:dom.window[name]});
  }
  for(const [name,value] of Object.entries({
    IS_REACT_ACT_ENVIRONMENT:true,
    ResizeObserver:class {observe(){} unobserve(){} disconnect(){}},
    EventSource:class {constructor(){this.onmessage=null;} close(){}},
    requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,
    fetch:(_url,{signal}={})=>new Promise((_resolve,reject)=>signal?.addEventListener('abort',()=>reject(new Error('aborted')))),
  })) {
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,name);
    restore.push(()=>descriptor ? Object.defineProperty(globalThis,name,descriptor) : delete globalThis[name]);
    Object.defineProperty(globalThis,name,{configurable:true,value});
  }
  dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
  dom.window.confirm=()=>true;
  const {build}=createRequire(import.meta.resolve('vite'))('esbuild');
  await build({stdin:{resolveDir:clientDir,loader:'tsx',contents:`
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import DirectorNovelPage from './src/pages/directorNext/DirectorNovelPage';
import {previewBook} from './src/pages/directorNext/workspace/previewBook';
import {queryKeys} from './src/api/queryKeys';
import {apiClient} from './src/api/client';
import {useLLMStore} from './src/store/llmStore';
export async function run(scenario) {
  const requests=[];
  let chapter={...previewBook.chapters[0],content:'alpha\\n\\nbeta',wordCount:9,updatedAt:'2026-10-11T00:00:00.000Z'};
  const book={...previewBook,novel:{...previewBook.novel,id:'book'},chapters:[chapter],
    reviewContexts:[{type:'chapter_batch_closed',novelId:'book',runId:'run',controlVersion:1,from:1,to:1,chapterId:'c1'}]};
  const metadata={id:'book',directorVersion:'v2',description:'故事方向',chapters:[chapter]};
  const view={runId:'run',novelId:'book',driver:'assisted',mode:'completed',headline:'完成',detail:null,
    chapterProgress:null,nextLaunchRange:null,progress:{done:1,total:1,source:'artifact_ledger'},
    debts:{count:0,chapterOrders:[]},availableActions:[],sourceRoute:'/lab/director/book',
    sourceTrace:{controlStatus:'completed',controlVersion:1,pauseKind:null,planVersion:'v1'}};
  const workspace={chapterMeta:{chapterId:'c1',order:1,title:chapter.title,wordCount:9,openIssueCount:0,updatedAt:chapter.updatedAt},
    macroContext:null,diagnosticCards:[],recommendedTask:null};
  const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity,gcTime:0},mutations:{gcTime:0}}});
  client.setQueryData(queryKeys.directorNext.summary('book'),{success:true,data:view});
  client.setQueryData(queryKeys.directorNext.detail('book'),{success:true,data:{view,timeline:[]}});
  client.setQueryData(['directorBookWorkspace','book'],{success:true,data:book});
  client.setQueryData(['directorNovelMetadata','book'],{success:true,data:metadata});
  client.setQueryData(queryKeys.novels.detail('book'),{success:true,data:metadata});
  client.setQueryData(queryKeys.novels.chapterEditorWorkspace('book','c1'),{success:true,data:workspace});
  useLLMStore.getState().setSelection({provider:'deepseek',model:'deepseek-flash',temperature:0.7});
  apiClient.defaults.adapter=async config=>{
    const body=config.data ? JSON.parse(config.data) : null;
    requests.push({method:config.method,url:config.url,body});
    let data;
    if(config.url==='/novels/book/chapters/c1/editor/continue-preview') data={sessionId:'s1',scope:'selection',operation:body.operation,
      targetRange:{from:body.cursorOffset,to:body.cursorOffset,text:''},activeCandidateId:'candidate-1',candidates:[
        {id:'candidate-1',label:'候选一',content:'门外响起敲门声。',summary:'承接冲突',rationale:'承接冲突',diffChunks:[{id:'i1',type:'insert',text:'门外响起敲门声。'}]},
        {id:'candidate-2',label:'候选二',content:'他抬起了头。',summary:'保留停顿',rationale:'保留停顿',diffChunks:[{id:'i2',type:'insert',text:'他抬起了头。'}]}]};
    else if(config.url==='/novels/book/chapters/c1/editor/ai-revision-preview') data={sessionId:'s2',scope:'selection',mode:'revision',
      targetRange:body.selection,activeCandidateId:'candidate-3',candidates:[{id:'candidate-3',label:'改写一',content:'新的开场',summary:'压紧表达',rationale:'保持事实',
        diffChunks:[{id:'d1',type:'delete',text:body.selection.text},{id:'i3',type:'insert',text:'新的开场'}]}]};
    else if(config.method==='post' && config.url==='/novels/book/snapshots') data={id:'snapshot'};
    else if(config.method==='put' && config.url==='/novels/book/chapters/c1') {
      if(scenario==='conflict') throw new Error('正文已被其他操作更新，请加载新保存版本。');
      chapter={...chapter,content:body.content,updatedAt:'2026-10-11T00:01:00.000Z'};data=chapter;
    } else if(config.url==='/novels/book') data={...metadata,chapters:[chapter]};
    else if(config.url==='/director-next/novels/book/workspace') data={...book,chapters:[chapter]};
    else if(config.url==='/novels/book/chapters/c1/editor/workspace') data=workspace;
    else throw new Error('Unexpected request '+config.method+' '+config.url);
    return {status:200,statusText:'OK',headers:{},config,data:{success:true,data}};
  };
  localStorage.clear();sessionStorage.clear();
  localStorage.setItem('director-follow:book','true');
  const root=createRoot(document.getElementById('root'));
  const flush=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30));});};
  const click=async label=>{
    const button=[...document.querySelectorAll('button')].find(row=>row.textContent.trim()===label);
    if(!button) throw new Error('Button not found: '+label+'; '+document.body.textContent);
    await act(async()=>button.click());await flush();
  };
  try {
    const route='/lab/director/'+(scenario==='preview' ? 'preview' : 'book')+(scenario==='review' ? '?review=chapter_batch_closed' : '');
    await act(async()=>root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}><Routes><Route path='/lab/director/:novelId' element={<DirectorNovelPage/>}/></Routes></MemoryRouter></QueryClientProvider>));
    await flush();
    if(scenario==='preview') return {hasEdit:document.body.textContent.includes('编辑正文'),requests};
    const before=document.querySelector('article').textContent;
    await click('编辑正文');
    const follow=[...document.querySelectorAll('input[type=checkbox]')].find(input=>input.parentElement.textContent.includes('跟随生成'));
    const pausedFollow=follow.disabled && follow.checked;
    const dialog=document.querySelector('[role=dialog]');
    if(!dialog) throw new Error('V2 editor did not open');
    await click(scenario==='rewrite' ? '测试选择片段' : '测试放置光标');
    await click(scenario==='rewrite' ? 'AI 优化这段' : '增加对话');
    const previewText=dialog.textContent;
    const savedBeforeAccept=chapter.content;
    if(scenario==='dirty-close') {
      await click('返回正文阅读');
      const protectedCandidate=Boolean(document.querySelector('[role=dialog]'));
      return {protectedCandidate,requests};
    }
    await click(scenario==='rewrite' ? '接受全部' : '插入正文');
    if(scenario==='conflict') return {content:chapter.content,candidateRetained:dialog.textContent.includes('插入正文'),requests};
    await click('返回正文阅读');
    return {before,pausedFollow,previewText,savedBeforeAccept,content:chapter.content,reader:document.querySelector('article').textContent,
      dialogClosed:!document.querySelector('[role=dialog]'),followRestored:!follow.disabled && follow.checked,
      routePreserved:document.body.textContent.includes(scenario==='review' ? '查看本阶段结果' : '章节正文'),requests};
  } finally {
    await act(async()=>root.unmount());client.clear();
  }
}
`},bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':path.join(clientDir,'src')},
    define:{'import.meta.env':'{}'},outfile:output,plugins:[nodeStyles,{name:'editor-input-seam',setup(build){
      // Exercise the real V2 page, shell, toolbars, candidate acceptance and API adapter.
      // Slate's DOM caret geometry is covered separately by the shared document tests.
      build.onLoad({filter:/ChapterTextEditor\.tsx$/},()=>({loader:'tsx',contents:`
import React from 'react';
export default function Editor(props) {return <div><p>{props.value}</p>
  <button onClick={()=>props.onCursorChange(5,{top:20,left:20})}>测试放置光标</button>
  <button onClick={()=>props.onSelectionChange({from:0,to:5,text:'alpha'},{top:20,left:20})}>测试选择片段</button>
</div>;}` }));
    }}]});
  ({run}=await import(pathToFileURL(output).href));
});

after(()=>{if(fs.existsSync(output)) fs.unlinkSync(output);dom?.window.close();restore.reverse().forEach(fn=>fn());});

test('V2 reader opens editor, previews dialogue, inserts only on acceptance and reloads saved prose',async()=>{
  const result=await run('continue');
  assert.equal(result.pausedFollow,true);assert.equal(result.followRestored,true,JSON.stringify(result));
  assert.equal(result.savedBeforeAccept,'alpha\n\nbeta');
  assert.match(result.previewText,/候选一/);assert.match(result.previewText,/候选二/);
  assert.equal(result.content,'alpha门外响起敲门声。\n\nbeta');
  assert.match(result.reader,/门外响起敲门声/);assert.equal(result.dialogClosed,true);
  const writes=result.requests.filter(row=>row.method!=='get');
  assert.deepEqual(writes.map(row=>row.url),['/novels/book/chapters/c1/editor/continue-preview','/novels/book/snapshots','/novels/book/chapters/c1']);
  assert.equal(writes[0].body.operation,'dialogue');assert.equal(writes[0].body.cursorOffset,5);
  assert.equal(writes[2].body.expectedUpdatedAt,'2026-10-11T00:00:00.000Z');
  assert.ok(result.requests.some(row=>row.url==='/director-next/novels/book/workspace'));
});

test('V2 editor selection rewrite preserves unselected prose and uses the same protected save',async()=>{
  const result=await run('rewrite');
  assert.equal(result.content,'新的开场\n\nbeta');
  assert.equal(result.requests.filter(row=>row.method!=='get').length,3);
  assert.ok(result.requests.every(row=>!row.url.includes('director/commands')));
});

test('V2 chapter review opens editing and returns to the same review context',async()=>{
  const result=await run('review');
  assert.match(result.before,/查看本阶段结果/);assert.match(result.reader,/查看本阶段结果/);
  assert.match(result.reader,/门外响起敲门声/);
});

test('failed save keeps the original chapter and the unaccepted continuation candidate',async()=>{
  const result=await run('conflict');
  assert.equal(result.content,'alpha\n\nbeta');assert.equal(result.candidateRetained,true);
});

test('closing the editor requires confirmation before discarding a ready AI candidate',async()=>{
  dom.window.confirm=()=>false;
  const result=await run('dirty-close');assert.equal(result.protectedCandidate,true);
});

test('V2 sample preview has no editor or network mutation entrypoint',async()=>{
  const result=await run('preview');assert.equal(result.hasEdit,false);assert.deepEqual(result.requests,[]);
});
