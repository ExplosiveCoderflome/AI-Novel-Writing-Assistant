import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const clientDir = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(clientDir, "tests", `.template-drafts-${process.pid}.mjs`);
let mount, dom;
const restore = [];

before(async () => {
  // Hook-level regression in Node; no browser, real API, database or model invocation.
  const { JSDOM } = createRequire(new URL("../../site/package.json", import.meta.url))("jsdom");
  dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/" });
  for (const [name, value] of Object.entries({
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    restore.push(() => descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name]);
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  const { build } = createRequire(import.meta.resolve("vite"))("esbuild");
  await build({
    stdin: { resolveDir: clientDir, loader: "tsx", contents: `
      import React,{act} from 'react';
      import {createRoot} from 'react-dom/client';
      import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
      import {usePromptTemplateEditor} from './src/pages/promptWorkbench/hooks/usePromptTemplateEditor';
      import {usePromptPreview} from './src/pages/promptWorkbench/hooks/usePromptPreview';
      import {apiClient} from './src/api/client';
      const template=(text)=>({kind:'chat',messages:[{role:'system',content:text},{role:'human',content:'任务'}]});
      const view=(promptId,novelId='')=>({
        promptId,novelId,scope:'novel',basePromptVersion:'v9',mode:'official',
        activeVersion:null,activeVersionId:null,versions:[],officialCompiledHash:'official',
        officialTemplate:template('official:'+promptId),officialContextRefs:{context:[],input:[],slot:[]},
      });
      export async function mount() {
        const requests=[],saves=[],previews=[],stored=new Map();
        apiClient.defaults.adapter=async config=>{
          requests.push(config);
          let data;
          if(config.url.endsWith('/preview')) {
            data=await new Promise((resolve,reject)=>previews.push({input:JSON.parse(config.data),resolve,reject}));
          } else if(config.method==='put') {
            data=await new Promise((resolve,reject)=>saves.push({input:JSON.parse(config.data),resolve,reject}));
            stored.set(data.data.promptId+":"+data.data.novelId,data.data);
          } else if(config.url.endsWith('/template-overrides')) {
            data={success:true,data:stored.get(config.params.promptId+":"+config.params.novelId)??view(config.params.promptId,config.params.novelId)};
          } else {
            data={success:true,data:{promptId:config.params.promptId,items:[],missingRequiredGroups:[]}};
          }
          return {data,status:200,statusText:'OK',headers:{},config};
        };
        const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0},mutations:{retry:false,gcTime:0}}});
        const root=createRoot(document.getElementById('root'));
        let state,preview;
        let input={prompt:{id:'writer',key:'writer@v9',outputType:'text',contextPolicy:{maxTokensBudget:2600}},novelId:'',chapterId:'',entrypoint:'manual_test',enabled:true};
        function Harness(){
          state=usePromptTemplateEditor(input);
          preview=usePromptPreview({...input,slotOverrides:{},templateDraft:state.draftTemplate??undefined});
          return null;
        }
        const render=()=>root.render(<QueryClientProvider client={client}><Harness/></QueryClientProvider>);
        const flush=async fn=>act(async()=>{fn?.();await new Promise(resolve=>setTimeout(resolve,15))});
        await flush(render); await flush();
        return {
          get state(){return state},get preview(){return preview}, requests,saves,previews,flush,
          change:async patch=>{input={...input,...patch};await flush(render);await flush()},
          refetch:async()=>{await flush(()=>client.invalidateQueries());await flush()},
          complete:async index=>{
            const save=saves[index],v=view(save.input.promptId,save.input.novelId);
            v.mode='custom';v.activeVersionId='v1';
            v.activeVersion={id:'v1',versionNo:1,template:save.input.template};
            await flush(()=>save.resolve({success:true,data:v}));
          },
          cleanup:async()=>{await flush(()=>{for(const item of previews)item.resolve({success:true,data:{}});root.unmount()});client.clear()},
        };
      }
    ` },
    bundle: true, format: "esm", platform: "node", packages: "external",
    jsx: "automatic", outfile: output, logLevel: "silent",
  });
  ({ mount } = await import(pathToFileURL(output).href));
});
after(() => {
  if (fs.existsSync(output)) fs.unlinkSync(output);
  dom?.window.close();
  restore.reverse().forEach((fn) => fn());
});

test("official template loads without novel and drafts survive refetch, prompt and scope changes", async () => {
  const h = await mount();
  try {
    assert.equal(h.state.isReady, true);
    assert.equal(h.requests[0].params.novelId, undefined);
    assert.equal(h.state.canPersist, false);
    await h.flush(() => h.state.setSystemContent("unbound draft"));
    await h.refetch();
    assert.equal(h.state.systemContent, "unbound draft");
    await h.change({ novelId: "book-a" });
    assert.equal(h.state.systemContent, "official:writer");
    await h.flush(() => h.state.setSystemContent("book a draft"));
    await h.change({ prompt: { id: "short-story" } });
    assert.equal(h.state.systemContent, "official:short-story");
    await h.change({ prompt: { id: "writer" } });
    assert.equal(h.state.systemContent, "book a draft");
    await h.change({ novelId: "" });
    assert.equal(h.state.systemContent, "unbound draft");
    await h.flush(() => h.state.resetDraft());
    assert.equal(h.state.systemContent, "official:writer");
  } finally { await h.cleanup(); }
});

test("saving unbound draft targets chosen novel; failed save and other-book drafts survive", async () => {
  const h = await mount();
  try {
    await h.flush(() => h.state.setSystemContent("unbound draft"));
    await h.flush(() => h.state.saveMutation.mutate("book-a"));
    assert.equal(h.saves[0].input.novelId, "book-a");
    assert.equal(h.saves[0].input.template.messages[0].content, "unbound draft");
    await h.flush(() => h.saves[0].reject(new Error("offline")));
    assert.equal(h.state.isDirty, true);
    assert.equal(h.state.systemContent, "unbound draft");
    await h.flush(() => h.state.saveMutation.mutate("book-a"));
    await h.change({ novelId: "book-b" });
    await h.flush(() => h.state.setSystemContent("book b draft"));
    await h.complete(1);
    assert.equal(h.state.systemContent, "book b draft");
    await h.change({ novelId: "" });
    assert.equal(h.state.isDirty, false);
    await h.change({ novelId: "book-a" });
    assert.equal(h.state.systemContent, "unbound draft");
  } finally { await h.cleanup(); }
});


test("sample preview has no fictional IDs and switching scope detaches late preview responses", async () => {
  const h = await mount();
  try {
    await h.flush(() => h.preview.generatePreview());
    assert.equal(h.previews[0].input.executionContext.novelId, undefined);
    assert.equal(h.previews[0].input.executionContext.chapterId, undefined);
    await h.change({ novelId: "book-a", chapterId: "chapter-a" });
    await h.flush(() => h.previews[0].resolve({ success: true, data: { source: "old sample" } }));
    assert.equal(h.preview.preview, null);
    await h.flush(() => h.preview.generatePreview());
    assert.equal(h.previews[1].input.executionContext.novelId, "book-a");
    assert.equal(h.previews[1].input.executionContext.chapterId, "chapter-a");
    await h.flush(() => h.previews[1].resolve({ success: true, data: { source: "book-a" } }));
    assert.equal(h.preview.preview.source, "book-a");
    await h.change({ chapterId: "chapter-b" });
    assert.equal(h.preview.preview, null);
  } finally { await h.cleanup(); }
});
