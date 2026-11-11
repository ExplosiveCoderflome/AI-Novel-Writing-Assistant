import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath,pathToFileURL} from "node:url";
import {nodeStyles} from "./support/nodeStyles.js";

test("A2 renders one-chapter confirmation and planned ledger without changing legacy range/drive actions",async()=>{
  const {build}=createRequire(import.meta.resolve("vite"))("esbuild");
  const root=fileURLToPath(new URL("..",import.meta.url)),output=path.join(root,"tests",`.a2-ui-${Date.now()}.mjs`);
  try {
    await build({stdin:{contents:`
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {MemoryRouter} from 'react-router-dom';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {presentOutlineOpenBookError} from './src/pages/outlines/openBook/errorPresentation';
import DirectorPanel from './src/components/directorNext/DirectorPanel';import OutlineWritingControls,{outlinePreparationSteps} from './src/components/outlines/OutlineWritingControls';
import {ForeshadowLedger} from './src/pages/directorNext/workspace/ledgers/ForeshadowLedger';import {previewBook} from './src/pages/directorNext/workspace/previewBook';import {previewView} from './src/pages/directorNext/preview';import {formatOutlineValue} from './src/pages/outlines/outlineNodes';
const render=node=>renderToStaticMarkup(<MemoryRouter><QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider></MemoryRouter>);
const view={...previewView('completed'),availableActions:[{id:'open_run',kind:'command',command:'open_run',primary:true,label:'选择并继续写第3–5章'},{id:'handoff',kind:'command',command:'handoff',toDriver:'auto',label:'交给AI持续推进'}]};
export const bound=render(<DirectorPanel view={view} novelId='book' outlineBound/>),legacy=render(<DirectorPanel view={view} novelId='book'/>);
const book={...previewBook,novel:{...previewBook.novel,id:'book',estimatedChapterCount:12},chapters:[{id:'c1',order:1,title:'首章',content:'手改正文'},{id:'c9',order:9,title:'远期章',content:null}],outlineBinding:{plannedPayoffs:[{nodeId:'hidden-id',title:'计划伏笔',state:'planned',setupDescription:'埋设说明',payoffDescription:'回收说明',setupChapterOrders:[1,2],payoffChapterOrders:[9,12],ledgerKey:'must-not-render'}]}};
export const controls=render(<OutlineWritingControls book={book} initialStory='源纲'/>),plans=render(<ForeshadowLedger book={book} items={[]} onSelect={()=>{}}/>),steps=outlinePreparationSteps;
export const kinds=[formatOutlineValue('mystery','kind'),formatOutlineValue('promise','kind')];
export const issue=presentOutlineOpenBookError('OUTLINE_OPEN_INVALID: source-chapter.characterNodeIds 引用类型错误：source-volume',{story:{nodeId:'story',title:'总纲'},volumes:[{nodeId:'source-volume',title:'首卷'}],chapters:[{nodeId:'source-chapter',title:'来信'}],characters:[],payoffs:[],facts:[]});
`,resolveDir:root,loader:"tsx"},bundle:true,platform:"node",format:"esm",packages:"external",plugins:[nodeStyles],alias:{"@":path.join(root,"src")},define:{"import.meta.env":"{}"},outfile:output});
    const result=await import(pathToFileURL(output).href);
    assert.match(result.bound,/选择下一章并确认/);assert.doesNotMatch(result.bound,/选择并继续写第3–5章|交给AI持续推进/);
    assert.match(result.legacy,/选择并继续写第3–5章/);assert.match(result.legacy,/交给AI持续推进/);
    assert.match(result.controls,/id="director-start"/);assert.match(result.controls,/准备第 2 章/);assert.match(result.controls,/本次仅生成第 2 章/);assert.match(result.controls,/开始写第 2 章/);
    assert.doesNotMatch(result.controls,/起始章|结束章|全自动推进/);assert.ok(!result.steps.includes("chapter_batch"));assert.ok(result.steps.includes("execution_contract_sync"));
    for(const text of ["计划 · 未见正文证据","第 1 章、第 2 章","第 9 章、第 12 章","共 0 项 · 已兑现 0 项"]) assert.ok(result.plans.includes(text),text);
    assert.doesNotMatch(result.plans,/must-not-render|hidden-id/);assert.deepEqual(result.kinds,["悬念","承诺"]);assert.equal(result.issue.nodeId,"source-chapter");assert.match(result.issue.message,/来信.*关联人物.*首卷/);assert.doesNotMatch(result.issue.message,/source-chapter|source-volume|characterNodeIds|OUTLINE_OPEN_INVALID/);
  } finally {fs.rmSync(output,{force:true});}
});
