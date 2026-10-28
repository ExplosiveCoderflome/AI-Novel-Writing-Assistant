const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const target = path.resolve(__dirname, '../../../dist/modules/production/infrastructure/storyState/sources.js');
const moduleApi = fs.existsSync(target) ? require(target) : {};
const { request, harness, hash } = require('./harness.cjs');

async function fixture(options = {}) {
  assert.equal(typeof moduleApi.createArtifactSourceReader, 'function', 'createArtifactSourceReader must be exported');
  const calls = [];
  const run = await harness().store.loadOrCreate(request());
  run.snapshots.profile.capabilities = options.locations === false ? [] : ['character_state'];
  const context = { run, content: '正文', contentHash: hash('正文'), requestKey: 'request', executionToken: 'lease' };
  const db = {
    novel: { findUnique: async () => ({ title: '书名' }) },
    chapter: { findFirst: async input => { calls.push(['chapter', input]); return { id: 'chapter-1', order: options.order ?? 1, title: '章名', taskSheet: '章节目标', expectation: '旧目标' }; } },
    character: { findMany: async () => [{ id: 'hero', name: '主角', role: '主角', castRole: null, currentGoal: '抵达', currentState: '负伤', currentLocation: '城门' }] },
    payoffLedgerItem: { findMany: async () => [] },
    characterDialogueInfluence: { findMany: async input => { calls.push(['dialogue', input]); return [{ id: 'talk', character: { name: '主角' }, summary: '承诺', behaviorGuidance: '兑现', emotionalGuidance: null, relationTension: null, targetStartChapterOrder: 1, targetEndChapterOrder: 2 }]; } },
  };
  const reader = moduleApi.createArtifactSourceReader(db, {
    listResources: async () => { if (options.resourceError) throw new Error('resource read failed'); return []; },
    readPreviousSnapshot: async () => ({ summary: '上章摘要', characterStates: [{ summary: '状态' }], relationStates: [], informationStates: [{ holderType: 'reader', fact: '秘密' }], foreshadowStates: [] }),
    readLocationContext: async input => { calls.push(['locations', input]); return '主角位于城门'; },
  });
  return { reader, context, calls };
}
test('artifact source reader assembles actual ledger, previous state and active influence inputs', async () => {
  const { reader, context, calls } = await fixture();
  const value = await reader(context);
  assert.equal(value.novelTitle, '书名');
  assert.equal(value.chapterGoal, '章节目标');
  assert.match(value.characterRosterText, /hero.*主角/);
  assert.match(value.characterStateText, /负伤/);
  assert.match(value.previousStateText, /reader:秘密/);
  assert.match(value.activeCharacterDialogueInfluenceText, /influenceId=talk/);
  assert.equal(value.characterLocationText, '主角位于城门');
  assert.deepEqual(calls.find(([name]) => name === 'chapter')[1].where, { id: 'chapter-1', novelId: 'novel-1' });
  assert.deepEqual(calls.find(([name]) => name === 'dialogue')[1].where.targetEndChapterOrder, { gte: 1 });
});
test('artifact source reader propagates incomplete reads and rejects a changed chapter identity', async () => {
  const failed = await fixture({ resourceError: true });
  await assert.rejects(failed.reader(failed.context), /resource read failed/);
  const changed = await fixture({ order: 3 });
  await assert.rejects(changed.reader(changed.context), { name: 'InvalidProductionRequestError' });
});
test('artifact source reader derives location capability only from the frozen profile', async () => {
  const { reader, context, calls } = await fixture({ locations: false });
  assert.equal((await reader(context)).characterLocationText, '');
  assert.equal(calls.some(([name]) => name === 'locations'), false);
});
