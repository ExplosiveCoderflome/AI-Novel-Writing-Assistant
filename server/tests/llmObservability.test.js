require('./fixtures/compatibilitySettings.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const Database = require('better-sqlite3');
const { prisma } = require('../dist/db/prisma');
const usage = require('../dist/platform/llm/usage');
const { attachLLMUsageTracking, runWithInvocationChain, observeInvocationParse } = require('../dist/llm/compatibility');
const { runWithLlmUsageTracking } = require('../dist/llm/usageTracking');
const tokens = { input_tokens: 10, output_tokens: 2, total_tokens: 12 };

async function capture(t, enabled = true) {
  await usage.saveInvocationHistorySettings({ enabled, retentionDays: 7, maxMb: 100 });
  const rows = [], payloads = new Map(), legacy = [];
  const patch = (delegate, name, fn) => {
    const original = delegate[name]; delegate[name] = fn;
    t.after(() => { delegate[name] = original; });
  };
  patch(prisma.llmInvocationUsageRecord, 'create', async ({ data }) => { rows.push(data); return data; });
  patch(prisma.directorLlmUsageRecord, 'create', async ({ data }) => { legacy.push(data); return data; });
  patch(prisma.llmInvocationPayload, 'create', async ({ data }) => { payloads.set(data.usageRecordId, data); return data; });
  patch(prisma.llmInvocationPayload, 'findUnique', async ({ where }) => payloads.get(where.usageRecordId) ?? null);
  patch(prisma.llmInvocationPayload, 'updateMany', async ({ where, data }) => { Object.assign(payloads.get(where.usageRecordId), data); return { count: 1 }; });
  return { rows, payloads, legacy, read: id => usage.decodeInvocationPayload(payloads.get(id).compressed) };
}
function client(stream, meta = {}, secrets = []) {
  return attachLLMUsageTracking({ stream, invoke: async () => ({ content: 'answer', usage_metadata: tokens }), batch: async () => [] }, meta, secrets);
}

test('stream timing ignores empty chunks, records TTFT and mirrors legacy director timing once', async t => {
  const f = await capture(t);
  t.mock.timers.enable({ apis: ['Date'], now: 1_800_000_000_000 });
  const llm = client(async function* () {
    t.mock.timers.tick(10); yield { content: '' };
    t.mock.timers.tick(20); yield { content: 'hello' };
    t.mock.timers.tick(40); yield { content: '', usage_metadata: tokens };
  }, { provider: 'openai', model: 'fixture', structuredMode: 'json_schema' });
  await runWithLlmUsageTracking({ directorTelemetry: true, novelId: 'book' }, async () => {
    for await (const _ of await llm.stream([['user', 'prompt']])) {}
  });
  assert.equal(f.rows.length, 1);
  assert.equal(f.rows[0].firstTokenMs, 30);
  assert.equal(f.rows[0].durationMs, 70);
  assert.equal(f.rows[0].completionTokens, 2);
  assert.equal(f.rows[0].attemptNumber, 1);
  assert.equal(f.rows[0].structuredMode, 'json_schema');
  assert.equal(f.legacy[0].id, f.rows[0].id);
  assert.equal(f.legacy[0].firstTokenMs, 30);
  assert.equal(f.legacy[0].durationMs, 70);
  assert.equal((await f.read(f.rows[0].id)).response, 'hello');
});

test('non-streaming calls have null TTFT, history disabled stores timing without payload', async t => {
  const f = await capture(t, false);
  await client(async function* () {}).invoke('prompt');
  assert.equal(f.rows.length, 1);
  assert.equal(f.rows[0].firstTokenMs, null);
  assert.ok(f.rows[0].durationMs >= 0);
  assert.equal(f.payloads.size, 0);
});

test('SDK batch returning a child invoke error records that physical request once', async t => {
  const f = await capture(t);
  const failure = new Error('request failed');
  const llm = attachLLMUsageTracking({
    invoke: async () => { throw failure; },
    stream: async function* () {},
    async batch(inputs) { return Promise.all(inputs.map(input => this.invoke(input).catch(error => error))); },
  });
  assert.deepEqual(await llm.batch(['prompt']), [failure]);
  assert.equal(f.rows.length, 1);
  assert.equal(f.rows[0].status, 'failed');
  assert.equal(f.payloads.size, 1);
  assert.equal((await f.read(f.rows[0].id)).error, 'request failed');
});

test('transport failures, partial streams and repaired parses retain independent immutable attempt identities', async t => {
  const f = await capture(t);
  const bad = client(async function* () { yield { content: 'partial' }; throw new Error('connection lost'); }, { structuredMode: 'json_schema' });
  const good = client(async function* () { yield { content: '{"ok":true}', usage_metadata: tokens }; }, { structuredMode: 'prompt_json' });
  await runWithInvocationChain(async () => {
    await assert.rejects(observeInvocationParse(async () => {
      for await (const _ of await bad.stream('first')) {}
    }, x => x), /connection lost/);
    await observeInvocationParse(async () => {
      for await (const _ of await good.stream('second')) {}
      return { ok: true };
    }, x => x);
  });
  assert.equal(f.rows.length, 2);
  assert.equal(f.rows[0].status, 'partial');
  assert.equal(f.rows[0].promptTokens, null);
  assert.equal(f.rows[1].attemptNumber, 2);
  assert.equal(f.rows[1].parentInvocationId, f.rows[0].id);
  assert.equal(f.rows[0].chainId, f.rows[1].chainId);
  assert.equal((await f.read(f.rows[0].id)).response, 'partial');
  assert.match((await f.read(f.rows[0].id)).error, /connection lost/);
  assert.deepEqual((await f.read(f.rows[1].id)).parsed, { ok: true });
  const failure = client(async () => { throw new Error('unavailable'); });
  await assert.rejects(failure.stream('third'), /unavailable/);
  assert.equal(f.rows[2].status, 'failed');
  assert.equal(f.rows[2].attemptNumber, 1);
  assert.equal(f.rows[2].firstTokenMs, null);
});

test('actual structured fallback and JSON repair share one chain and retain original parse errors', async t => {
  const f = await capture(t);
  const factory = require('../dist/llm/factory');
  const compat = require('../dist/llm/compatibility/store');
  const fallback = require('../dist/llm/structuredFallbackSettings');
  const { invokeStructuredLlmDetailed } = require('../dist/llm/structuredInvoke');
  const { z } = require('zod');
  const replies = ['invalid', '{"ok":true}'];
  t.mock.method(factory, 'resolveLLMClientOptions', async (_provider, options) => ({ ...options, provider: 'openai', model: 'gpt-4o', requestProtocol: 'openai', temperature: 0.2, maxTokens: 1000 }));
  const create = options => client(async function* () { yield { content: replies.shift(), usage_metadata: tokens }; }, { structuredMode: options.structuredStrategy });
  t.mock.method(factory, 'createLLMFromResolvedOptions', create);
  t.mock.method(factory, 'getLLM', async (_provider, options) => create(options));
  t.mock.method(compat, 'recordFailedMode', async () => {});
  t.mock.method(fallback, 'getStructuredFallbackSettings', async () => null);
  const input = { schema: z.object({ ok: z.boolean() }), provider: 'openai', model: 'gpt-4o', label: 'observability-fixture', systemPrompt: 'Return JSON', userPrompt: 'return data', disableFallbackModel: true };
  assert.deepEqual((await invokeStructuredLlmDetailed({ ...input, maxRepairAttempts: 0 })).data, { ok: true });
  assert.equal(f.rows.length, 2);
  assert.equal(f.rows[0].structuredMode, 'json_schema');
  assert.equal(f.rows[1].structuredMode, 'json_object');
  assert.equal(f.rows[1].parentInvocationId, f.rows[0].id);
  assert.ok((await f.read(f.rows[0].id)).error);
  assert.deepEqual((await f.read(f.rows[1].id)).parsed, { ok: true });
  replies.push('invalid', '{"ok":true}');
  assert.deepEqual((await invokeStructuredLlmDetailed({ ...input, maxRepairAttempts: 1 })).data, { ok: true });
  assert.equal(f.rows[2].attemptNumber, 1);
  assert.equal(f.rows[3].attemptNumber, 2);
  assert.equal(f.rows[3].structuredMode, 'prompt_json');
  assert.equal(f.rows[3].parentInvocationId, f.rows[2].id);
  assert.notEqual(f.rows[2].chainId, f.rows[0].chainId);
  assert.ok((await f.read(f.rows[2].id)).error, 'repair must not overwrite the original parse failure');
  assert.equal((await f.read(f.rows[2].id)).parsed, null);
  assert.deepEqual((await f.read(f.rows[3].id)).parsed, { ok: true });
});

test('gzip roundtrip preserves Unicode and removes keys from messages, output, errors and parsed data', async () => {
  const data = { messages: [{ role: 'user', content: ['正文'.repeat(1000), { apiKey: 'hidden' }, 'opaque-key'] }], response: 'Bearer abc.def and sk-secret', parsed: { authorization: 'secret', value: 'opaque-key' }, error: 'opaque-key' };
  const compressed = await usage.encodeInvocationPayload(data, ['opaque-key']);
  assert.equal(compressed[0], 0x1f); assert.equal(compressed[1], 0x8b);
  assert.ok(compressed.length < 1000);
  const decoded = await usage.decodeInvocationPayload(compressed);
  assert.equal(decoded.messages[0].content[0], '正文'.repeat(1000));
  assert.doesNotMatch(JSON.stringify(decoded), /hidden|opaque-key|sk-secret|abc.def/);
  assert.equal(decoded.parsed.authorization, '[REDACTED]');
});

test('SQLite migration backfills duration for epoch and ISO timestamps without changing saved usage', () => {
  const db = new Database(':memory:');
  try {
    db.exec(fs.readFileSync(path.join(__dirname, '../src/prisma/migrations.sqlite/20261005010000_llm_invocation_usage/migration.sql'), 'utf8'));
    const insert = db.prepare('INSERT INTO LlmInvocationUsageRecord (id, requestProtocol, status, startedAt, finishedAt, totalTokens, cacheUsageStatus) VALUES (?, ?, ?, ?, ?, ?, ?)');
    insert.run('epoch', 'openai-compatible', 'completed', 1800000000000, 1800000002500, 42, 'unavailable');
    insert.run('iso', 'openai-compatible', 'completed', '2026-11-06T00:00:00.000Z', '2026-11-06T00:00:03.750Z', 84, 'unavailable');
    require('./fixtures/usageObservability.cjs')(db);
    assert.deepEqual(db.prepare('SELECT id, durationMs, firstTokenMs, attemptNumber, totalTokens FROM LlmInvocationUsageRecord ORDER BY id').all(), [
      { id: 'epoch', durationMs: 2500, firstTokenMs: null, attemptNumber: 1, totalTokens: 42 },
      { id: 'iso', durationMs: 3750, firstTokenMs: null, attemptNumber: 1, totalTokens: 84 },
    ]);
    db.pragma('foreign_keys = ON');
    db.prepare('INSERT INTO LlmInvocationPayload (usageRecordId, compressed, compressedBytes) VALUES (?, ?, ?)').run('epoch', Buffer.from('payload'), 7);
    assert.throws(() => db.prepare('INSERT INTO LlmInvocationPayload (usageRecordId, compressed, compressedBytes) VALUES (?, ?, ?)').run('epoch', Buffer.from('duplicate'), 9), /UNIQUE/);
    assert.throws(() => db.prepare('INSERT INTO LlmInvocationPayload (usageRecordId, compressed, compressedBytes) VALUES (?, ?, ?)').run('missing', Buffer.from('orphan'), 6), /FOREIGN KEY/);
  } finally { db.close(); }
});

async function database(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-observability-')), file = path.join(dir, 'test.db');
  const db = new Database(file);
  db.exec(fs.readFileSync(path.join(__dirname, '../src/prisma/migrations.sqlite/20261005010000_llm_invocation_usage/migration.sql'), 'utf8'));
  db.exec('CREATE TABLE Chapter (id TEXT PRIMARY KEY, content TEXT); INSERT INTO Chapter VALUES (\'saved\', \'protected\');');
  require('./fixtures/usageObservability.cjs')(db);
  assert.equal(db.prepare('SELECT content FROM Chapter').get().content, 'protected');
  db.close();
  const client = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: 'file:' + file }) });
  t.after(async () => { await client.$disconnect(); fs.rmSync(dir, { recursive: true, force: true }); });
  const repo = new usage.PrismaInvocationUsageRepository(client.llmInvocationUsageRecord);
  const write = (id, extra = {}) => repo.record({ invocationId: id, runId: null, generationJobId: null, workflowTaskId: null, novelId: 'book', chapterId: 'chapter', stage: 'writer', provider: 'fixture', model: 'test', requestProtocol: 'openai-compatible', promptId: null, promptVersion: null, status: 'completed', startedAt: new Date('2026-11-06'), finishedAt: new Date('2026-11-06T00:00:02Z'), durationMs: 2000, firstTokenMs: 100, chainId: 'chain', attemptNumber: 1, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }, ...extra });
  return { client, write, payloads: new usage.InvocationPayloadStore(client.llmInvocationPayload) };
}

