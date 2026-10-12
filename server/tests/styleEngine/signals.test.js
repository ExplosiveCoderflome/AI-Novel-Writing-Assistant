const test = require('node:test');
const assert = require('node:assert/strict');
const { scanStyleSignals } = require('../../dist/services/styleEngine/signals');
const { createStyleSignalPolicy, styleSignalScanSchema } = require('../../../shared/dist/types/styleEngine.js');
const scan = (text, overrides = {}) => scanStyleSignals(text, { ...createStyleSignalPolicy(), ...overrides });
const rule = (text, id, overrides) => scan(text, overrides).findings.filter(item => item.ruleId === id);
const sentence = (size, commas) => '甲'.repeat(size - commas) + '，'.repeat(commas);

test('transition evidence starts at the repeated occurrence, never grants a verdict for first use', () => {
  const text = '值得注意的是，门没锁。值得注意的是，窗也没锁。';
  const result = rule(text, 'template.transition');
  assert.equal(result.length, 1);
  assert.equal(result[0].matchFrom, text.lastIndexOf('值得注意的是'));
  assert.equal(result[0].hits, 2);
});
test('one transition and two distinct first-use transitions have no repetition evidence', () => {
  assert.deepEqual(rule('值得注意的是，门没锁。', 'template.transition'), []);
  assert.deepEqual(rule('值得注意的是，门没锁。不可否认，窗也没锁。', 'template.transition'), []);
});
test('chapter repetition crosses short sentences and paragraphs, with a configurable threshold', () => {
  const text = '不可否认。\n不可否认。';
  assert.equal(rule(text, 'template.transition').length, 1);
  assert.equal(rule(text, 'template.transition', { transitionRepeatCount: 3 }).length, 0);
});

test('a bounded repeated-expression excerpt still contains the occurrence it identifies', () => {
  const term = '值得注意的是';
  const text = term + '甲'.repeat(30) + term + '乙'.repeat(30);
  const item = rule(text, 'template.transition', { excerptCharacters: 24 })[0];
  assert.ok(item.excerpt.includes(term));
  assert.equal(item.from, text.lastIndexOf(term));
});
test('comma density finds an 80-character sentence with four commas', () => {
  const result = rule(sentence(80, 4), 'rhythm.comma-density');
  assert.equal(result.length, 1);
  assert.equal(result[0].characters, 80);
  assert.equal(result[0].commas, 4);
});
test('comma density does not combine distinct sentences or paragraphs', () => {
  for (const text of [sentence(40, 4) + '。' + sentence(40, 4), sentence(40, 4) + '\n' + sentence(40, 4)]) {
    assert.equal(rule(text, 'rhythm.comma-density').length, 0);
  }
});
test('comma density respects 79/80 characters and 3/4 commas, including ASCII commas', () => {
  assert.equal(rule(sentence(79, 4), 'rhythm.comma-density').length, 0);
  assert.equal(rule(sentence(80, 3), 'rhythm.comma-density').length, 0);
  assert.equal(rule(sentence(80, 4).replaceAll('，', ','), 'rhythm.comma-density').length, 1);
});
test('softener clustering counts different terms in the same sentence', () => {
  const result = rule('他似乎见到仿佛是一种幻象的影子在院子里浮现。', 'surface.repeated-softeners');
  assert.equal(result.length, 1);
  assert.equal(result[0].hits, 3);
});
test('softener signals skip short sentences and meaningful evidence remains for AI to decide', () => {
  assert.equal(rule('似乎仿佛一种。', 'surface.repeated-softeners').length, 0);
  assert.equal(rule('他似乎见到了仿佛幻象的影子在院子里浮现。', 'surface.repeated-softeners').length, 0);
});
test('softener 2/3 boundary applies only within each sentence, including ellipses', () => {
  const id = 'surface.repeated-softeners';
  assert.equal(rule('他似乎见到了仿佛幻象的影子……一种景象在窗外浮现。', id).length, 0);
  assert.equal(rule('他似乎见到了仿佛幻象的影子...一种景象在窗外浮现。', id).length, 0);
  assert.equal(rule('他似乎见到了仿佛幻象的影子，一种景象在窗外浮现。', id).length, 1);
});
test('action adverb clustering finds three occurrences without requiring the same adverb', () => {
  const result = rule('他缓缓走近，微微侧身，又轻轻推开了木门。', 'surface.action-adverb-stack');
  assert.equal(result.length, 1);
  assert.equal(result[0].hits, 3);
});
test('action signals leave two occurrences and short sentences alone', () => {
  const id = 'surface.action-adverb-stack';
  assert.equal(rule('他缓缓走近，微微侧身，推开了木门。', id).length, 0);
  assert.equal(rule('缓缓微微轻轻。', id).length, 0);
});
test('action 2/3 boundary is versioned and quotation is preserved rather than exempted by a verdict', () => {
  const text = '“他缓缓走近，微微侧身，又轻轻推开了木门。”';
  const id = 'surface.action-adverb-stack';
  assert.equal(rule(text, id).length, 1);
  assert.equal(rule(text, id, { clusterCount: 4 }).length, 0);
  assert.equal(rule(text, id)[0].excerpt, text);
});
test('Unicode character counts and UTF-16 normalized offsets use different units', () => {
  const text = '😀开头\r\n' + '😀'.repeat(76) + '，'.repeat(4);
  const normalized = text.replaceAll('\r\n', '\n');
  const item = rule(text, 'rhythm.comma-density')[0];
  assert.equal(item.characters, 80);
  assert.equal(item.from, '😀开头\n'.length);
  assert.equal(normalized.slice(item.from, item.to), item.excerpt);
  assert.equal(item.to - item.from, 156);
});
test('evidence is bounded per rule and in total without trimming source whitespace', () => {
  const text = '  \n' + ('值得注意的是，他似乎看到仿佛一种幻象。他缓缓微微轻轻走到门前。' + sentence(80, 4) + '。').repeat(20);
  const result = scan(text);
  assert.equal(result.findings.length, 8);
  for (const item of result.findings) {
    assert.equal(text.slice(item.from, item.to), item.excerpt);
    assert.ok(result.findings.filter(other => other.ruleId === item.ruleId).length <= 2);
  }
  assert.deepEqual(styleSignalScanSchema.parse(result), result);
});
test('policy words and thresholds are copied into each scan result and do not mutate caller state', () => {
  const policy = createStyleSignalPolicy();
  const result = scanStyleSignals('不可否认。不可否认。', policy);
  policy.transitionTerms.length = 0;
  assert.ok(result.policy.transitionTerms.length > 0);
  assert.throws(() => scan('正文', { revision: 'unknown' }), /style-signals-v1/);
});
