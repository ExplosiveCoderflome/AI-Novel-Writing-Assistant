import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { webcrypto } from 'node:crypto';

const clientDir = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(clientDir, 'tests', `.director-commands-${process.pid}.mjs`);
let exercise, exerciseContinuation;

before(async () => {
  const { build } = createRequire(import.meta.resolve('vite'))('esbuild');
  await build({
    stdin: { resolveDir: clientDir, loader: 'tsx', contents: `
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {captured} from 'test-command-hooks';
import {apiClient} from './src/api/client';
import {useLLMStore} from './src/store/llmStore';
import DirectorStart from './src/components/directorNext/DirectorStart';
import DirectorGate from './src/components/directorNext/DirectorGate';
import DirectorDriveSwitch from './src/components/directorNext/DirectorDriveSwitch';
import DirectorBadge from './src/components/directorNext/DirectorBadge';
import DirectorNovelPage from './src/pages/directorNext/DirectorNovelPage';
import {previewBook} from './src/pages/directorNext/workspace/previewBook';
import {queryKeys} from './src/api/queryKeys';
export async function exerciseContinuation(driver) {
  useLLMStore.getState().setSelection({provider:'deepseek',model:'deepseek-flash',temperature:0.7});
  Object.assign(useLLMStore.getInitialState(),useLLMStore.getState());
  const posts=[];
  apiClient.defaults.adapter=async config=>{
    if(config.method!=='post' || config.url!=='/director-next/commands') throw new Error('Unexpected request');
    posts.push(JSON.parse(config.data));
    return {status:200,statusText:'OK',headers:{},config,data:{success:true,data:{runId:'next-run',controlVersion:1}}};
  };
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const view={runId:'previous-run',novelId:'book',driver,mode:'completed',headline:'规划完成',detail:null,
    nextActionGuidance:'选择正文范围',chapterProgress:null,nextLaunchRange:{from:1,to:10},progress:{done:7,total:7,source:'artifact_ledger'},
    debts:{count:0,chapterOrders:[]},availableActions:[{id:'open_run',command:'open_run',kind:'command',primary:true,label:'继续写作'}],sourceRoute:'/lab/director/book',
    sourceTrace:{controlStatus:'completed',controlVersion:17,pauseKind:null,planVersion:'v1'}};
  client.setQueryData(queryKeys.directorNext.summary('book'),{success:true,data:view});
  client.setQueryData(queryKeys.directorNext.detail('book'),{success:true,data:{view,timeline:[]}});
  client.setQueryData(['directorBookWorkspace','book'],{success:true,data:{...previewBook,novel:{...previewBook.novel,id:'book',estimatedChapterCount:30},chapters:[]}});
  client.setQueryData(['directorNovelMetadata','book'],{success:true,data:{description:'故事方向'}});
  try {
    captured.length=0;
    renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/lab/director/book']}><Routes><Route path='/lab/director/:novelId' element={<DirectorNovelPage/>}/></Routes></MemoryRouter></QueryClientProvider>);
    await captured.at(-1).mutationFn();
    return posts;
  } finally {client.clear();}
}
export async function exercise() {
  useLLMStore.getState().setSelection({provider:'deepseek',model:'deepseek-flash',temperature:0.7});
  Object.assign(useLLMStore.getInitialState(),useLLMStore.getState());
  const posts=[];
  apiClient.defaults.adapter=async config=>{
    if(config.method!=='post' || config.url!=='/director-next/commands') throw new Error('Unexpected request');
    posts.push(JSON.parse(config.data));
    return {status:200,statusText:'OK',headers:{},config,data:{success:true,data:{runId:'run',controlVersion:18}}};
  };
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  async function submit(element,argument) {
    captured.length=0;
    renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>);
    await captured.at(-1).mutationFn(argument);
  }
  const props={runId:'run',novelId:'book',expectedVersion:17};
  const view={runId:'run',novelId:'book',driver:'auto',mode:'paused',headline:'暂停',detail:null,
    nextActionGuidance:'继续',chapterProgress:null,nextLaunchRange:null,progress:{done:7,total:7,source:'artifact_ledger'},
    debts:{count:0,chapterOrders:[]},availableActions:[],sourceRoute:'/lab/director/book',
    sourceTrace:{controlStatus:'paused',controlVersion:17,pauseKind:'manual_recovery',planVersion:'v1'}};
  try {
    await submit(<DirectorStart novelId='book' estimatedChapterCount={30} nextChapter={1} initialStory='故事方向' suggestedRange={{from:1,to:10}}/>);
    for(const decision of ['confirm','confirm_after_edit','regenerate']) await submit(<DirectorGate {...props}/>,decision);
    await submit(<DirectorDriveSwitch {...props} toDriver='assisted' label='切换'/>);
    for(const command of ['resume','cancel','resume']) {
      const action={id:command,command,kind:'command',label:'处理',primary:true};
      await submit(<DirectorBadge novelId='book' view={{...view,availableActions:[action]}}/>,action);
    }
    return posts;
  } finally {client.clear();}
}` },
    bundle: true, platform: 'node', format: 'esm', packages: 'external',
    alias: {'@':path.join(clientDir,'src')}, define: {'import.meta.env':'{}'}, outfile: output,
    plugins: [{name:'capture-real-mutation-options',setup(build) {
      build.onResolve({filter:/^(@tanstack\/react-query|test-command-hooks)$/},args=>{
        if(args.path==='test-command-hooks' || /Director(?:Start|Gate|DriveSwitch|Badge)\.tsx$/.test(args.importer)) {
          return {path:'test-command-hooks',namespace:'command-test'};
        }
      });
      build.onLoad({filter:/.*/,namespace:'command-test'},()=>({loader:'js',resolveDir:clientDir,contents:`
import {useMutation as realUseMutation} from '@tanstack/react-query';
export * from '@tanstack/react-query';
export const captured=[];
export function useMutation(options) {captured.push(options);return realUseMutation(options);}
`}));
    }}],
  });
  ({exercise,exerciseContinuation}=await import(pathToFileURL(output).href));
});