test('payload/timing query is book-scoped, chains cross pages, and timing aggregates all filtered calls', async t => {
  const f = await database(t);
  await f.write('first');
  await f.write('second', { durationMs: 6000, attemptNumber: 2, parentInvocationId: 'first', structuredMode: 'prompt_json', stage: 'review' });
  await f.write('foreign', { novelId: 'other' });
  await f.payloads.save('second', { messages: [{ role: 'user', content: 'prompt' }], response: 'response', parsed: { ok: true }, error: null }, []);
  const scope = { novel: { id: 'book', title: 'Book' }, chapters: [{ id: 'chapter', order: 1, title: 'Chapter' }], workflowTaskIds: [], generationJobIds: [] };
  const q = new usage.NovelInvocationUsageQueryService(f.client.llmInvocationUsageRecord, async () => scope, f.payloads);
  const page = await q.getNovelUsage('book', { limit: 1 });
  assert.equal(page.items.length, 1);
  assert.equal(page.timing.averageMs, 4000);
  assert.deepEqual(page.timing.slowest, { invocationId: 'second', durationMs: 6000 });
  assert.deepEqual(page.timing.chapters[0].steps, [{ stage: 'review', durationMs: 6000 }, { stage: 'writer', durationMs: 2000 }]);
  assert.equal((await q.getNovelUsage('book', { stage: 'writer' })).timing.averageMs, 2000);
  const detail = await q.getInvocation('book', 'second');
  assert.equal(detail.item.firstTokenMs, 100);
  assert.equal(detail.item.durationMs, 6000);
  assert.equal(detail.payload.response, 'response');
  assert.deepEqual(detail.chain.map(row => row.invocationId), ['first', 'second']);
  assert.equal(detail.chain[1].parentInvocationId, 'first');
  await assert.rejects(q.getInvocation('book', 'foreign'), e => e.statusCode === 404);
  assert.equal((await q.getInvocation('book', 'first')).payload, null);
});

