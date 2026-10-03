const test = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../../dist/agents/toolRegistry');
const {directorRuntimeToolDefinitions} = require('../../dist/agents/tools/directorRuntimeTools');
const {createApp} = require('../../dist/app');

test('new entry excludes legacy runtime tools and rejects cached execution before resolving old services', async () => {
  const previous = process.env.DIRECTOR_NEXT_ENABLED;
  const names = Object.keys(directorRuntimeToolDefinitions);
  const cached = names.map(name => registry.getAgentToolDefinition(name));
  try {
    process.env.DIRECTOR_NEXT_ENABLED = 'true';
    createApp();
    assert.equal(names.length, 7);
    assert.equal(registry.listAgentToolDefinitions().some(tool => names.includes(tool.name)), false);
    assert.equal(registry.listPlannerSemanticDefinitions().some(tool => names.includes(tool.toolName)), false);
    for (const definition of cached) {
      for (const dryRun of [false, true]) {
        await assert.rejects(definition.execute({runId:'agent-test',agentName:'novel',contextMode:'novel',novelId:'book /1',dryRun}, {}), error => {
          assert.equal(error.code, 'CONFLICT');
          assert.match(error.message, /\/lab\/director\/book%20%2F1/);
          return true;
        });
      }
    }
    assert.ok(registry.listAgentToolDefinitions().some(tool => tool.name === 'list_novels'));
    process.env.DIRECTOR_NEXT_ENABLED = 'false';
    createApp();
    assert.equal(registry.listAgentToolDefinitions().filter(tool => names.includes(tool.name)).length, 7);
    assert.equal(registry.getAgentToolDefinition(names[0]), cached[0]);
  } finally {
    if (previous === undefined) delete process.env.DIRECTOR_NEXT_ENABLED;
    else process.env.DIRECTOR_NEXT_ENABLED = previous;
    createApp();
  }
});
