import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const path = new URL('../src/pages/novelUsage/presentation.ts', import.meta.url);
async function presentation() {
  assert.ok(fs.existsSync(path), 'novel usage presentation must distinguish unknown usage');
  return import(path.href);
}

test('reported zero is distinct from unknown token counts', async () => {
  const {formatUsageTokens} = await presentation();
  assert.equal(formatUsageTokens(0), '0');
  assert.equal(formatUsageTokens(null), '未提供');
  assert.equal(formatUsageTokens(undefined), '未提供');
  assert.equal(formatUsageTokens(1000), (1000).toLocaleString());
});

test('incomplete book coverage is explicit without inventing lifetime totals or double-adding cache', async () => {
  const {usageCoverageNotes} = await presentation();
  const notes = usageCoverageNotes({recordedCallCount: 5, unknownUsageCallCount: 1, cacheReportedCallCount: 3, partialCallCount: 1, failedCallCount: 1});
  assert.ok(notes.some(note => note.includes('1 次调用未返回 Token')));
  assert.ok(notes.some(note => note.includes('3/5')));
  assert.ok(notes.some(note => note.includes('部分返回')));
  assert.equal(usageCoverageNotes({recordedCallCount: 1, unknownUsageCallCount: 0, cacheReportedCallCount: 1, partialCallCount: 0, failedCallCount: 0}).length, 0);
});

test('filter clearing omits parameters and status is validated without mutating a workflow', async () => {
  const {usageFiltersFromParams} = await presentation();
  assert.deepEqual(usageFiltersFromParams(new URLSearchParams()), {});
  assert.deepEqual(usageFiltersFromParams(new URLSearchParams('chapterId=ch&model=flash&status=failed')), {chapterId: 'ch', model: 'flash', status: 'failed'});
  assert.deepEqual(usageFiltersFromParams(new URLSearchParams('status=running&stage=')), {});
});
