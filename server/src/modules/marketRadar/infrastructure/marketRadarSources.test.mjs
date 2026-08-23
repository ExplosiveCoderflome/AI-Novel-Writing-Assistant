import assert from "node:assert/strict";
import test from "node:test";
import {
  parseFanqieRanking,
  parseJinjiangRanking,
  parseQidianRanking,
} from "./marketRadarSources.ts";

const source = (platform, listKey, listLabel, sourceUrl) => ({
  platform, listKey, listLabel, sourceUrl, platformLabel: platform, channel: "general",
});

test("parses public Fanqie ranking metadata without chapter content", () => {
  const html = `<main><div class="rank-book-item"><div class="book-item-index"><h1>01</h1></div>
  <div class="title"><a href="/page/123">开局继承一座废城</a></div>
  <div class="author"><a><span>测试作者</span></a></div>
  <div class="desc abstract font-x">【领主+种田】主角醒来后发现城外怪物围城。</div>
  <div class="book-item-footer">连载中 在读：12万</div></div></main>`;
  const items = parseFanqieRanking(html, source("fanqie", "reading", "阅读榜", "https://fanqienovel.com/rank"));
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "开局继承一座废城");
  assert.deepEqual(items[0].tags, ["领主", "种田"]);
});

test("parses Qidian list rank, author and category", () => {
  const html = `<a href="//m.qidian.com/book/123/" data-bid="123"><div>
  <h2 class="title" title="月票榜第1位">夜巡司档案</h2>
  <p class="subTitle_x">某作者 <em>·</em> 悬疑 <em>·</em> 80万字</p></div></a>`;
  const items = parseQidianRanking(html, source("qidian", "monthly_ticket", "月票榜", "https://m.qidian.com/rank/yuepiao/"));
  assert.equal(items.length, 1);
  assert.equal(items[0].author, "某作者");
  assert.equal(items[0].category, "悬疑");
});

test("parses Jinjiang public monthly titles", () => {
  const html = `<ul><li><a href="/book2/6836927" class="track">在古代开医馆</a></li></ul>`;
  const items = parseJinjiangRanking(html, source("jinjiang", "monthly", "月度榜", "https://m.jjwxc.net/rank/naturalmore/5"));
  assert.equal(items.length, 1);
  assert.equal(items[0].rank, 1);
  assert.equal(items[0].sourceUrl, "https://m.jjwxc.net/book2/6836927");
});
