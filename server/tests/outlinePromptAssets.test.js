const test = require('node:test');
const assert = require('node:assert/strict');
const { getRegisteredPromptAsset } = require('../dist/prompting/registry');

test('outline prompts are registered with structured schemas and isolated context policy', () => {
  for (const id of ['outline.initial_generate', 'outline.edit_proposal', 'outline.import_parse']) {
    const asset = getRegisteredPromptAsset(id, 'v1');
    assert.equal(asset.mode, 'structured');
    assert.ok(asset.outputSchema);
    assert.equal(asset.contextPolicy.maxTokensBudget, 8000);
  }
});
