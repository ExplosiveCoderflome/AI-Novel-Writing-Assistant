const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmptyOutlineDocument, validateOutlineDocument } = require('../dist/modules/planning/outline');

test('empty outline document validates and preserves JSON contents', () => {
  const document = createEmptyOutlineDocument('第一本小说');
  assert.deepEqual(validateOutlineDocument(JSON.parse(JSON.stringify(document))), document);
});

test('outline document rejects duplicate stable IDs and dangling references', () => {
  const document = createEmptyOutlineDocument();
  document.volumes.push({ nodeId: document.story.nodeId, title: '卷一', order: 0, planningDepth: 'rough', summary: '', chapterNodeIds: [] });
  assert.throws(() => validateOutlineDocument(document), /必须唯一/);
  document.volumes[0].nodeId = 'volume-1';
  document.volumes[0].chapterNodeIds = ['missing'];
  assert.throws(() => validateOutlineDocument(document), /引用不存在/);
});
