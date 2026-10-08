import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadReadingDisplayPreferences,
  saveReadingDisplayPreferences,
  normalizeReadingDisplayPreferences,
  readingTextStyle,
} from './displayPreferences.ts';

test('chosen typography survives reader remounts and restoring defaults replaces the saved choice', () => {
  const values = new Map();
  const storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
  saveReadingDisplayPreferences({fontSize: 25, font: 'kai'}, storage);
  const loaded = loadReadingDisplayPreferences(storage);
  assert.deepEqual(loaded, {fontSize: 25, font: 'kai'});
  const style = readingTextStyle(loaded);
  assert.equal(style.fontSize, '25px');
  assert.match(style.fontFamily, /KaiTi/);
  saveReadingDisplayPreferences(normalizeReadingDisplayPreferences(null), storage);
  assert.deepEqual(loadReadingDisplayPreferences(storage), {fontSize: 17, font: 'default'});
});

test('corrupt or unavailable browser storage cannot break chapter reading', () => {
  assert.deepEqual(loadReadingDisplayPreferences({getItem: () => '{broken'}), {fontSize: 17, font: 'default'});
  assert.deepEqual(loadReadingDisplayPreferences({getItem: () => {throw Error('denied');}}), {fontSize: 17, font: 'default'});
  assert.doesNotThrow(() => saveReadingDisplayPreferences({fontSize: 24, font: 'sans'}, {setItem: () => {throw Error('quota');}}));
  assert.deepEqual(loadReadingDisplayPreferences(null), {fontSize: 17, font: 'default'});
});

test('saved values are bounded and unknown fonts cannot become arbitrary CSS', () => {
  assert.deepEqual(normalizeReadingDisplayPreferences({fontSize: 999, font: 'song'}), {fontSize: 32, font: 'song'});
  assert.deepEqual(normalizeReadingDisplayPreferences({fontSize: -4, font: 'sans'}), {fontSize: 14, font: 'sans'});
  const invalid = normalizeReadingDisplayPreferences({fontSize: 'huge', font: 'url(https://invalid/font)'});
  assert.deepEqual(invalid, {fontSize: 17, font: 'default'});
  assert.ok(!readingTextStyle(invalid).fontFamily.includes('url('));
  assert.deepEqual(normalizeReadingDisplayPreferences({fontSize: NaN, font: 'kai'}), {fontSize: 17, font: 'kai'});
});
