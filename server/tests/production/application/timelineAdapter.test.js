const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { request, harness, hash } = require('./harness.cjs');
const target = path.resolve(__dirname, '../../../dist/modules/production/infrastructure/storyState/timeline.js');
const moduleApi = fs.existsSync(target) ? require(target) : {};
async function fixture(options = {}) {
  assert.equal(typeof moduleApi.createTimelineArtifactPorts, 'function', 'createTimelineArtifactPorts must be exported');
  const run = await harness().store.loadOrCreate(request());
  run.artifacts.prepared = { novelTitle: '书', chapterTitle: '章', contextPackage: { chapter: { order: 1 }, timelineContext: { chapterIndex: 1 }, chapterWriteContext: { chapterMission: { objective: '推进' } } } };
  const context = { run, content: '最终正文', contentHash: hash('最终正文'), executionToken: 'lease', requestKey: 'reconcile' };
  const calls = []; let revision = 'v1';
  const ports = moduleApi.createTimelineArtifactPorts({
    describePrompt: async input => ({ identity: revision, promptVersion: 'v1', provider: 'test', model: 'fake-model',
      outputTokens: 4096, contextWindow: options.window ?? 100000, renderedInput: JSON.stringify(input) }),
    extractor: {
      extractFromChapter: async input => { calls.push(['extract', input]); return { events: [], hooks: [], addressedHookIds: [], resolvedHookIds: [] }; },
      normalizeEvents: () => [], normalizeHooks: () => [],
    },
    checker: { checkChapter: () => ({ status: options.failed ? 'failed' : 'passed', score: 1, issues: [] }) },
    consumer: { apply: async input => { calls.push(['finalize', input]); if (options.pending) throw new Error('boundary pending'); return { checkpointWritten: true, syncMode: options.failed ? 'degraded' : 'stable' }; } },
  });
  return { ports, context, calls, changeConfig: () => { revision = 'v2'; } };
}
test('timeline adapter separates paid extraction from selected-content finalization and reuses the existing checker', async () => {
  const f = await fixture(); const prepared = await f.ports.extraction.prepare(f.context);
  const output = await f.ports.extraction.invoke(f.context, prepared, 'timeline-key');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][1].chapterContent, '最终正文');
  assert.equal(output.timelineGate.extractorSucceeded, true);
  const result = await f.ports.consumer.apply({ context: f.context, output, previous: {}, stepKey: 'save-timeline' });
  assert.equal(result.syncMode, 'stable');
  assert.deepEqual(f.calls[1][1].output.timelineGate, output.timelineGate);
  assert.equal(f.calls[1][1].context.content, '最终正文');
  assert.equal(f.calls[1][1].stepKey, 'save-timeline');
});
test('timeline input budget and configuration are checked before extraction; an absent durable boundary is not completion', async () => {
  const tiny = await fixture({ window: 10 });
  await assert.rejects(tiny.ports.extraction.prepare(tiny.context), { name: 'InvalidProductionRequestError' });
  const f = await fixture({ pending: true }); const prepared = await f.ports.extraction.prepare(f.context);
  f.changeConfig();
  await assert.rejects(f.ports.extraction.invoke(f.context, prepared, 'key'), { name: 'ProductionSnapshotConflictError' });
  assert.equal(f.calls.length, 0);
  const pending = await fixture({ pending: true });
  const descriptor = await pending.ports.extraction.prepare(pending.context);
  const output = await pending.ports.extraction.invoke(pending.context, descriptor, 'key');
  await assert.rejects(pending.ports.consumer.apply({ context: pending.context, output, previous: {}, stepKey: 'save' }), /boundary/);
});
