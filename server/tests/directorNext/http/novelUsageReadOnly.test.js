const test = require('node:test'), assert = require('node:assert/strict');
const express = require('express'), {once} = require('node:events');
const {createDirectorNextRouter} = require('../../../dist/modules/director/http/routes');

test('book usage GET validates filters and stays read-only across new and manual runs', async () => {
  const reads = [];
  const forbidden = async () => { throw new Error('workflow mutation or projection forbidden'); };
  const app = express();
  app.use('/api/director-next', createDirectorNextRouter({
    commandService: {execute: forbidden}, runRepository: {getContract: forbidden},
    projectionService: {get: forbidden}, eventLog: {list: forbidden},
    readNovelUsage: async (id, query) => {
      if (id === 'missing') throw Object.assign(new Error('missing book'), {statusCode: 404});
      reads.push({id, query}); return {novel: {id, title: '测试小说'}, items: [], nextCursor: null};
    },
  }));
  app.use((error, req, res, next) => res.status(error.statusCode ?? 500).json({error: error.message}));
  const server = app.listen(0); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/director-next/novels/`;
  try {
    const response = await fetch(url + 'book/usage?limit=1&chapterId=chapter&stage=writer&model=flash&provider=deepseek&status=completed');
    assert.equal(response.status, 200);
    assert.deepEqual(reads[0], {id: 'book', query: {limit: 1, chapterId: 'chapter', stage: 'writer', model: 'flash', provider: 'deepseek', status: 'completed'}});
    for (const query of ['limit=0', 'limit=101', 'limit=1.5', 'status=running', 'stage=', 'model=', 'chapterId=']) {
      assert.equal((await fetch(url + 'book/usage?' + query)).status, 400, query);
    }
    assert.equal((await fetch(url + 'missing/usage')).status, 404);
    assert.equal(reads.length, 1);
  } finally { server.close(); await once(server, 'close'); }
});
