import test from 'node:test';
import assert from 'node:assert/strict';
import {getNovelWorkspaceHref} from '../src/lib/novelRoutes.ts';
import {saveAutoDirectorCreateDraft, loadAutoDirectorCreateDraft} from '../src/pages/novels/autoDirector/draft/autoDirectorCreateDraft.ts';

test('V1 identity rejects a cached V2 workspace link while V2 keeps its own route', () => {
  assert.equal(getNovelWorkspaceHref({id:'book',directorVersion:'v1',workspaceSourceRoute:'/lab/director/book'}), '/novels/book/edit');
  assert.equal(getNovelWorkspaceHref({id:'book',directorVersion:'v2',workspaceSourceRoute:'/lab/director/book'}), '/lab/director/book');
});

test('opening draft preserves the explicitly selected V1 version', () => {
  const rows = new Map();
  const storage = {getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v)};
  saveAutoDirectorCreateDraft(storage, 'book', {idea:'方向',basicForm:{title:'标题'},activeStage:'model_run',completedStages:[],runMode:'stage_review',worldSetupMode:'skip',selectedStyleProfileId:'',directorVersion:'v1'});
  assert.equal(loadAutoDirectorCreateDraft(storage,'book').directorVersion, 'v1');
});
