const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmptyOutlineDocument, validateOutlineDocument, exportOutlineJson, importOutlineJson, exportOutlineMarkdown, diffOutlineDocuments, applyOutlineImportEdits } = require('../dist/modules/planning/outline');

test('empty outline document validates and preserves JSON contents', () => {
  const document = createEmptyOutlineDocument('第一本小说');
  assert.deepEqual(validateOutlineDocument(JSON.parse(JSON.stringify(document))), document);
});

test('versioned JSON round-trips all stable node IDs and Markdown includes the outline hierarchy', () => {
  const document = createEmptyOutlineDocument('旅程');
  document.volumes.push({ nodeId: 'v1', title: '第一卷', order: 0, planningDepth: 'rough', summary: '启程', chapterNodeIds: [] });
  const imported = importOutlineJson(exportOutlineJson('旅程', 1, document));
  assert.deepEqual(imported.document, document);
  assert.match(exportOutlineMarkdown(document), /第一卷/);
});

test('outline diff identifies additions and stable-ID movement', () => {
  const before = createEmptyOutlineDocument();
  before.volumes.push({ nodeId: 'v1', title: '第一卷', order: 0, planningDepth: 'rough', summary: '', chapterNodeIds: [] });
  const after = structuredClone(before);
  after.volumes[0].order = 1;
  after.facts.push({ nodeId: 'fact-1', title: '规则', content: '不可违背', scope: { type: 'story' }, relatedNodeIds: [], immutable: true });
  assert.deepEqual(diffOutlineDocuments(before, after).map(x=>x.kind), ['moved', 'added']);
});

test('outline document rejects duplicate stable IDs and dangling references', () => {
  const document = createEmptyOutlineDocument();
  document.volumes.push({ nodeId: document.story.nodeId, title: '卷一', order: 0, planningDepth: 'rough', summary: '', chapterNodeIds: [] });
  assert.throws(() => validateOutlineDocument(document), /必须唯一/);
  document.volumes[0].nodeId = 'volume-1';
  document.volumes[0].chapterNodeIds = ['missing'];
  assert.throws(() => validateOutlineDocument(document), /引用不存在/);
});

test('import edits reject invalid hierarchy and replacement node IDs', () => {
  const original = createEmptyOutlineDocument('导入');
  original.volumes.push({ nodeId: 'v1', title: '第一卷', order: 0, planningDepth: 'rough', summary: '', chapterNodeIds: ['c1'] });
  original.chapters.push({ nodeId: 'c1', volumeNodeId: 'v1', title: '第一章', order: 0, planningDepth: 'rough', summary: '', characterNodeIds: [], payoffNodeIds: [] });
  original.characters.push({ nodeId: 'char1', name: '林澜', appearanceNodeIds: [] });

  const invalidHierarchy = structuredClone(original);
  invalidHierarchy.chapters[0].volumeNodeId = 'char1';
  assert.throws(() => applyOutlineImportEdits(original, invalidHierarchy), /章节必须归属/);

  const replacedId = structuredClone(original);
  replacedId.chapters[0].nodeId = 'replacement';
  replacedId.volumes[0].chapterNodeIds = ['replacement'];
  assert.throws(() => applyOutlineImportEdits(original, replacedId), /不能增删节点或替换节点 ID/);
});
