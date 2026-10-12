const test = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../../dist/agents/toolRegistry');
const {directorRuntimeToolDefinitions} = require('../../dist/agents/tools/directorRuntimeTools');
const {configureDirectorAgentEntry} = require('../../dist/app/director/entry/agentTools');

test('coexistence registers V1 tools and fences cached V2 calls before resolving old services', async () => {
  const names = Object.keys(directorRuntimeToolDefinitions);
  const cached = names.map(name => registry.getAgentToolDefinition(name));
  try {
    const ports={readNovel:async id=>({novelId:id,version:'v2',epoch:0,sourceRoute:'/lab/director/'+encodeURIComponent(id)}),readTask:async()=>null,canTask:async()=>false};
    configureDirectorAgentEntry(true,ports);
    assert.equal(names.length, 7);
    assert.equal(registry.listAgentToolDefinitions().filter(tool => names.includes(tool.name)).length,7);
    assert.equal(registry.listPlannerSemanticDefinitions().filter(tool => names.includes(tool.toolName)).length,7);
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
    configureDirectorAgentEntry(false,ports);
    await assert.rejects(cached[0].execute({runId:'cached',novelId:'book /1'},{}),error=>error.code==='CONFLICT');
    assert.equal(registry.listAgentToolDefinitions().filter(tool => names.includes(tool.name)).length, 7);
    assert.equal(registry.getAgentToolDefinition(names[0]), cached[0]);
  } finally {
    registry.configureAgentToolEntryBoundary();
  }
});
