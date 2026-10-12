const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePipelinePayload, stringifyPipelinePayload } = require('../../dist/services/novel/pipelineJobState');
const { createStyleSignalPolicy } = require('../../../shared/dist/types/styleEngine.js');

test('job payload preserves full scanner policy through recovery serialization', () => {
  const original = { styleSignalPolicy: { ...createStyleSignalPolicy(), commaCount: 5,
    transitionTerms: ['值得注意的是', '因此可以认为'] }, autoRepair: true };
  const payload = stringifyPipelinePayload(original);
  assert.deepEqual(parsePipelinePayload(payload).styleSignalPolicy, original.styleSignalPolicy);
  const recovered = stringifyPipelinePayload({ ...parsePipelinePayload(payload), qualityAlertDetails: ['质量债'] });
  assert.deepEqual(parsePipelinePayload(recovered).styleSignalPolicy, original.styleSignalPolicy);
});
test('historical missing or unknown scanner policy cannot silently acquire new defaults', () => {
  for (const payload of ['{}', JSON.stringify({ styleSignalPolicy: { revision: 'future-unsupported' } })]) {
    const parsed = parsePipelinePayload(payload);
    assert.equal(parsed.styleSignalPolicy, undefined);
    assert.equal(JSON.parse(stringifyPipelinePayload(parsed)).styleSignalPolicy, undefined);
  }
});
test('invalid runtime policy cannot be persisted as a valid snapshot', () => {
  assert.throws(() => stringifyPipelinePayload({ styleSignalPolicy: { ...createStyleSignalPolicy(), maxFindings: 1000 } }), /8/);
});
