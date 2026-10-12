const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const Database = require('better-sqlite3');
const { NovelInvocationUsageQueryService, PrismaInvocationUsageRepository } = require('../dist/platform/llm/usage');

async function fixture(t) {
  assert.equal(typeof NovelInvocationUsageQueryService, 'function', 'book-level journal query must exist');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-usage-'));
  const file = path.join(dir, 'fixture.db');
  const db = new Database(file);
  db.exec(fs.readFileSync(path.join(__dirname, '../src/prisma/migrations.sqlite/20261005010000_llm_invocation_usage/migration.sql'), 'utf8'));
  db.close();
  const prisma = new PrismaClient({adapter: new PrismaBetterSqlite3({url: 'file:' + file})});
  t.after(async () => { await prisma.$disconnect(); fs.rmSync(dir, {recursive: true, force: true}); });
  const scope = {novel: {id: 'book', title: '测试小说'}, chapters: [{id: 'chapter', order: 1, title: '第一章'}], workflowTaskIds: ['opening'], generationJobIds: ['job']};
  const service = new NovelInvocationUsageQueryService(prisma.llmInvocationUsageRecord, async id => id === 'book' ? scope : id === 'other' ? {...scope, novel: {id: 'other', title: '另一本'}, workflowTaskIds: [], generationJobIds: []} : null);
  const repo = new PrismaInvocationUsageRepository(prisma.llmInvocationUsageRecord);
  const write = (id, extra = {}) => repo.record({invocationId: id, novelId: 'book', runId: 'run-1', generationJobId: null, workflowTaskId: null, chapterId: 'chapter', stage: 'writer', provider: 'deepseek', model: 'flash', requestProtocol: 'openai-compatible', promptId: 'novel.chapter.writer', promptVersion: 'v8', status: 'completed', startedAt: new Date('2026-10-05T10:00:00Z'), finishedAt: new Date('2026-10-05T10:00:01Z'), usage: {promptTokens: 100, completionTokens: 20, totalTokens: 120, inputCache: {cacheHitTokens: 80, cacheMissTokens: 20, cacheWriteTokens: null, cacheUsageStatus: 'reported'}}, ...extra});
  return {service, write, prisma};
}

test('novel journal spans runs, manual calls and linked opening calls without duplicate counters or cross-book leakage', async t => {
  const f = await fixture(t);
  await f.write('a'); await f.write('a');
  await f.write('b', {runId: 'run-2'});
  await f.write('manual', {runId: null});
  await f.write('opening', {novelId: null, workflowTaskId: 'opening', chapterId: null, stage: 'planning'});
  await f.write('job', {novelId: null, generationJobId: 'job'});
  await f.write('foreign', {novelId: 'other', workflowTaskId: 'opening'});
  await f.write('unbound', {novelId: null});
  const page = await f.service.getNovelUsage('book', {limit: 1});
  assert.equal(page.summary.recordedCallCount, 5);
  assert.equal(page.summary.totalTokens, 600);
  assert.equal(page.summary.promptTokens, 500);
  assert.equal(page.summary.cacheHitTokens, 400);
  assert.equal(page.items.length, 1);
  assert.equal(page.novel.title, '测试小说');
  assert.equal(page.chapterBreakdown.find(g => g.chapterId === null).totalTokens, 120);
  const ids = [page.items[0].invocationId];
  let cursor = page.nextCursor;
  while (cursor) { const next = await f.service.getNovelUsage('book', {limit: 1, cursor}); ids.push(next.items[0].invocationId); cursor = next.nextCursor; }
  assert.equal(new Set(ids).size, 5);
  assert.ok(!ids.includes('foreign') && !ids.includes('unbound'));
});

test('unknown and partial reports preserve known sums and disclose coverage, never fabricate zero', async t => {
  const f = await fixture(t);
  await f.write('known');
  await f.write('unknown', {usage: null, status: 'failed'});
  await f.write('partial', {status: 'partial', usage: {promptTokens: 10, completionTokens: 2, totalTokens: 12}});
  const p = await f.service.getNovelUsage('book', {});
  assert.equal(p.summary.totalTokens, 132);
  assert.equal(p.summary.unknownUsageCallCount, 1);
  assert.equal(p.summary.cacheReportedCallCount, 1);
  assert.equal(p.summary.cacheHitTokens, 80);
  assert.equal(p.summary.partialCallCount, 1);
  assert.equal(p.summary.failedCallCount, 1);
  assert.equal(p.items.find(r => r.invocationId === 'unknown').totalTokens, null);
});

test('filters constrain details and filtered sums while full-book summary and facets stay global', async t => {
  const f = await fixture(t);
  await f.write('writer');
  await f.write('review', {stage: 'review', model: 'other-model', provider: 'other-provider', chapterId: null});
  const p = await f.service.getNovelUsage('book', {stage: 'review', model: 'other-model', provider: 'other-provider'});
  assert.equal(p.items.length, 1);
  assert.equal(p.filteredSummary.totalTokens, 120);
  assert.equal(p.summary.totalTokens, 240);
  assert.deepEqual(p.facets.stages, ['review', 'writer']);
  assert.equal((await f.service.getNovelUsage('book', {chapterId: 'chapter'})).items[0].invocationId, 'writer');
  assert.equal((await f.service.getNovelUsage('book', {status: 'failed'})).filteredSummary.recordedCallCount, 0);
  await assert.rejects(f.service.getNovelUsage('book', {chapterId: 'foreign-chapter'}), /章节/);
});

test('cursor binds book and all filters and stable timestamp/id pagination; limits are validated', async t => {
  const f = await fixture(t);
  await f.write('a'); await f.write('b');
  const p = await f.service.getNovelUsage('book', {stage: 'writer', limit: 1});
  assert.equal(p.items[0].invocationId, 'b');
  const next = await f.service.getNovelUsage('book', {stage: 'writer', limit: 2, cursor: p.nextCursor});
  assert.equal(next.items[0].invocationId, 'a');
  for (const [book, query] of [['other', {stage: 'writer'}], ['book', {}], ['book', {stage: 'writer', model: 'flash'}]]) {
    await assert.rejects(f.service.getNovelUsage(book, {...query, cursor: p.nextCursor}), /分页/);
  }
  await assert.rejects(f.service.getNovelUsage('book', {cursor: 'bad'}), /分页/);
  for (const limit of [0, 101, 1.5]) await assert.rejects(f.service.getNovelUsage('book', {limit}), /limit/);
});

test('empty books and missing books are distinct; all-unknown totals remain unknown', async t => {
  const f = await fixture(t);
  const empty = await f.service.getNovelUsage('book', {});
  assert.equal(empty.summary.recordedCallCount, 0);
  assert.equal(empty.summary.totalTokens, null);
  assert.equal(empty.nextCursor, null);
  await assert.rejects(f.service.getNovelUsage('missing', {}), e => e.statusCode === 404);
  await f.write('failed', {usage: null, status: 'failed'});
  assert.equal((await f.service.getNovelUsage('book', {})).summary.totalTokens, null);
});

test('details use bounded database pagination, not an unbounded raw journal read', async t => {
  const f = await fixture(t);
  await f.write('a'); await f.write('b');
  const calls = [], original = f.prisma.llmInvocationUsageRecord.findMany;
  f.prisma.llmInvocationUsageRecord.findMany = async args => { calls.push(args); return original.call(f.prisma.llmInvocationUsageRecord, args); };
  await f.service.getNovelUsage('book', {limit: 1});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].take, 2);
});