test('retention removes expired and oldest excess payloads, preserves usage rows and compressed byte accounting', async t => {
  const f = await database(t);
  for (const id of ['expired', 'oldest', 'newest']) await f.write(id);
  const data = { messages: [], response: 'body', parsed: null, error: null };
  for (const id of ['expired', 'oldest', 'newest']) await f.payloads.save(id, data, []);
  await f.client.llmInvocationPayload.update({ where: { usageRecordId: 'expired' }, data: { createdAt: new Date('2026-10-01') } });
  await f.client.llmInvocationPayload.update({ where: { usageRecordId: 'oldest' }, data: { createdAt: new Date('2026-11-04'), compressedBytes: 700_000 } });
  await f.client.llmInvocationPayload.update({ where: { usageRecordId: 'newest' }, data: { createdAt: new Date('2026-11-05'), compressedBytes: 700_000 } });
  assert.equal(await f.payloads.cleanup({ enabled: false, retentionDays: 7, maxMb: 1 }, new Date('2026-11-06')), 2);
  assert.equal(await f.payloads.read('expired'), null);
  assert.equal(await f.payloads.read('oldest'), null);
  assert.deepEqual(await f.payloads.read('newest'), data);
  assert.equal(await f.client.llmInvocationUsageRecord.count(), 3);
  await f.payloads.setParse('newest', { ok: true }, null, []);
  const saved = await f.client.llmInvocationPayload.findUnique({ where: { usageRecordId: 'newest' } });
  assert.equal(saved.compressedBytes, saved.compressed.length);
  assert.equal(await f.payloads.cleanup({ enabled: true, retentionDays: 7, maxMb: 1 }, new Date('2026-11-06')), 0);
});
