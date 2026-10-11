import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { nodeStyles } from "./support/nodeStyles.js";

const clientDir = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(clientDir, "tests", `.carryover-lifecycle-${process.pid}.mjs`);
let mount, dom;
const restore = [];

before(async () => {
  // Isolated React regression: no browser, real API, database or paid model call.
  const { JSDOM } = createRequire(new URL("../../site/package.json", import.meta.url))("jsdom");
  dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/" });
  for (const [name, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element,
    HTMLInputElement: dom.window.HTMLInputElement,
    Node: dom.window.Node, NodeFilter: dom.window.NodeFilter,
    Event: dom.window.Event, CustomEvent: dom.window.CustomEvent,
    MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    restore.push(() => descriptor
      ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name]);
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  const mocks = {
    "./useAutoDirectorCreateController": `
      import {useState} from 'react';
      export function useAutoDirectorCreateController(input) {
        const [idea,setIdea]=useState('');
        return {
          idea,setIdea,directorBasicForm:input.basicForm,workflowTaskId:input.workflowTaskId,
          batches:[],hasActiveDirectorTask:false,directorTask:null,
          selectedStyleProfileId:'style-1',styleProfiles:[],selectedStyleSummary:null,
          runMode:'auto_to_ready',runModeOptions:[],worldSetupMode:'auto_generate',
          generateMutation:{isPending:false,mutate:()=>{globalThis.directionGenerations++}},
          canGenerate:true,ideaInspirations:[],ideaConstellationOptions:[],
          setRunMode:()=>{},setWorldSetupMode:()=>{},setSelectedStyleProfileId:()=>{},
          onBasicFormChange:input.onBasicFormChange
        };
      }`,
    "./StageIdea": `
      export default function StageIdea(props) {
        return <div><h1>起始想法</h1>{props.referenceContext}<output>{props.idea}</output><button onClick={props.onQuickGenerate}>生成方向</button><button onClick={props.onContinue}>继续完善设定</button></div>;
      }`,
    "./StageSummaryCard": "export default function StageSummaryCard(){return null}",
    "../components/ReferenceNovelStartDialog": "export default function ReferenceNovelStartDialog(){return null}",
    "framer-motion": `
      export const useReducedMotion=()=>true;
      export function AnimatePresence({children}){return children}
      export const motion={div:({children})=><div>{children}</div>};`,
  };
  const { build } = createRequire(import.meta.resolve("vite"))("esbuild");
  await build({
    stdin: { resolveDir: clientDir, loader: "tsx", contents: `
      import React,{act} from 'react';
      import {createRoot} from 'react-dom/client';
      import {MemoryRouter,useNavigate} from 'react-router-dom';
      import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
      import CreatePage from './src/pages/novels/autoDirector/AutoDirectorCreatePage';
      import {apiClient} from './src/api/client';
      export async function mount({mode='continuation',taskId=''}={}) {
        localStorage.clear();
        globalThis.directionGenerations=0;
        const pending=[],saves=[];
        apiClient.defaults.adapter=async config=>{
          let data={success:true,data:[]};
          if(config.url.includes('creative-carryover-contracts')) {
            data=await new Promise((resolve,reject)=>pending.push({resolve,reject,input:JSON.parse(config.data)}));
          } else if(config.url.includes('/tasks/')) {
            data={success:true,data:{id:taskId,meta:{seedPayload:{}}}};
          } else if(config.method==='post') {
            data=await new Promise((resolve,reject)=>saves.push({input:JSON.parse(config.data),resolve,reject}));
          }
          return {data,status:200,statusText:'OK',headers:{},config};
        };
        const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0},mutations:{gcTime:0}}});
        const container=document.getElementById('root');
        const root=createRoot(container);
        let navigate;
        function Route(){navigate=useNavigate();return <CreatePage/>}
        const url=(analysis='analysis-1')=>'/novels/auto-director?referenceMode='+mode+'&bookAnalysisId='+analysis+'&styleProfileId=style-1'+(taskId?'&taskId='+taskId:'');
        await act(async()=>root.render(<React.StrictMode><QueryClientProvider client={client}><MemoryRouter initialEntries={[url()]}><Route/></MemoryRouter></QueryClientProvider></React.StrictMode>));
        const surface=document.body;
        const button=label=>[...surface.querySelectorAll('button')].find(item=>item.textContent.trim()===label);
        const flush=async callback=>act(async()=>{callback?.();await new Promise(resolve=>setTimeout(resolve,5))});
        return {
          container,surface,pending,saves,button,
          complete:async(index,result)=>flush(()=>pending[index].resolve({success:true,data:result})),
          fail:async index=>flush(()=>pending[index].reject(new Error('model unavailable'))),
          completeSave:async index=>flush(()=>saves[index].resolve({success:true,data:{id:taskId}})),
          failSave:async index=>flush(()=>saves[index].reject(new Error('save unavailable'))),
          click:async label=>flush(()=>button(label)?.click()),
          switchSource:async analysis=>flush(()=>navigate(url(analysis))),
          cleanup:async()=>{await act(async()=>{root.unmount();await new Promise(resolve=>setTimeout(resolve,10))});client.clear();}
        };
      }
    ` },
    bundle: true, format: "esm", platform: "node", packages: "external",
    jsx: "automatic", outfile: output, logLevel: "silent",
    plugins: [nodeStyles, {
      name: "unrelated-creation-stages",
      setup(build) {
        build.onResolve({ filter: /.*/ }, args => {
          if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: "creation-mocks" };
          if (/^\.\/Stage(?:BasicSetup|Candidates|ModelRun|WorldStyle)$/.test(args.path)) {
            return { path: "empty-stage", namespace: "creation-mocks" };
          }
        });
        build.onLoad({ filter: /.*/, namespace: "creation-mocks" }, args => ({
          contents: mocks[args.path] ?? "export default function Stage(){return null}",
          loader: "tsx", resolveDir: clientDir,
        }));
      },
    }],
  });
  ({ mount } = await import(pathToFileURL(output).href));
});

