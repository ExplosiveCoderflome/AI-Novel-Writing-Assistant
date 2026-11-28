const test = require('node:test');
const assert = require('node:assert/strict');
const { getRegisteredPromptAsset } = require('../dist/prompting/registry');

test('outline prompts are registered with structured schemas and isolated context policy', () => {
  for (const [id, version, budget = 8000] of [
    ['outline.initial_generate', 'v1'],
    ['outline.initial_generate', 'v2'],
    ['outline.initial_generate', 'v3'],
    ['outline.edit_proposal', 'v2'],
    ['outline.workbench_dialogue', 'v1', 12000],
    ['outline.workbench_dialogue', 'v2', 12000],
    ['outline.workbench_dialogue', 'v3', 12000],
    ['outline.volume_beats', 'v1', 12000],
    ['outline.character_impact', 'v1'],
    ['outline.character_impact', 'v2'],
    ['outline.character_impact', 'v3'],
    ['outline.character_impact', 'v4'],
    ['outline.chapter_review', 'v1', 12000],
    ['outline.volume_review', 'v1', 12000],
    ['outline.import_parse', 'v1'],
  ]) {
    const asset = getRegisteredPromptAsset(id, version);
    assert.equal(asset.mode, 'structured');
    assert.ok(asset.outputSchema);
    assert.equal(asset.contextPolicy.maxTokensBudget, budget);
  }
});

test('a missing initial draft can be regenerated even if the model also omitted its reply', () => {
  const schema = getRegisteredPromptAsset('outline.workbench_dialogue', 'v2').outputSchema;
  for (const payload of [undefined, null, {}]) {
    const result = schema.parse({ answer: { kind: 'initial_generation', payload } });
    assert.equal(result.answer.kind, 'initial_generation');
    assert.ok(result.answer.payload == null);
  }
  assert.equal(schema.safeParse({ answer: { kind: 'discussion' } }).success, false);
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
