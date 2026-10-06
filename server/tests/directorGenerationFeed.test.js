const test = require('node:test');
const assert = require('node:assert/strict');
const { ChapterGenerationFeed } = require('../dist/services/novel/production/observation');

test('live previews replay the current text, isolate books and ignore a replaced execution', () => {
  const feed = new ChapterGenerationFeed();
  const first = feed.begin({novelId:'n', chapterId:'c1', chapterOrder:1, chapterTitle:'第一章'});
  feed.update(first, 'writing', '开');
  feed.update(first, 'writing', '开篇');
  const seen = [];
  const stop = feed.subscribe('n', value => seen.push(value));
  assert.equal(seen[0].content, '开篇');
  feed.begin({novelId:'other', chapterId:'c2', chapterOrder:2, chapterTitle:'其他书'});
  assert.equal(seen.length, 1);
  const next = feed.begin({novelId:'n', chapterId:'c3', chapterOrder:3, chapterTitle:'第三章'});
  feed.update(first, 'saved', '过期正文');
  assert.equal(feed.read('n').chapterId, 'c3');
  feed.update(next, 'checking', '检查中的草稿');
  feed.update(next, 'saved', '保存后的正文');
  assert.equal(seen.at(-1).content, '保存后的正文');
  assert.equal(seen.at(-1).state, 'saved');
  assert.ok(seen.at(-1).revision > seen[0].revision);
  stop();
  feed.update(next, 'interrupted', '保存后的正文');
  assert.equal(seen.at(-1).state, 'saved');
});

test('observers cannot fail production and retained previews are bounded and expire', () => {
  let now = 0;
  const feed = new ChapterGenerationFeed({maxBooks:2, maxContentLength:20, ttlMs:100, now:()=>now});
  const first = feed.begin({novelId:'a', chapterId:'c', chapterOrder:1, chapterTitle:'章'});
  const stop = feed.subscribe('a', () => {throw new Error('broken viewer');});
  assert.doesNotThrow(() => feed.update(first, 'writing', 'x'.repeat(50)));
  assert.equal(feed.read('a').content.length, 20);
  feed.begin({novelId:'b', chapterId:'c', chapterOrder:1, chapterTitle:'章'});
  feed.begin({novelId:'c', chapterId:'c', chapterOrder:1, chapterTitle:'章'});
  assert.equal(feed.read('a'), null);
  now = 101;
  assert.equal(feed.read('c'), null);
  stop();
});
