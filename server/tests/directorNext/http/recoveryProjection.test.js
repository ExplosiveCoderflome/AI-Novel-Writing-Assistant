const test = require('node:test');
const assert = require('node:assert/strict');

test('recovery projection keeps director work on its source page without changing records', async () => {
  const { projectDirectorRecoveryCandidates } = require('../../../dist/app/director/projections/recoveryCandidates');
  const data = { items: [
    { kind: 'novel_workflow', id: 'old-book', sourceRoute: '/novels/book/edit', resumeAction: '恢复自动导演' },
    { kind: 'novel_workflow', id: 'opening', sourceRoute: '/tasks?id=opening' },
    { kind: 'novel_pipeline', id: 'owned', sourceRoute: '/novels/book/edit' },
    { kind: 'novel_pipeline', id: 'manual', sourceRoute: '/novels/manual/edit' },
    { kind: 'image_generation', id: 'image', sourceRoute: '/base-characters' },
  ] };
  const original = structuredClone(data);
  const result = await projectDirectorRecoveryCandidates(data, {
    findTask: async id => ({ lane: 'auto_director', novelId: id === 'old-book' ? 'book 1' : null }),
    findPipelineOwner: async id => id === 'owned' ? 'book 1' : null,
  });
  assert.deepEqual(data, original);
  assert.equal(result.items[0].sourceRoute, '/lab/director/book%201');
  assert.equal(result.items[1].sourceRoute, '/novels/auto-director?taskId=opening');
  assert.equal(result.items[2].sourceRoute, '/lab/director/book%201');
  assert.equal(result.items[0].resumeAction, '打开小说导演台');
  assert.deepEqual(result.items.slice(3), data.items.slice(3));
});
