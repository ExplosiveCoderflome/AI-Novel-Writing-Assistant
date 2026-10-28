const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { claimModelRequest } = require('../../../dist/platform/llm/retries');
const target = path.resolve(__dirname, '../../../dist/modules/production/infrastructure/modelScope.js');
const scope = fs.existsSync(target) ? require(target) : {};
function api() { assert.equal(typeof scope.runWithProductionRequestBudget, 'function'); return scope.runWithProductionRequestBudget; }
test('every physical retry has a distinct durable reservation under its saved stage request', async () => {
  const reserved = []; let fences = 0;
  const result = await api()({ stageRequestKey: 'stage-key', maxRequests: 3,
    reserve: async input => { reserved.push(input); return true; }, fence: async () => { fences++; },
  }, async () => { for (let i = 0; i < 3; i++) await claimModelRequest(); return 'response'; });
  assert.equal(result, 'response');
  assert.equal(reserved.length, 3);
  assert.equal(new Set(reserved.map(x => x.requestKey)).size, 3);
  assert.deepEqual(reserved.map(x => x.ordinal), [1, 2, 3]);
  assert.equal(fences, 3);
});
test('a lower service cannot hide reservation denial as a quality warning or renew the allowance', async () => {
  let attempts = 0;
  await assert.rejects(api()({ stageRequestKey: 'stage-key', maxRequests: 2,
    reserve: async () => { attempts++; return false; }, fence: async () => {},
  }, async () => { try { await claimModelRequest(); } catch {} return { qualityDebt: 'model unavailable' }; }), { name: 'ProductionBudgetExceededError' });
  assert.equal(attempts, 1);
});
test('a swallowed fence failure remains fatal and a fixed physical allowance cannot be exceeded', async () => {
  await assert.rejects(api()({ stageRequestKey: 'stage', maxRequests: 1, reserve: async () => true,
    fence: async () => { throw new Error('cancelled'); },
  }, async () => { try { await claimModelRequest(); } catch {} return 'hidden'; }), /cancelled/);
  await assert.rejects(api()({ stageRequestKey: 'stage', maxRequests: 1, reserve: async () => true, fence: async () => {},
  }, async () => { await claimModelRequest(); await claimModelRequest(); }), { name: 'ProductionBudgetExceededError' });
});
