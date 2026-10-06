const test = require('node:test'), assert = require('node:assert/strict');
const {projectNovelUsage} = require('../dist/platform/llm/usage/domain/novelUsageProjection');

test('invalid cache counters cannot appear as reported book cache sums', () => {
  const group = status => ({chapterId: null, stage: null, provider: null, model: null, status: 'completed', cacheUsageStatus: status,
    _sum: {promptTokens: 100, completionTokens: 20, totalTokens: 120, cacheHitTokens: 80, cacheMissTokens: 20},
    _count: {_all: 1, promptTokens: 1, completionTokens: 1, totalTokens: 1, cacheHitTokens: 1, cacheMissTokens: 1}, _min: {startedAt: null}});
  const unknown = projectNovelUsage([group('invalid'), group('unavailable')]);
  assert.equal(unknown.totalTokens, 240);
  assert.equal(unknown.cacheHitTokens, null);
  assert.equal(unknown.cacheReportedCallCount, 0);
  const mixed = projectNovelUsage([group('reported'), group('invalid')]);
  assert.equal(mixed.cacheHitTokens, 80);
  assert.equal(mixed.cacheMissTokens, 20);
  assert.equal(mixed.cacheReportedCallCount, 1);
});
