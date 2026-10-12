import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL,fileURLToPath } from 'node:url';
import { queryKeys } from '../src/api/queryKeys.ts';
import {presentationViolations,inspectDirectorProjectionSources} from './directorNext/projectionGuard.mjs';

const read = (path) => fs.readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('summary and detail caches cannot replace each other', () => {
  assert.notDeepEqual(queryKeys.directorNext.summary('book'), queryKeys.directorNext.detail('book'));
  assert.notDeepEqual(queryKeys.directorNext.runs(true), queryKeys.directorNext.runs(false));
});

test('history is read only and new routes do not enter navigation', () => {
  const history = read('pages/directorNext/DirectorRunHistoryPage.tsx');
  assert.doesNotMatch(history, /submitDirectorCommand|useMutation|DirectorPanel|DirectorBadge/);
  assert.match(history, /needsAttention/);
  assert.match(history, /directorRoute/);
  assert.match(read('router/index.tsx'), /lab\/director\/:novelId/);
  for (const file of ['components/layout/Sidebar.tsx', 'components/layout/Navbar.tsx']) {
    assert.doesNotMatch(read(file), /lab\/director/);
  }
});

test('panel has all four sections and closed diagnostics', () => {
  const source = read('components/directorNext/DirectorPanel.tsx');
  for (const label of ['正在做什么', '需要你做什么', '质量提醒', '时间线']) assert.ok(source.includes(label));
  assert.doesNotMatch(source, /<details[^>]*\bopen/);
  assert.match(read('components/directorNext/DirectorBadge.tsx'), /find\(\(action\) => action.primary\)/);
});

test('pages forward the projection without inferring its state', () => {
  for (const file of ['DirectorNovelPage.tsx', 'DirectorRunHistoryPage.tsx']) {
    const source = read(`pages/directorNext/${file}`);
    assert.doesNotMatch(source, /(?:view|summary|detail)\??\.(?:mode|headline|progress|availableActions|sourceTrace)/);
    assert.doesNotMatch(source, /cursorStepId|failureReason|pauseKind|controlStatus/);
  }
});

test('the projection guard also rejects a third rendering component', () => {
  assert.notEqual(presentationViolations('Third.tsx', 'view.mode === "running"').length, 0);
  const sourceRoot=process.env.DIRECTOR_PROJECTION_SOURCE_ROOT??fileURLToPath(new URL('../src/',import.meta.url));
  assert.deepEqual(inspectDirectorProjectionSources(sourceRoot),[]);
});

test('the projection guard rejects aliases, element access, destructuring and lookalike component names',()=>{
  for(const source of ['state.mode === "running"','const alias = dashboard; alias?.headline','state["progress"]',
    'const {availableActions: actions} = state','const {mode} = state','props.state.sourceTrace',
    'state.chapterProgress','state["nextLaunchRange"]','const {nextActionGuidance} = state']) {
    assert.notEqual(presentationViolations('Third.tsx',source).length,0,source);
  }
  assert.notEqual(presentationViolations('ThirdDirectorPanel.tsx','view.mode').length,0);
});

test('seven states render their projected headline, progress, closed diagnostics and disabled preview commands', async () => {
  const viteRequire = createRequire(import.meta.resolve('vite'));
  const { build } = viteRequire('esbuild');
  const clientDir = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
  const output = path.join(clientDir, 'tests', `.director-render-${Date.now()}.mjs`);
  try {
    await build({
      stdin: {
        contents: `import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DirectorPanel from './src/components/directorNext/DirectorPanel';
import DirectorStart from './src/components/directorNext/DirectorStart';
import { previewStates, previewTimeline, previewView } from './src/pages/directorNext/preview';
export function renderedStates() {
  return previewStates.map(state => {
    const view = previewView(state.id);
    return { state, view, markup: renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}><MemoryRouter>
        <DirectorPanel view={view} novelId='preview' timeline={previewTimeline} preview />
      </MemoryRouter></QueryClientProvider>
    ) };
  });
}
export function renderedSwitchCases() {
  const label = '按本次授权切换创作方式';
  return ['auto', 'assisted'].flatMap(driver => [true, false].map(available => {
    const view = {...previewView('running'), driver,
      availableActions: available ? [{id:'handoff', kind:'command', primary:false, command:'handoff',
        toDriver:driver === 'auto' ? 'assisted' : 'auto', label}] : []};
    return {available, label, driver, markup: renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}><MemoryRouter>
        <DirectorPanel view={view} novelId='preview' preview />
      </MemoryRouter></QueryClientProvider>)};
  }));
}
export function renderedProduction() {
 const render=view=>renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><MemoryRouter>
  <DirectorPanel view={view} novelId='book' startForm={range=><DirectorStart novelId='book' estimatedChapterCount={12} nextChapter={4} initialStory='故事' suggestedRange={range}/>} />
 </MemoryRouter></QueryClientProvider>);
 const running={...previewView('running'),headline:'正在检查第 3 章《第三章》',nextActionGuidance:'等待本批次完成',chapterProgress:{from:1,to:3,done:2,total:3,current:{order:3,title:'第三章',phase:'reviewing'}},nextLaunchRange:{from:4,to:6}};
 return {running:render(running),completed:render({...running,mode:'completed',headline:'第 1—3 章已完成',nextActionGuidance:'核对范围并提交',chapterProgress:{...running.chapterProgress,done:3,current:null},availableActions:[{id:'open_run',command:'open_run',kind:'command',label:'选择并继续写第 4—6 章',primary:true}]})};
}`,
        resolveDir: clientDir, loader: 'tsx',
      },
      bundle: true, platform: 'node', format: 'esm', packages: 'external',
      alias: { '@': path.join(clientDir, 'src') },
      define: { 'import.meta.env': '{}' },
      outfile: output,
    });
    const { renderedStates, renderedSwitchCases, renderedProduction } = await import(pathToFileURL(output).href);
    const rows = renderedStates();
    assert.equal(rows.length, 7);
    for (const { view, markup } of rows) {
      assert.ok(markup.includes(view.headline));
      assert.match(markup,/aria-label="创作方式"[^>]*>模式：全自动推进<\/span>/);
      assert.ok(markup.includes('role="progressbar"'));
      assert.doesNotMatch(markup, /<details[^>]*\bopen/);
      for (const action of view.availableActions) {
        assert.ok(markup.includes(action.label));
        if (action.kind === 'command') assert.match(markup, /disabled=""/);
      }
    }
    for (const {available, label, driver, markup} of renderedSwitchCases()) {
      const modeLabel=driver==='auto' ? '全自动推进' : '按阶段确认（半自动）';
      assert.ok(markup.includes(`aria-label="创作方式">模式：${modeLabel}</span>`),'the header shows the current driver even when switching is unavailable');
      assert.equal(markup.split(label).length-1, available ? 1 : 0, 'switch renders only once from the projected action');
      if (available) assert.match(markup, /<button[^>]*disabled=""[^>]*>按本次授权切换创作方式<\/button>/);
    }
    const production=renderedProduction();
    assert.match(production.running,/本次正文/);
    assert.match(production.running,/2\/3/);
    assert.match(production.running,/等待本批次完成/);
    assert.doesNotMatch(production.running,/id="director-start"/);
    assert.match(production.completed,/提交并生成第 4—6 章/);
    assert.match(production.completed,/更多创作设置/);
    assert.ok(production.completed.indexOf('正在做什么')<production.completed.indexOf('id="director-start"'),'status and next-step context come before launch settings');
  } finally {
    if (fs.existsSync(output)) fs.unlinkSync(output);
  }
});
