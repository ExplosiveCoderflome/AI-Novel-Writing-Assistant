import test from 'node:test';
import assert from 'node:assert/strict';
import {paginateCaptions} from '../scripts/caption-pages.mjs';

const tokens = [
  ['每次', 0, 400],
  ['重读', 400, 800],
  ['黑塞的', 800, 1300],
  ['《悉达多》，', 1300, 2100],
  ['都会', 2300, 2700],
  ['陷入', 2700, 3100],
  ['久久沉默。', 3100, 4000],
].map(([text, startMs, endMs]) => ({text, startMs, endMs, timestampMs: startMs, confidence: 1}));

test('把词级结果合并为短字幕块', () => {
  const pages = paginateCaptions(tokens, {maxChars: 10, maxDurationMs: 2600});
  assert.ok(pages.length >= 2);
  assert.ok(pages.every((page) => [...page.text].length <= 10));
  assert.ok(pages.every((page) => page.endMs > page.startMs));
  assert.ok(pages.every((page, index) => index === 0 || page.startMs >= pages[index - 1].endMs));
  assert.equal(pages.map((page) => page.text).join(''), '每次重读黑塞的《悉达多》，都会陷入久久沉默。');
});

test('超长单块会按字符数拆分并保留时间顺序', () => {
  const pages = paginateCaptions(
    [{text: '真理无法由别人传授每个人的路只能自己走', startMs: 1000, endMs: 5000}],
    {maxChars: 8},
  );
  assert.equal(pages.length, 3);
  assert.ok(pages.every((page) => [...page.text].length <= 8));
  assert.equal(pages[0].startMs, 1000);
  assert.equal(pages.at(-1).endMs, 5000);
});