after(() => {if(fs.existsSync(output)) fs.unlinkSync(output);});

async function withCrypto(value, action) {
  const original=Object.getOwnPropertyDescriptor(globalThis,'crypto');
  Object.defineProperty(globalThis,'crypto',{configurable:true,value});
  try {return await action();}
  finally {if(original) Object.defineProperty(globalThis,'crypto',original);else delete globalThis.crypto;}
}

function assertCommands(posts) {
  assert.equal(posts.length,8);
  const keys=posts.map(({idempotencyKey})=>idempotencyKey);
  assert.ok(keys.every(key=>typeof key==='string' && key.length>0));
  assert.equal(new Set(keys).size,8,'separate submissions must not share an idempotency key');
  const {idempotencyKey,...launch}=posts[0];
  assert.deepEqual(launch,{type:'open_run',novelId:'book',driver:'assisted',stepIdsInScope:null,
    launchInput:{storyInput:'故事方向',estimatedChapterCount:30,worldMode:'skip',targetMode:'opening',provider:'deepseek',
      model:'deepseek-flash',temperature:0.7,issuePolicyMode:'completion_first',executionRange:{from:1,to:10}}});
  for(const [index,decision] of ['confirm','confirm_after_edit','regenerate'].entries()) {
    const {idempotencyKey,...command}=posts[index+1];
    assert.deepEqual(command,{type:'resolve_gate',runId:'run',decision,expectedVersion:17});
  }
  const {idempotencyKey:handoffKey,...handoff}=posts[4];
  assert.deepEqual(handoff,{type:'handoff',runId:'run',toDriver:'assisted',expectedVersion:17});
  for(const [index,type] of ['resume','cancel','resume'].entries()) {
    const {idempotencyKey,...command}=posts[index+5];
    assert.deepEqual(command,{type,runId:'run',expectedVersion:17});
  }
}

test('LAN HTTP can submit production, every gate decision, mode switch, resume and cancel without randomUUID',async()=>{
  const posts=await withCrypto({getRandomValues:bytes=>webcrypto.getRandomValues(bytes)},exercise);
  assertCommands(posts);
});

test('secure contexts retain working native UUID command submissions',async()=>{
  const posts=await withCrypto(webcrypto,exercise);
  assertCommands(posts);
});

test('commands remain distinct without crypto even in the same clock tick',async()=>{
  const originalNow=Date.now,originalRandom=Math.random;
  Date.now=()=>1791117314106;
  Math.random=()=>0.5;
  try {assertCommands(await withCrypto(undefined,exercise));}
  finally {Date.now=originalNow;Math.random=originalRandom;}
});

test('starting chapter production from the real novel page inherits both automatic and assisted modes',async()=>{
  for(const driver of ['auto','assisted']) {
    const posts=await exerciseContinuation(driver);
    assert.equal(posts.length,1);
    assert.equal(posts[0].type,'open_run');
    assert.equal(posts[0].driver,driver,'starting a new chapter range must inherit the previous run mode');
    assert.deepEqual(posts[0].launchInput.executionRange,{from:1,to:10});
  }
});
