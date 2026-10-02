import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolveSelection, visibleCharacterHistory, readableChapter } from '../src/pages/directorNext/workspace/model.ts';
import { buildStoryDirectory } from '../src/pages/directorNext/workspace/planning.ts';

const book = { chapters: [{ id: 'c1', order: 1, content: '正文' }, { id: 'c2', order: 2, content: null }], materials: { characters: [{id:'person'}], volumes: [{id:'volume'}] } };

test('directory keeps explicit beat links, unwritten plans and unassigned chapters without guessing', () => {
  const doc = {volumes:[{id:'v',sortOrder:1,title:'卷',chapters:[
    {id:'p1',volumeId:'v',chapterId:'c1',chapterOrder:1,beatKey:'opening'},
    {id:'p2',volumeId:'v',chapterOrder:2,beatKey:'opening'},
    {id:'p3',volumeId:'v',chapterOrder:3,beatKey:'missing'}
  ]}],beatSheets:[{volumeId:'v',beats:[{key:'opening',label:'开篇',chapterSpanHint:'1-99'}]}]};
  const tree = buildStoryDirectory(book, doc);
  assert.equal(tree.volumes[0].beats[0].chapters.length, 2);
  assert.equal(tree.volumes[0].beats[0].chapters[0].chapter.id, 'c1');
  assert.equal(tree.volumes[0].beats[0].chapters[1].chapter.id, 'c2');
  assert.equal(tree.volumes[0].unassigned[0].plan.id, 'p3');
  const orphan = buildStoryDirectory({...book,chapters:[...book.chapters,{id:'outside',order:99}]},doc);
  assert.deepEqual(orphan.unassigned.map(row=>row.chapter.id), ['outside']);
  assert.equal(buildStoryDirectory(book, undefined).unassigned.length, 2);
  const staleLink = structuredClone(doc);
  staleLink.volumes[0].chapters[0].chapterId = 'deleted';
  assert.equal(buildStoryDirectory(book, staleLink).volumes[0].beats[0].chapters[0].chapter, undefined);
  assert.ok(buildStoryDirectory(book, staleLink).unassigned.some(row=>row.chapter.id === 'c1'));
  const selected = {kind:'beat',id:'opening',volumeId:'v'};
  assert.deepEqual(resolveSelection(selected,{...book,planning:doc}),selected);
});

test('newly saved chapters preserve the chosen asset or reading chapter', () => {
  const selected = { kind: 'chapter', id: 'c1' };
  assert.deepEqual(resolveSelection(selected, {...book, chapters: [...book.chapters, {id:'c3',order:3,content:'新章'}]}), selected);
  assert.deepEqual(resolveSelection({kind:'character',id:'person'}, book), {kind:'character',id:'person'});
  assert.deepEqual(resolveSelection({kind:'chapter',id:'other-book'}, book), selected);
});

test('planned chapters stay selectable but have no readable prose', () => {
  assert.equal(readableChapter(book.chapters[1]), false);
  assert.deepEqual(resolveSelection({kind:'chapter',id:'c2'}, book), {kind:'chapter',id:'c2'});
});

test('reading-bound history excludes later chapters and records without a chapter source', () => {
  const events = [{id:'future',chapterOrder:4},{id:'early',chapterOrder:1},{id:'unknown',chapterOrder:null},{id:'current',chapterOrder:2}];
  assert.deepEqual(visibleCharacterHistory(events, 2).map(row=>row.id), ['current','early']);
  assert.deepEqual(visibleCharacterHistory(events, null), []);
  assert.equal(visibleCharacterHistory(events, 'latest').length, 4);
});

test('workspace preview renders saved prose and the complete resource directory', async () => {
  const { build } = createRequire(import.meta.resolve('vite'))('esbuild');
  const clientDir = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
  const output = path.join(clientDir, 'tests', `.workspace-render-${Date.now()}.mjs`);
  try {
    await build({
      stdin: { contents: `import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NovelWorkspace } from './src/pages/directorNext/workspace';
import { previewBook } from './src/pages/directorNext/workspace/previewBook';
import { ResourceDirectory } from './src/pages/directorNext/workspace/ResourceDirectory';
import { PlanningDetail } from './src/pages/directorNext/workspace/PlanningDetail';
export const markup = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><NovelWorkspace book={previewBook} preview /></QueryClientProvider>);
const book = {...previewBook, planning:{volumes:[{id:'v',sortOrder:1,title:'卷标题',chapters:[{id:'p',volumeId:'v',chapterOrder:4,beatKey:'b',title:'未写章',summary:'计划摘要'}]}],beatSheets:[{volumeId:'v',beats:[{key:'b',label:'开篇',title:'节奏标题',summary:'节奏目标',mustDeliver:['兑现目标']}]}]}};
export const planned = renderToStaticMarkup(<><ResourceDirectory book={book} selected={{kind:'beat',id:'b',volumeId:'v'}} onSelect={()=>{}}/><PlanningDetail book={book} selected={{kind:'beat',id:'b',volumeId:'v'}} onSelect={()=>{}}/></>);`, resolveDir: clientDir, loader: 'tsx' },
      bundle: true, platform: 'node', format: 'esm', packages: 'external',
      alias: { '@': path.join(clientDir, 'src') }, define: { 'import.meta.env': '{}' }, outfile: output,
    });
    const { markup, planned } = await import(pathToFileURL(output).href);
    for (const label of ['卷标题','节奏标题','节奏目标','兑现目标','未写章','待写正文']) assert.ok(planned.includes(label),label);
    for (const label of ['故事规划', '世界设定', '角色', '卷纲', '章节', '林渡醒来时', '快速查看角色', '钟声之后']) assert.ok(markup.includes(label), label);
    assert.ok(markup.includes('待写作'));
    assert.doesNotMatch(markup, /border rounded|shadow-lg/);
  } finally { fs.rmSync(output, {force:true}); }
});
