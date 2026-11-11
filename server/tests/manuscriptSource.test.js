const test = require("node:test");
const assert = require("node:assert/strict");
const { decodeManuscript, detectRulePartition, sha256, validateManuscriptPartition } = require("../dist/modules/novel/manuscript/domain/source");

test("BOM overrides an explicit UTF-8 default and strict decoders preserve exact text", () => {
  const utf8 = Buffer.from("\ufeff前言\r\n😀\r\n第1章 正文\r\n尾章哨兵", "utf8");
  const decoded = decodeManuscript(utf8, "utf-8");
  assert.equal(decoded.text, "前言\r\n😀\r\n第1章 正文\r\n尾章哨兵");
  assert.equal(sha256(utf8), sha256(Buffer.from(utf8)));
  const utf16le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("正文😀", "utf16le")]);
  assert.deepEqual(decodeManuscript(utf16le, "utf-8"), { text: "正文😀", encoding: "utf-16le" });
  assert.throws(() => decodeManuscript(Buffer.from([0xff, 0xfe, 0x00])), /ENCODING_CONFIRM_REQUIRED/);
  assert.equal(decodeManuscript(Buffer.from([0xd6, 0xd0, 0xce, 0xc4]), "gb18030").text, "中文");
  assert.throws(() => decodeManuscript(Buffer.from(" \r\n\t ")), /MANUSCRIPT_EMPTY/);
});

test("rule partition conserves full CRLF and emoji source ranges", () => {
  const source = "\r\n前言😀\r\n目录\r\n第一章 海\r\n短章\r\n第二章 岸\r\n末尾哨兵";
  const units = detectRulePartition(source);
  const checked = validateManuscriptPartition(source, units);
  assert.equal(checked.coverageHash.length, 64);
  assert.equal(units[0].range.start, 0);
  assert.equal(units.at(-1).range.end, source.length);
  assert.ok(units.some(unit => source.slice(unit.range.start, unit.range.end).includes("末尾哨兵")));
  assert.throws(() => validateManuscriptPartition(source, [
    { draftId: "x", range: { start: 0, end: 1 }, role: "body", title: "x", needsReview: false },
    { draftId: "y", range: { start: 2, end: source.length }, role: "body", title: "y", needsReview: false },
  ]), /PARTITION_INCOMPLETE/);
  const emoji = "😀x";
  assert.throws(() => validateManuscriptPartition(emoji, [
    { draftId: "x", range: { start: 0, end: 1 }, role: "body", title: "x", needsReview: false },
    { draftId: "y", range: { start: 1, end: 3 }, role: "body", title: "y", needsReview: false },
  ]), /PARTITION_SURROGATE_SPLIT/);
  assert.throws(() => validateManuscriptPartition("ab", [
    { draftId: "same", range: { start: 0, end: 1 }, role: "body", title: "A", needsReview: false },
    { draftId: "same", range: { start: 1, end: 2 }, role: "body", title: "B", needsReview: false },
  ]), /PARTITION_DRAFT_ID_INVALID/);
  assert.throws(() => validateManuscriptPartition("x", [
    { draftId: "x", range: { start: 0, end: 1 }, role: "invented", title: "X", needsReview: false },
  ]), /PARTITION_INVALID_ROLE/);
  assert.throws(() => validateManuscriptPartition("x", [
    { draftId: "x", range: { start: 0, end: 1 }, role: "body", title: "x".repeat(201), needsReview: false },
  ]), /PARTITION_UNIT_INVALID/);
});

test("all heading candidates are retained, TOC and repeated body headings remain separate and unresolved", () => {
  const source = "开篇说明\r\n目录\r\nChapter 1: Arrival\r\nChapter 2: Return\r\n\r\n正文\r\nChapter 1: Arrival\r\n真实正文\r\nChapter 2: Return\r\n尾章哨兵";
  const units = detectRulePartition(source);
  assert.ok(units.some(unit => unit.title === "前言及未分类内容"));
  assert.ok(units.some(unit => unit.role === "toc"));
  assert.ok(units.filter(unit => unit.title === "Chapter 1: Arrival").length >= 2, "duplicate title candidates are preserved");
  assert.ok(units.every(unit => unit.needsReview), "ambiguous candidates are never auto-confirmed");
  assert.equal(units[0].range.start, 0);
  assert.equal(units.at(-1).range.end, source.length);
  assert.equal(units.map(unit => source.slice(unit.range.start, unit.range.end)).join(""), source);
});

test("source character and byte limits reject rather than truncate", () => {
  assert.throws(() => decodeManuscript(Buffer.alloc(20 * 1024 * 1024 + 1)), /MANUSCRIPT_SIZE_LIMIT/);
  assert.throws(() => decodeManuscript(Buffer.from("x".repeat(3_000_001))), /MANUSCRIPT_CHARACTER_LIMIT/);
});
