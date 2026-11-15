const test = require('node:test');
const assert = require('node:assert/strict');
const { getRegisteredPromptAsset } = require('../dist/prompting/registry');

test('outline prompts are registered with structured schemas and isolated context policy', () => {
  for (const [id, version] of [
    ['outline.initial_generate', 'v1'],
    ['outline.edit_proposal', 'v2'],
    ['outline.import_parse', 'v1'],
  ]) {
    const asset = getRegisteredPromptAsset(id, version);
    assert.equal(asset.mode, 'structured');
    assert.ok(asset.outputSchema);
    assert.equal(asset.contextPolicy.maxTokensBudget, 8000);
  }
});

test('outline.edit_proposal schema rejects node-id dependsOn, missing volumeNodeId and chapterNodeIds shortcut', () => {
  const asset = getRegisteredPromptAsset('outline.edit_proposal', 'v2');
  const schema = asset.outputSchema;

  assert.equal(schema.safeParse({
    operations: [{
      operationId: 'op-1', kind: 'add_node', nodeType: 'chapter', clientRef: 'c1',
      fields: { title: '章', summary: 's', volumeNodeId: 'vol-1' },
      reason: 'r', affectedNodeIds: [], dependsOn: ['vol-1'], risks: [],
    }],
  }).success, false);

  assert.equal(schema.safeParse({
    operations: [{
      operationId: 'op-1', kind: 'add_node', nodeType: 'chapter', clientRef: 'c1',
      fields: { title: '章', summary: 's' },
      reason: 'r', affectedNodeIds: [], dependsOn: [], risks: [],
    }],
  }).success, false);

  assert.equal(schema.safeParse({
    operations: [{
      operationId: 'op-1', kind: 'update_fields', nodeId: 'vol-1',
      fields: { chapterNodeIds: ['x'] },
      reason: 'r', affectedNodeIds: [], dependsOn: [], risks: [],
    }],
  }).success, false);

  assert.equal(schema.safeParse({
    operations: [{
      operationId: 'op-1', kind: 'add_node', nodeType: 'chapter', clientRef: 'c1',
      fields: { title: '章', summary: 's', volumeNodeId: 'vol-1' },
      reason: 'r', affectedNodeIds: [], dependsOn: [], risks: [],
    }],
  }).success, true);
});
