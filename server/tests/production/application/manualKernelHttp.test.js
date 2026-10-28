const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const express = require('express');
const file = require('node:path').resolve(__dirname, '../../../dist/app/director/productionKernel/manual/http.js');
const api = fs.existsSync(file) ? require(file) : {};
async function fixture(t, handled) {
  assert.equal(typeof api.createManualChapterRouter, 'function');
  const calls = [], app = express(); app.use(express.json());
  app.use('/api/novels', api.createManualChapterRouter({handles: async () => handled,
    start: async (...args) => {calls.push(args); return 'run';},
    waitForResult: async () => ({content: '核对后选中的正文', review: {score: {overall: 88}, issues: [], auditReports: []}, runtimePackage: {chapterId: 'chapter'}})}));
  app.post('/api/novels/:id/chapters/:chapterId/:action', (req, res) => {calls.push('legacy'); res.json({legacy: true, body: req.body});});
  app.use((error, req, res, next) => res.status(error.statusCode || 500).json({error: error.message}));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return {calls, post: (path, body = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/novels/book/chapters/chapter/${path}`,
    {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)})};
}
test('V1 generation, repair and review reach the unchanged legacy handler', async t => {
  const f = await fixture(t, false);
  for (const path of ['generate', 'repair', 'review']) assert.equal((await (await f.post(path)).json()).legacy, true);
  assert.deepEqual(f.calls, ['legacy', 'legacy', 'legacy']);
});
test('V2 write and repair preserve the SSE final manuscript protocol', async t => {
  const f = await fixture(t, true);
  for (const path of ['generate', 'runtime/run', 'repair']) {
    const response = await f.post(path); const body = await response.text();
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    assert.match(body, /"type":"done","fullContent":"核对后选中的正文"/);
    assert.match(body, /"type":"runtime_package"/);
  }
  assert.deepEqual(f.calls.map(call => call[2]), ['write', 'write', 'repair']);
});
test('V2 review and scoped audit return compatible JSON from the persisted kernel result', async t => {
  const f = await fixture(t, true);
  for (const path of ['review', 'audit/full', 'audit/continuity', 'audit/character', 'audit/plot']) {
    const response = await f.post(path); const body = await response.json();
    assert.equal(body.success, true); assert.equal(body.data.score.overall, 88);
  }
  assert.ok(f.calls.every(call => call[2] === 'audit'));
});
