const test = require('node:test');
const assert = require('node:assert/strict');
const { loadRuntimeSource } = require('../novelProduction/sourceHarness.cjs');

function fixture() {
  const routes = new Map();
  const requests = [];
  const router = Object.fromEntries(['get', 'post', 'put', 'patch', 'delete', 'use'].map(method => [method,
    (path, ...handlers) => routes.set(`${method}:${path}`, handlers)]));
  const imports = {
    express: { Router: () => router }, zod: require('zod'),
    '../llm/providerSchema': { llmProviderSchema: require('zod').z.enum(['deepseek']) },
    '../middleware/auth': { authMiddleware: () => {} },
    '../middleware/validate': { validate: ({ body }) => (req) => { req.body = body.parse(req.body); } },
    '../services/styleEngine/StyleRecommendationService': { styleRecommendationService: {} },
  };
  for (const name of ['AntiAiPolicyResolver', 'AntiAiRuleService', 'StyleBindingService', 'StyleDetectionService',
    'StyleGenerationService', 'StyleProfileService', 'StyleRewriteService']) {
    imports[`../services/styleEngine/${name}`] = { [name]: class {
      async check(input) { requests.push(input); return { violations: [] }; }
      async rewrite(input) { requests.push(input); return { content: input.content, report: { violations: [] } }; }
    } };
  }
  loadRuntimeSource('../../../routes/styleEngine.ts', imports);
  return { requests, async call(path, body) {
    const handlers = routes.get(`post:${path}`);
    const req = { body };
    let response;
    const res = { status: () => res, json: value => { response = value; } };
    handlers[0](req);
    await handlers[1](req, res, error => { throw error; });
    return response;
  } };
}
test('manual rewrite accepts a direct request without invented issues and preserves original whitespace', async () => {
  const h = fixture();
  const content = '  \n张三缓缓打开木门。\n ';
  const response = await h.call('/style-detection/rewrite', { content });
  assert.deepEqual(h.requests[0].issues, []);
  assert.equal(h.requests[0].content, content);
  assert.equal(response.data.content, content);
  assert.match(response.message, /保留原稿/);
});
test('detection preserves source coordinates and rejects a whitespace-only manuscript', async () => {
  const h = fixture();
  await h.call('/style-detection/check', { content: '\n 张三打开木门。 ' });
  assert.equal(h.requests[0].content, '\n 张三打开木门。 ');
  await assert.rejects(h.call('/style-detection/check', { content: ' \n ' }), /正文不能为空/);
});
