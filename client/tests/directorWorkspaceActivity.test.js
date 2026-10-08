import test from 'node:test';
import assert from 'node:assert/strict';
import { followedWorkspaceSelection } from '../src/pages/directorNext/generation/model.ts';
import { createWorkspaceRefresh } from '../src/pages/directorNext/generation/workspaceRefresh.ts';

const book = {novel: {id: 'n'}, materials: {characters: [], volumes: []}, chapters: [],
  planning: {volumes: [{id: 'v1', chapters: [{id: 'p1', chapterOrder: 11}]}]}};
const activity = type => ({novelId: 'n', runId: 'r', revision: '1',
  focus: {key: `r:1:${type}`, artifactType: type, label: '生成阶段', volumeId: 'v1', chapterOrder: 11}});

test('follow covers preparation and planning, including empty assets, without guessing a chapter', () => {
  for (const [type, selection] of [
    ['story_macro', {kind: 'story'}], ['book_contract', {kind: 'story'}],
    ['world_skeleton', {kind: 'world'}], ['character_cast', {kind: 'characters'}],
    ['volume_strategy', {kind: 'volumes'}], ['volume_beat_sheet', {kind: 'volume', id: 'v1'}],
    ['volume_chapter_list', {kind: 'volume', id: 'v1'}], ['chapter_task_sheet', {kind: 'plan', id: 'p1'}],
    ['chapter_execution_contract', {kind: 'plan', id: 'p1'}],
  ]) assert.deepEqual(followedWorkspaceSelection(true, activity(type), null, book)?.selection, selection);
  assert.deepEqual(followedWorkspaceSelection(true, activity('chapter_task_sheet'), null,
    {...book, planning: {volumes: []}})?.selection, {kind: 'volumes'});
  assert.equal(followedWorkspaceSelection(true, activity('chapter_batch_closed'), null, book), null);
  assert.equal(followedWorkspaceSelection(true, activity('unknown'), null, book), null);
  const ambiguous = {...book, planning: {volumes: [...book.planning.volumes,
    {id: 'v2', chapters: [{id: 'p2', chapterOrder: 11}]}]}};
  const unfenced = activity('chapter_task_sheet'); delete unfenced.focus.volumeId;
  assert.deepEqual(followedWorkspaceSelection(true, unfenced, null, ambiguous)?.selection, {kind: 'volumes'});
  assert.deepEqual(followedWorkspaceSelection(true, {...unfenced, focus: {...unfenced.focus, volumeId: 'v2'}}, null, ambiguous)?.selection,
    {kind: 'plan', id: 'p2'});
});

test('follow off and cross-book activity do not navigate; stream identity wins and is stable across tokens', () => {
  const frame = {novelId: 'n', chapterId: 'c11', executionId: 'exec', state: 'writing', revision: 1};
  assert.equal(followedWorkspaceSelection(false, activity('world_skeleton'), frame, book), null);
  assert.equal(followedWorkspaceSelection(true, {...activity('world_skeleton'), novelId: 'other'}, null, book), null);
  const target = followedWorkspaceSelection(true, activity('world_skeleton'), frame, book);
  assert.deepEqual(target.selection, {kind: 'chapter', id: 'c11'});
  assert.deepEqual(followedWorkspaceSelection(true, activity('world_skeleton'), {...frame, revision: 2}, book), target);
});

test('asset refresh coalesces ticks and fetches again if another save occurred during an old request', async () => {
  const pending = [];
  let calls = 0;
  const refresh = createWorkspaceRefresh(() => {calls++; return new Promise(resolve => pending.push(resolve));});
  refresh.observe('r:1'); refresh.observe('r:1'); refresh.observe('r:2');
  assert.equal(calls, 1);
  pending.shift()(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  pending.shift()(); await new Promise(resolve => setImmediate(resolve));
  refresh.observe('r:2');
  assert.equal(calls, 2);
  refresh.dispose(); refresh.observe('r:3');
  assert.equal(calls, 2);
});

test('failed refresh retries on the next status tick; disposed book never issues the queued refresh', async () => {
  let calls = 0;
  const retry = createWorkspaceRefresh(async () => {if (++calls === 1) throw new Error('offline');});
  retry.observe('r:1'); await new Promise(resolve => setImmediate(resolve));
  retry.observe('r:1'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  retry.observe('r:1'); assert.equal(calls, 2);
  let finish;
  const disposed = createWorkspaceRefresh(() => {calls++; return new Promise(resolve => {finish = resolve;});});
  disposed.observe('old:1'); disposed.observe('old:2'); disposed.dispose(); finish();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 3);
});
