import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolveSavedReview} from '../src/pages/directorNext/workspace/review.ts';

test('missing, duplicate and foreign review identities cannot be treated as ready',()=>{
  const row={id:'p7',volumeId:'v2',chapterOrder:7,taskSheet:'任务',sceneCards:'场景'};
  const book={planning:{volumes:[{id:'v2',chapters:[row]}]},materials:{characters:[]},chapters:[{id:'c7',order:7,content:'正文'}],executionPlans:[{id:'c7',order:7,taskSheet:'执行任务',sceneCards:'执行场景'}]};
  const request='review=chapter_task_sheet&volumeId=v2&chapterId=p7&from=7&to=8';
  assert.equal(resolveSavedReview(book,new URLSearchParams(request)).ready,true);
  for(const query of [request.replace('v2','other'),request.replace('p7','other'),request.replace('from=7','from=1'),request.replace('to=8','to=6'),'review=unknown']) {
    assert.equal(resolveSavedReview(book,new URLSearchParams(query)).ready,false,query);
  }
  assert.equal(resolveSavedReview({...book,planning:{volumes:[{id:'v2',chapters:[row,{...row,id:'duplicate'}]}]}},new URLSearchParams(request)).ready,false);
  assert.equal(resolveSavedReview(book,new URLSearchParams('review=chapter_execution_contract&volumeId=v2&chapterId=p7&from=7&to=8')).ready,false,'planning id cannot stand in for saved execution');
  assert.equal(resolveSavedReview(book,new URLSearchParams('review=chapter_batch_closed&chapterId=c7&from=7&to=8')).ready,false,'incomplete batch cannot be confirmed');
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
const book={...previewBook,chapters:[{id:'c7',order:7,title:'真实正文',content:'保存的第七章正文',wordCount:8,updatedAt:'2026-10-04'},{id:'c8',order:8,title:'第二章正文',content:'保存的第八章正文',wordCount:8,updatedAt:'2026-10-04'},{id:'c9',order:9,title:'范围外',content:'不能列入本次审阅',wordCount:8,updatedAt:'2026-10-04'}],executionPlans:[{...plan,id:'c7',order:7,taskSheet:'真正同步的执行任务',sceneCards:'真正同步的执行场景'}],planning:{volumes:[{id:'v1',sortOrder:1,title:'首卷',chapters:[{...plan,id:'p1',volumeId:'v1',chapterOrder:1,taskSheet:'错误首章任务'}]},{id:'v2',sortOrder:2,title:'本次目标卷',summary:'本次卷纲内容',chapters:[plan]}],beatSheets:[],strategyPlan:null}};
function render(node){return renderToStaticMarkup(<MemoryRouter><QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider></MemoryRouter>)}
export const review=render(<NovelWorkspace book={book} review={new URLSearchParams('review=chapter_task_sheet&volumeId=v2&chapterId=p7&from=7&to=8')} preview/>);
export const execution=render(<NovelWorkspace book={book} review={new URLSearchParams('review=chapter_execution_contract&volumeId=v2&chapterId=c7&from=7&to=8')} preview/>);
export const batch=render(<NovelWorkspace book={book} review={new URLSearchParams('review=chapter_batch_closed&chapterId=c7&from=7&to=8')} preview/>);
export const invalid=render(<NovelWorkspace book={book} review={new URLSearchParams('review=chapter_task_sheet&volumeId=v2&chapterId=p1&from=7&to=8')} preview/>);
const target='/lab/director/book?review=chapter_task_sheet&volumeId=v2&chapterId=p7&from=7&to=8';
const view={...previewView('waiting_gate'),novelId:'book',availableActions:[{id:'review:chapter_task_sheet',label:'查看章节任务',kind:'navigate',primary:true,target}]};
export const noReview=render(<DirectorPanel view={view} novelId='book'/>);
export const wrongReview=render(<DirectorPanel view={view} novelId='book' reviewTarget='/lab/director/book?review=volume_strategy' reviewReady/>);
export const ready=render(<DirectorPanel view={view} novelId='book' reviewTarget={target} reviewReady/>);
export const missing=render(<DirectorPanel view={view} novelId='book' reviewTarget={target} reviewReady={false}/>);
export const cast=render(<NovelWorkspace book={book} review={new URLSearchParams('review=character_cast')} preview/>);
export const outline=render(<NovelWorkspace book={book} review={new URLSearchParams('review=volume_strategy')} preview/>);
const cache=new QueryClient();
cache.setQueryData(['directorBookWorkspace','book'],{success:true,data:book});
cache.setQueryData(queryKeys.directorNext.summary('book'),{success:true,data:view});
cache.setQueryData(queryKeys.directorNext.detail('book'),{success:true,data:{view,timeline:[]}});
cache.setQueryData(['directorNovelMetadata','book'],{success:true,data:{description:'故事'}});
export const page=renderToStaticMarkup(<MemoryRouter initialEntries={[target]}><QueryClientProvider client={cache}><Routes><Route path='/lab/director/:novelId' element={<DirectorNovelPage/>}/></Routes></QueryClientProvider></MemoryRouter>);
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
    for(const html of [m.noReview,m.wrongReview,m.missing]) assert.ok(!html.includes('确认结果并继续'));
    assert.ok(m.ready.includes('确认结果并继续'));
    for(const html of [m.ready,m.noReview]) assert.doesNotMatch(html,/href="\/novels\//);
    assert.ok(m.cast.includes('角色阵容') && m.cast.includes('林渡'));
    assert.ok(m.outline.includes('本次目标卷') && m.outline.includes('本次卷纲内容'));
    assert.ok(m.page.includes('目标场景证据') && m.page.includes('确认结果并继续'));
    assert.doesNotMatch(m.page,/href="\/novels\/[^\"]+\/edit|编辑本书/);
  } finally {fs.rmSync(output,{force:true});}
});
