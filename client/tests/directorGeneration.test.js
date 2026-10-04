import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptGenerationSnapshot, followedChapterSelection } from '../src/pages/directorNext/generation/model.ts';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const frame = {novelId:'n',chapterId:'c2',chapterOrder:2,chapterTitle:'第二章',executionId:'attempt',revision:2,state:'writing',content:'正在生成的正文',updatedAt:123};
test('follow selects the streamed chapter only when enabled and belonging to this book', () => {
  assert.deepEqual(followedChapterSelection(true, frame, 'n'), {kind:'chapter',id:'c2'});
  assert.equal(followedChapterSelection(false, frame, 'n'), null);
  assert.equal(followedChapterSelection(true, frame, 'other'), null);
  assert.equal(followedChapterSelection(true, {...frame,state:'saved'}, 'n'), null);
});
test('reconnect snapshots replace text without duplicating tokens and reject stale or invalid frames', () => {
  assert.deepEqual(acceptGenerationSnapshot(null, frame, 'n'), frame);
  assert.equal(acceptGenerationSnapshot(frame, {...frame,revision:1,content:'旧消息'}, 'n'), frame);
  assert.equal(acceptGenerationSnapshot(frame, {...frame,novelId:'other'}, 'n'), frame);
  assert.equal(acceptGenerationSnapshot(frame, {...frame,state:'unknown'}, 'n'), frame);
  const complete = {...frame,revision:3,state:'saved',content:'正式正文'};
  assert.deepEqual(acceptGenerationSnapshot(frame, complete, 'n'), complete);
  assert.deepEqual(acceptGenerationSnapshot(complete, {...frame,executionId:'new',revision:4,content:''}, 'n').content, '');
  assert.equal(acceptGenerationSnapshot(complete, null, 'n'), null);
});

test('the actual workspace follows a generating chapter and renders preview text without changing saved prose', async()=>{
  const {build}=createRequire(import.meta.resolve('vite'))('esbuild');
  const clientDir=fileURLToPath(new URL('..',import.meta.url));
  const output=path.join(clientDir,'tests',`.generation-render-${Date.now()}.mjs`);
  try{
    await build({stdin:{contents:`import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {NovelWorkspace} from './src/pages/directorNext/workspace';
import {previewBook} from './src/pages/directorNext/workspace/previewBook';
import DirectorNovelPage from './src/pages/directorNext/DirectorNovelPage';
const book={...previewBook,novel:{...previewBook.novel,id:'n'},chapters:[
{...previewBook.chapters[0],id:'c1',order:1,title:'原章节',content:'手动阅读正文'},
{...previewBook.chapters[0],id:'c2',order:2,title:'正在写的章',content:null}]};
const generation={novelId:'n',chapterId:'c2',chapterOrder:2,chapterTitle:'正在写的章',executionId:'run',revision:1,state:'writing',content:'流式预览正文',updatedAt:123};
const render=element=>renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>);
export const followed=render(<NovelWorkspace book={book} generation={generation} followGeneration/>);
export const manual=render(<NovelWorkspace book={book} generation={generation}/>);
export const unseen=render(<NovelWorkspace book={book} generation={{...generation,chapterId:'new-chapter',chapterOrder:3}} followGeneration/>);
export const header=render(<DirectorNovelPage previewOnly/>);
export const savedProse=book.chapters[0].content;
`,resolveDir:clientDir,loader:'tsx'},bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@':path.join(clientDir,'src')},define:{'import.meta.env':'{}'},outfile:output});
    const result=await import(pathToFileURL(output).href);
    assert.match(result.followed,/流式预览正文/);
    assert.match(result.followed,/正在生成正文 · 实时预览/);
    assert.doesNotMatch(result.followed,/手动阅读正文/);
    assert.match(result.manual,/手动阅读正文/);
    assert.doesNotMatch(result.manual,/流式预览正文/);
    assert.match(result.unseen,/流式预览正文/);
    assert.match(result.header,/跟随生成/);
    assert.equal(result.savedProse,'手动阅读正文');
  }finally{fs.rmSync(output,{force:true});}
});