after(() => {
  if (fs.existsSync(output)) fs.unlinkSync(output);
  dom?.window.close();
  restore.reverse().forEach(fn => fn());
  delete globalThis.directionGenerations;
});

function contract(mode = "continuation", bookAnalysisId = "analysis-1", suffix = "") {
  return {
    schemaVersion: 1, mode, bookAnalysisId, documentId: "document-1", documentVersionId: "version-1",
    documentVersionNumber: 1, documentTitle: "参考小说", generatedAt: "2026-10-11T00:00:00Z",
    adopted: false, usedSectionKeys: ["plot_structure"], basis: [{ sectionKey: "plot_structure", fieldKeys: [], summary: "来源依据" }],
    sourceTraits: ["原书特点一", "原书特点二"], bookRealization: ["本书方向一", "本书方向二", "本书方向三", "本书方向四"],
    openingChapters: [3, 1, 2].map(chapterNumber => ({ chapterNumber, direction: `开篇方向${chapterNumber}${suffix}` })),
    continuationFocus: mode === "continuation" ? { finalCharacterStates: ["人物终局一", "人物终局二"], unfinishedThreads: ["未完线索一"] } : null,
    adaptationFocus: mode === "adaptation" ? { hooks: ["新书钩子"], conflictLoops: ["新书冲突"], payoffRhythm: ["新书回报"], conversionPlan: "独立角色与世界" } : null,
  };
}

test("StrictMode first generation unlocks adoption without refresh and persists the adopted draft", async () => {
  const page = await mount();
  try {
    assert.equal(page.pending.length, 1, "subscription replay must not duplicate a paid request");
    assert.equal(page.button("采用推荐方案"), undefined);
    await page.click("生成方向");
    assert.equal(globalThis.directionGenerations, 0, "unadopted reference must not start direction generation");
    await page.complete(0, { status: "ready", contract: contract() });
    assert.equal(page.button("采用推荐方案")?.disabled, false);
    assert.equal(page.button("重新生成")?.disabled, false);
    assert.equal(page.surface.querySelector('[aria-label="创作承接方案"]').getAttribute("aria-busy"), "false");
    assert.deepEqual([...page.surface.querySelectorAll("ol li")].map(item => item.textContent), ["01开篇方向1", "02开篇方向2", "03开篇方向3"]);
    assert.equal(page.surface.querySelectorAll("details[open]").length, 0);
    assert.match(page.surface.textContent, /人物终局一/);
    assert.match(page.surface.textContent, /未完线索一/);
    await page.click("采用推荐方案");
    assert.equal(page.surface.querySelector('[role="dialog"]'), null);
    assert.equal(page.button("查看已采用方案")?.disabled, false);
    const draft = JSON.parse(localStorage.getItem(localStorage.key(0)));
    assert.equal(draft.creativeCarryoverContract.adopted, true);
    assert.match(draft.idea, /续写开篇/);
  } finally { await page.cleanup(); }
});

test("regeneration blocks adoption until completion and a failed regeneration keeps the previous proposal usable", async () => {
  const page = await mount({ mode: "adaptation" });
  try {
    await page.complete(0, { status: "ready", contract: contract("adaptation") });
    assert.equal(page.surface.querySelector('[role="dialog"]'), null, "generation must not interrupt writing with a popup");
    await page.click("查看创作方案");
    assert.match(page.surface.textContent, /独立角色与世界/);
    await page.click("重新生成");
    assert.equal(page.pending.length, 2);
    assert.equal(page.button("采用推荐方案").disabled, true);
    assert.match(page.surface.textContent, /开篇方向1/);
    await page.complete(1, { status: "ready", contract: contract("adaptation", "analysis-1", "新方案") });
    assert.equal(page.button("采用推荐方案").disabled, false);
    assert.match(page.surface.textContent, /开篇方向1新方案/);
    await page.click("重新生成");
    await page.fail(2);
    assert.equal(page.button("采用推荐方案").disabled, false);
    assert.equal(page.button("重试生成").disabled, false);
    assert.match(page.surface.textContent, /开篇方向1新方案/);
    await page.click("采用推荐方案");
    assert.equal(page.button("查看已采用方案")?.disabled, false);
  } finally { await page.cleanup(); }
});

