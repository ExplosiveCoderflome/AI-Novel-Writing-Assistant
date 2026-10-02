import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolveSelection, visibleCharacterHistory, readableChapter } from '../src/pages/directorNext/workspace/model.ts';

const book = { chapters: [{ id: 'c1', order: 1, content: '正文' }, { id: 'c2', order: 2, content: null }], materials: { characters: [{id:'person'}], volumes: [{id:'volume'}] } };

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
export const markup = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><NovelWorkspace book={previewBook} preview /></QueryClientProvider>);`, resolveDir: clientDir, loader: 'tsx' },
      bundle: true, platform: 'node', format: 'esm', packages: 'external',
      alias: { '@': path.join(clientDir, 'src') }, define: { 'import.meta.env': '{}' }, outfile: output,
    });
    const { markup } = await import(pathToFileURL(output).href);
    for (const label of ['故事规划', '世界设定', '角色', '卷纲', '章节', '林渡醒来时', '快速查看角色', '钟声之后']) assert.ok(markup.includes(label), label);
    assert.ok(markup.includes('待写作'));
    assert.doesNotMatch(markup, /border rounded|shadow-lg/);
  } finally { fs.rmSync(output, {force:true}); }
});
