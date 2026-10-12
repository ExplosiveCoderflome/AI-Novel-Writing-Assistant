const test = require('node:test');
const assert = require('node:assert/strict');
const { styleDetectionPayloadSchema } = require('../../dist/prompting/prompts/style/style.promptSchemas');
const { styleDetectionPrompt } = require('../../dist/prompting/prompts/style/style.prompts');
const { renderStyleSignalEvidence } = require('../../dist/prompting/prompts/style/diagnostics');
const { scanStyleSignals } = require('../../dist/services/styleEngine/signals');
const { createStyleSignalPolicy } = require('../../../shared/dist/types/styleEngine.js');

test('perspective evidence survives runtime serialization while legacy reports remain readable', () => {
  const { styleDetectionReportSchema } = require('../../../shared/dist/types/chapterRuntime/qualitySchemas.js');
  const legacy = { riskScore: 12, summary: '表达提醒', violations: [], canAutoRewrite: false, appliedRuleIds: [] };
  assert.equal(styleDetectionReportSchema.parse(legacy).perspectiveCheck, undefined);
  const perspectiveCheck = { expected: 'third_person', observed: 'third_person', evidence: '他放下杯子。' };
  assert.deepEqual(styleDetectionReportSchema.parse({ ...legacy, perspectiveCheck }).perspectiveCheck, perspectiveCheck);
});

test('style prompts require information gain before excusing repeated structures or bodily action loops', () => {
  const { STYLE_DIAGNOSTIC_RULES } = require('../../dist/prompting/prompts/style/diagnostics');
  const { chapterAcceptanceAssessmentPrompt } = require('../../dist/prompting/prompts/novel/chapterAcceptance.prompts');
  const guidance = STYLE_DIAGNOSTIC_RULES.join('\n');
  assert.match(guidance, /不以情绪递进或题材需要笼统豁免/);
  assert.match(guidance, /既不改变选择\/信息\/关系/);
  assert.match(guidance, /有实际变化则保留/);
  const messages = chapterAcceptanceAssessmentPrompt.render({ novelTitle: '测试', chapterOrder: 1, chapterTitle: '测试',
    content: '他推开门。', styleReviewEnabled: true, expectedNarrativePov: 'third_person',
  }, { blocks: [], selectedBlockIds: [], droppedBlockIds: [], summarizedBlockIds: [], estimatedInputTokens: 0 });
  assert.match(messages.map(x => x.content).join('\n'), /perspectiveCheck/);
  assert.match(messages.map(x => x.content).join('\n'), /单个对话或内心引语的我不改变叙述人称/);
});

test('ordinary contract findings accept null rule IDs without schema repair', () => {
  const output = styleDetectionPayloadSchema.parse({ riskScore: 40, summary: '句式聚集', violations: [{
    ruleId: null, ruleName: '动作副词堆叠', ruleType: 'style', severity: 'medium', layer: 'surface',
    excerpt: '他缓缓走近，微微侧身，又轻轻推开了木门。', reason: '同一句堆叠副词', suggestion: '减少副词', canAutoRewrite: true,
  }] });
  assert.doesNotThrow(() => styleDetectionPrompt.postValidate(output, {
    content: output.violations[0].excerpt, allowedRuleIds: ['real-rule-id'],
  }));
  assert.throws(() => styleDetectionPrompt.postValidate({ ...output, violations: [{
    ...output.violations[0], ruleId: 'surface.action-adverb-stack',
  }] }, { content: output.violations[0].excerpt, allowedRuleIds: ['real-rule-id'] }), /未提供的规则/);
});

test('model evidence uses a distinct statistical label while stored scanner IDs stay intact', () => {
  const scan = scanStyleSignals('不可否认。不可否认。', createStyleSignalPolicy());
  const rendered = JSON.parse(renderStyleSignalEvidence(scan));
  assert.equal(rendered.findings[0].signalCode, 'template.transition');
  assert.equal(rendered.findings[0].ruleId, undefined);
  assert.equal(scan.findings[0].ruleId, 'template.transition');
});

test('model signal examples are bounded without changing stored evidence or policy', () => {
  const scan = scanStyleSignals('不可否认，这是第一句长一点的说明。不可否认，这是第二句长一点的说明。不可否认，这是第三句长一点的说明。', createStyleSignalPolicy());
  const original = JSON.stringify(scan);
  const rendered = JSON.parse(renderStyleSignalEvidence(scan));
  assert.equal(scan.findings.length, 2);
  assert.equal(rendered.findings.length, 1);
  assert.equal(rendered.findings[0].from, undefined);
  assert.equal(rendered.findings[0].matchedTerms, undefined);
  assert.equal(rendered.findings[0].hits, scan.findings[0].hits);
  assert.equal(JSON.stringify(scan), original);
});

test('compressed or stitched excerpts are rejected instead of accepted as current prose', () => {
  const output = styleDetectionPayloadSchema.parse({ violations: [{
    ruleId: null, ruleName: '句式重复', ruleType: 'style', severity: 'medium', layer: 'surface',
    excerpt: '他缓缓走近……轻轻推开了木门。', reason: '副词堆叠', suggestion: '减少副词', canAutoRewrite: true,
  }] });
  assert.throws(() => styleDetectionPrompt.postValidate(output, {
    content: '他缓缓走近，微微侧身，又轻轻推开了木门。', allowedRuleIds: [],
  }), /当前正文/);
});