test("material failures and mismatched results release the request state without allowing adoption", async () => {
  const page = await mount();
  try {
    await page.complete(0, { status: "insufficient_material", bookAnalysisId: "analysis-1", analysisTitle: "参考小说", missingSectionTitles: ["人物系统"], sourceVersionReadable: true });
    await page.click("查看创作方案");
    assert.match(page.surface.textContent, /拆书还缺少：人物系统/);
    assert.equal(page.button("采用推荐方案"), undefined);
  } finally { await page.cleanup(); }
  const mismatched = await mount();
  try {
    await mismatched.complete(0, { status: "ready", contract: contract("continuation", "another-analysis") });
    await mismatched.click("查看创作方案");
    assert.match(mismatched.surface.textContent, /与当前参考作品不一致/);
    assert.equal(mismatched.button("重试生成").disabled, false);
    assert.equal(mismatched.button("采用推荐方案"), undefined);
  } finally { await mismatched.cleanup(); }
});

test("a late response from the previous source cannot replace the newly selected book", async () => {
  const page = await mount();
  try {
    await page.switchSource("analysis-2");
    assert.equal(page.pending.length, 2);
    await page.complete(1, { status: "ready", contract: contract("continuation", "analysis-2", "第二本") });
    await page.complete(0, { status: "ready", contract: contract("continuation", "analysis-1", "第一本") });
    await page.click("查看创作方案");
    assert.match(page.surface.textContent, /开篇方向1第二本/);
    assert.doesNotMatch(page.surface.textContent, /开篇方向1第一本/);
    assert.equal(page.button("采用推荐方案").disabled, false);
  } finally { await page.cleanup(); }
});

test("adoption waits for the task save, prevents duplicate actions and stays retryable after a save failure", async () => {
  const page = await mount({ taskId: "task-1" });
  try {
    await page.complete(0, { status: "ready", contract: contract() });
    await page.click("查看创作方案");
    await page.click("采用推荐方案");
    assert.equal(page.saves.length, 1);
    assert.equal(page.saves[0].input.workflowTaskId, "task-1");
    assert.equal(page.saves[0].input.seedPayload.creativeCarryoverContract.adopted, true);
    assert.equal(page.button("正在采用…").disabled, true);
    assert.equal(page.button("重新生成").disabled, true);
    await page.click("正在采用…");
    assert.equal(page.saves.length, 1);
    assert.equal(page.button("查看已采用方案"), undefined);
    await page.failSave(0);
    assert.equal(page.button("采用推荐方案").disabled, false);
    await page.click("采用推荐方案");
    await page.completeSave(1);
    assert.equal(page.surface.querySelector('[role="dialog"]'), null);
    assert.equal(page.button("查看已采用方案")?.disabled, false);
  } finally { await page.cleanup(); }
});

test("the idea-stage entry opens a dismissible dialog and keeps its result across reopening and later setup stages", async () => {
  const page = await mount();
  try {
    assert.equal(page.container.firstElementChild.querySelector("h1").textContent, "起始想法");
    assert.equal(page.container.querySelector('section[aria-label="创作承接方案"]'), null);
    assert.equal(page.surface.querySelector('[role="dialog"]'), null);
    await page.click("查看创作方案");
    assert.ok(page.surface.querySelector('[role="dialog"]'));
    await page.click("返回开书设置");
    assert.equal(page.surface.querySelector('[role="dialog"]'), null);
    await page.complete(0, { status: "ready", contract: contract() });
    assert.equal(page.surface.querySelector('[role="dialog"]'), null);
    await page.click("查看创作方案");
    assert.equal(page.button("采用推荐方案").disabled, false);
    assert.equal(page.pending.length, 1, "opening or closing the dialog must not regenerate the proposal");
    await page.click("采用推荐方案");
    assert.equal(document.activeElement?.textContent, "查看已采用方案");
    await page.click("查看已采用方案");
    assert.match(page.surface.querySelector('[role="dialog"]').textContent, /已采用，可继续/);
    assert.equal(page.button("采用推荐方案"), undefined);
    await page.click("返回开书设置");
    await page.click("继续完善设定");
    assert.equal(page.button("查看已采用方案")?.disabled, false);
    await page.click("查看已采用方案");
    assert.match(page.surface.querySelector('[role="dialog"]').textContent, /开篇方向1/);
    assert.equal(page.pending.length, 1);
  } finally { await page.cleanup(); }
});
