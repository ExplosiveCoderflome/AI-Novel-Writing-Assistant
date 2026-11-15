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
