import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolveSavedReview} from '../src/pages/directorNext/workspace/review.ts';

test('short review URLs resolve only saved current contexts and ignore forged or malformed routing fields',()=>{
 const row={id:'p7',volumeId:'v2',chapterOrder:7,taskSheet:'任务',sceneCards:'场景'};
 const context={type:'chapter_task_sheet',novelId:'book',runId:'r',controlVersion:3,volumeId:'v2',chapterId:'p7',from:7,to:8};
 const book={novel:{id:'book'},reviewContexts:[context],planning:{volumes:[{id:'v2',chapters:[row]}]},materials:{characters:[]},chapters:[{id:'c7',order:7,content:'正文'}],executionPlans:[{id:'c7',order:7,taskSheet:'执行任务',sceneCards:'执行场景'}]};
 const query=new URLSearchParams('review=chapter_task_sheet');
 assert.equal(resolveSavedReview(book,query).ready,true);
 assert.equal(resolveSavedReview(book,new URLSearchParams('review=chapter_task_sheet&from=1&to=6a&chapterId=foreign&volumeId=other')).ready,true,'URL carries no authoritative identity or range');
 for(const change of [{volumeId:'other'},{chapterId:'other'},{from:1},{to:6},{novelId:'other'}]) {
  assert.equal(resolveSavedReview({...book,reviewContexts:[{...context,...change}]},query).ready,false);
 }
 const closed=resolveSavedReview({...book,reviewContexts:[]},query);
 assert.equal(closed.ready,false,'closed or paused gates cannot be confirmed');
 assert.equal(closed.error,undefined,'absence of an open gate is a normal review state');
 assert.ok(closed.notice.includes('没有待确认'));
 assert.equal(resolveSavedReview({...book,reviewContexts:[],reviewContextError:'保存结果归属异常'},query).error,'保存结果归属异常');
 assert.ok(resolveSavedReview({...book,reviewContexts:[context,context]},query).error);
 assert.ok(resolveSavedReview(book,new URLSearchParams('review=unknown')).error);
 assert.equal(resolveSavedReview({...book,reviewContexts:[context,context]},query).ready,false);
 assert.equal(resolveSavedReview({...book,planning:{volumes:[{id:'v2',chapters:[row,{...row,id:'duplicate'}]}]}},query).ready,false);
 assert.equal(resolveSavedReview({...book,planning:{volumes:[{id:'v2',chapters:[{...row,taskSheet:{invalid:true}}]}]}},query).ready,false,'invalid stored values must not crash rendering');
 for(const type of ['chapter_execution_contract','chapter_batch_closed'])assert.equal(resolveSavedReview({...book,reviewContexts:[{...context,type}]},new URLSearchParams('review='+type)).ready,false);
});
test('new director reviews show the saved target and only offer confirmation while reviewing its current gate', async () => {
  const {build} = createRequire(import.meta.resolve('vite'))('esbuild');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const output = path.join(root, 'tests', `.review-${Date.now()}.mjs`);
  try {
    await build({stdin:{contents:`
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {Routes,Route} from 'react-router-dom';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {NovelWorkspace} from './src/pages/directorNext/workspace';
import {previewBook} from './src/pages/directorNext/workspace/previewBook';
import DirectorPanel from './src/components/directorNext/DirectorPanel';
import {previewView} from './src/pages/directorNext/preview';
import DirectorNovelPage from './src/pages/directorNext/DirectorNovelPage';
import {queryKeys} from './src/api/queryKeys';
const plan={id:'p7',volumeId:'v2',chapterOrder:7,title:'授权起点',summary:'正确的目标概要',taskSheet:'本章必须取得证据',sceneCards:'场景一：目标场景证据',styleContract:'保持有限视角',targetWordCount:2000,mustAvoid:'避免提前揭晓'};
const book={...previewBook,chapters:[{id:'c7',order:7,title:'真实正文',content:'保存的第七章正文',wordCount:8,updatedAt:'2026-10-04'},{id:'c8',order:8,title:'第二章正文',content:'保存的第八章正文',wordCount:8,updatedAt:'2026-10-04'},{id:'c9',order:9,title:'范围外',content:'不能列入本次审阅',wordCount:8,updatedAt:'2026-10-04'}],executionPlans:[{...plan,id:'c7',order:7,taskSheet:'真正同步的执行任务',sceneCards:'真正同步的执行场景'}],planning:{volumes:[{id:'v1',sortOrder:1,title:'首卷',chapters:[{...plan,id:'p1',volumeId:'v1',chapterOrder:1,taskSheet:'错误首章任务'}]},{id:'v2',sortOrder:2,title:'本次目标卷',summary:'本次卷纲内容',chapters:[plan]}],beatSheets:[],strategyPlan:null},novel:{...previewBook.novel,id:'book'},reviewContexts:['chapter_task_sheet','chapter_execution_contract','chapter_batch_closed','character_cast','volume_strategy'].map(type=>({type,novelId:'book',runId:'preview',controlVersion:4,from:7,to:8,volumeId:'v2',chapterId:type==='chapter_task_sheet'?'p7':'c7'}))};
function render(node){return renderToStaticMarkup(<MemoryRouter><QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider></MemoryRouter>)}
export const review=render(<NovelWorkspace book={book} review={new URLSearchParams('review=chapter_task_sheet&volumeId=v2&chapterId=p7&from=7&to=8')} preview/>);
export const execution=render(<NovelWorkspace book={book} review={new URLSearchParams('review=chapter_execution_contract&volumeId=v2&chapterId=c7&from=7&to=8')} preview/>);
export const batch=render(<NovelWorkspace book={book} review={new URLSearchParams('review=chapter_batch_closed&chapterId=c7&from=7&to=8')} preview/>);
export const invalid=render(<NovelWorkspace book={{...book,reviewContexts:book.reviewContexts.map(row=>({...row,chapterId:'p1'}))}} review={new URLSearchParams('review=chapter_task_sheet')} preview/>);
export const closed=render(<NovelWorkspace book={{...book,reviewContexts:[]}} review={new URLSearchParams('review=chapter_batch_closed')} preview/>);
export const contextError=render(<NovelWorkspace book={{...book,reviewContexts:[],reviewContextError:'保存结果归属异常'}} review={new URLSearchParams('review=chapter_batch_closed')} preview/>);
const target='/lab/director/book?review=chapter_task_sheet';
const view={...previewView('waiting_gate'),novelId:'book',availableActions:[{id:'review:chapter_task_sheet',label:'去确认「章节任务与场景」',kind:'navigate',primary:true,target},{id:'cancel',label:'取消本次创作',kind:'command',command:'cancel',primary:false}]};
export const noReview=render(<DirectorPanel view={view} novelId='book'/>);
export const wrongReview=render(<DirectorPanel view={view} novelId='book' reviewTarget='/lab/director/book?review=volume_strategy' reviewReady/>);
export const ready=render(<DirectorPanel view={view} novelId='book' reviewTarget={target} reviewReady reviewRunId={view.runId} reviewVersion={view.sourceTrace.controlVersion}/>);
export const missing=render(<DirectorPanel view={view} novelId='book' reviewTarget={target} reviewReady={false}/>);
export const stale=render(<DirectorPanel view={view} novelId='book' reviewTarget={target} reviewReady reviewRunId='older-run' reviewVersion={view.sourceTrace.controlVersion}/>);
export const staleVersion=render(<DirectorPanel view={view} novelId='book' reviewTarget={target} reviewReady reviewRunId={view.runId} reviewVersion={3}/>);
export const cast=render(<NovelWorkspace book={book} review={new URLSearchParams('review=character_cast')} preview/>);
export const outline=render(<NovelWorkspace book={book} review={new URLSearchParams('review=volume_strategy')} preview/>);
const cache=new QueryClient();
cache.setQueryData(['directorBookWorkspace','book'],{success:true,data:book});
cache.setQueryData(queryKeys.directorNext.summary('book'),{success:true,data:view});
cache.setQueryData(queryKeys.directorNext.detail('book'),{success:true,data:{view,timeline:[]}});
cache.setQueryData(['directorNovelMetadata','book'],{success:true,data:{description:'故事'}});
export const page=renderToStaticMarkup(<MemoryRouter initialEntries={[target]}><QueryClientProvider client={cache}><Routes><Route path='/lab/director/:novelId' element={<DirectorNovelPage/>}/></Routes></QueryClientProvider></MemoryRouter>);
cache.setQueryData(queryKeys.directorNext.summary('book'),{success:true,data:{...view,driver:'assisted'}});
cache.setQueryData(queryKeys.directorNext.detail('book'),{success:true,data:{view:{...view,driver:'assisted'},timeline:[]}});
export const assistedPage=renderToStaticMarkup(<MemoryRouter initialEntries={[target]}><QueryClientProvider client={cache}><Routes><Route path='/lab/director/:novelId' element={<DirectorNovelPage/>}/></Routes></QueryClientProvider></MemoryRouter>);
`,resolveDir:root,loader:'tsx'},bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':path.join(root,'src')},define:{'import.meta.env':'{}'},outfile:output});
    const m=await import(pathToFileURL(output).href);
    for (const text of ['章节任务与场景','本章必须取得证据','目标场景证据','保持有限视角','2000','避免提前揭晓']) assert.ok(m.review.includes(text),text);
    assert.ok(!m.review.includes('错误首章任务'));
    assert.ok(m.execution.includes('真正同步的执行任务'));
    assert.ok(m.execution.includes('真正同步的执行场景'));
    assert.ok(m.batch.includes('保存的第七章正文'));
    assert.ok(m.batch.includes('保存的第八章正文'));
    assert.ok(!m.batch.includes('不能列入本次审阅'));
    assert.ok(m.invalid.includes('无法定位'));
    assert.match(m.invalid,/<p role="alert" class="text-sm text-destructive">/);
    assert.match(m.closed,/<p role="status" class="text-sm leading-6 text-muted-foreground">本阶段没有待确认的结果/);
    assert.doesNotMatch(m.closed,/role="alert"|text-destructive/);
    assert.match(m.contextError,/<p role="alert" class="text-sm text-destructive">保存结果归属异常/);
    for(const html of [m.noReview,m.wrongReview,m.missing,m.stale,m.staleVersion]) assert.ok(!html.includes('确认结果并继续'));
    assert.ok(m.ready.includes('确认结果并继续'));
    assert.ok(m.ready.includes('请核对左侧本阶段结果，确认后 AI 按本次授权范围继续。'));
    for(const html of [m.ready,m.missing,m.stale,m.staleVersion]) {
      assert.ok(!html.includes('去确认「章节任务与场景」'),'the open review must not repeat its navigation action');
      assert.doesNotMatch(html,/href="\/lab\/director\/book\?review=chapter_task_sheet"/);
      assert.ok(!html.includes('查看本阶段结果'),'the open review must not link to itself again');
      assert.ok(html.includes('取消本次创作'),'navigation suppression must preserve workflow commands');
    }
    for(const html of [m.noReview,m.wrongReview]) {
      assert.ok(html.includes('去确认「章节任务与场景」'));
      assert.match(html,/href="\/lab\/director\/book\?review=chapter_task_sheet"/);
    }
    for(const html of [m.ready,m.noReview]) assert.doesNotMatch(html,/href="\/novels\//);
    assert.ok(m.cast.includes('角色阵容') && m.cast.includes('林渡'));
    assert.ok(m.outline.includes('本次目标卷') && m.outline.includes('本次卷纲内容'));
    assert.ok(m.page.includes('目标场景证据') && m.page.includes('确认结果并继续'));
    const automaticHeader=m.page.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0] ?? '';
    const assistedHeader=m.assistedPage.match(/<header\b[^>]*>[\s\S]*?<\/header>/)?.[0] ?? '';
    assert.ok(automaticHeader.includes('当前模式：全自动推进'),'the book header must show the current mode');
    assert.ok(assistedHeader.includes('当前模式：按阶段确认（半自动）'));
    for (const header of [automaticHeader,assistedHeader]) assert.ok(!header.includes('取消本次创作'),'the header mode indicator cannot expose workflow commands');
    assert.ok(!m.page.includes('去确认「章节任务与场景」'));
    assert.doesNotMatch(m.page,/href="\/lab\/director\/book\?review=chapter_task_sheet"/);
    assert.doesNotMatch(m.page,/href="\/novels\/[^\"]+\/edit|编辑本书/);
  } finally {fs.rmSync(output,{force:true});}
});
