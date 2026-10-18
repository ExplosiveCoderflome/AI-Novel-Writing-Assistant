import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {nodeStyles} from './support/nodeStyles.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'tests', `.home-director-${process.pid}.mjs`);
let render, model;
before(async () => {
  const {build} = createRequire(import.meta.resolve('vite'))('esbuild');
  await build({stdin: {resolveDir: root, loader: 'tsx', contents: `
    import React from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import {MemoryRouter} from 'react-router-dom';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import Home from './src/pages/Home';
    import {queryKeys} from './src/api/queryKeys';
    import * as model from './src/pages/home/homeViewModel';
    export {model};
    export function render(novel) {
      const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
      client.setQueryData(queryKeys.novels.list(1,model.HOME_NOVEL_FETCH_LIMIT),{success:true,data:{items:[novel]}});
      client.setQueryData(queryKeys.tasks.overview,{success:true,data:{}});
      try{return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter><Home/></MemoryRouter></QueryClientProvider>).replace(/<!--.*?-->/g,'').replace(/src="data:[^"]*"/g,'src="test-cover"');}
      finally{client.clear();}
    }
  `}, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', outfile: output,
    alias: {'@': path.join(root, 'src')}, loader: {'.webp': 'dataurl'}, define: {'import.meta.env': '{}'}, logLevel: 'silent', plugins: [nodeStyles, {
      name: 'unrelated-onboarding', setup(build) {build.onLoad({filter: /(?:CreationSetupNotice|FirstNovelJourneyStrip)\.tsx$/},
        () => ({contents: 'export default function(){return null}', loader: 'js'}));},
    }]});
  ({render, model} = await import(pathToFileURL(output).href));
});
after(() => {if (fs.existsSync(output)) fs.unlinkSync(output);});
const book = (status = 'completed') => ({id: 'novel', title: '十四毫米', directorVersion: 'v2', estimatedChapterCount: 90,
  narrativeForm: 'long_novel', workspaceSourceRoute: '/lab/director/novel', _count: {chapters: 90, characters: 5},
  latestAutoDirectorTask: {id: 'opening', status: 'succeeded', progress: 1, displayStatus: '小说主流程已完成'},
  bookProgress: {writtenChapters: 1, targetChapters: 90, director: {runId: 'run', status}}});

test('home uses real saved prose and V2 source instead of an opening success', () => {
  const novel = book(), html = render(novel);
  assert.equal(model.getHomeNovelTask(novel), null);
  assert.match(html, /已保存 1 章正文，全书目标 90 章/);
  assert.doesNotMatch(html.replace(/<[^>]*>/g, ''), /小说主流程已完成|100%|整本创作旅程/);
  assert.match(html, /href="\/lab\/director\/novel"/);
  assert.doesNotMatch(html, /href="\/novels\/novel\/edit/);
  assert.equal(model.buildHomeMetrics({novels: [novel]}).find(metric => metric.id === 'chapters').value, 1);
});

test('V2 running, manual pauses and failures remain visible and do not offer legacy mutations', () => {
  for (const status of ['running', 'paused', 'waiting_gate', 'failed', 'cancelled']) {
    const novel = book(status), html = render(novel);
    assert.match(html, /打开导演台/);
    assert.doesNotMatch(html, /继续导演|进入章节执行|小说主流程已完成/);
    const metrics = model.buildHomeMetrics({novels: [novel]});
    assert.equal(metrics.find(metric => metric.id === 'running').value, status === 'running' ? 1 : 0);
    assert.equal(metrics.find(metric => metric.id === 'attention').value, ['paused', 'waiting_gate', 'failed'].includes(status) ? 1 : 0);
  }
});

test('unknown V2 source cannot fall back to the old editor and unknown targets do not imply completion', () => {
  const novel = {...book(), workspaceSourceRoute: null, bookProgress: {writtenChapters: 1, targetChapters: null, director: null}};
  const html = render(novel);
  assert.match(html, /重新读取创作入口/);
  assert.doesNotMatch(html, /href="\/novels\/novel\/edit/);
  assert.doesNotMatch(html.replace(/<[^>]*>/g, ''), /100%/);
  assert.match(html, /确定全书目标/);
});

test('V1 and short stories preserve their own workspace and progress paths', () => {
  const v1 = {...book(), directorVersion: 'v1', workspaceSourceRoute: '/novels/novel/edit'};
  assert.equal(model.getHomeNovelTask(v1), v1.latestAutoDirectorTask);
  const legacyHtml = render(v1);
  assert.match(legacyHtml, /整本创作旅程/);
  assert.match(legacyHtml, /href="\/novels\/novel\/edit/);
  const short = {...book(), narrativeForm: 'short_story', latestCreationStudioTask: {status: 'succeeded', progress: 1}};
  assert.equal(model.getHomeNovelTask(short), short.latestCreationStudioTask);
  const shortHtml = render(short);
  assert.match(shortHtml, /href="\/novels\/novel\/story"/);
  assert.doesNotMatch(shortHtml, /打开导演台|重新读取创作入口/);
});
