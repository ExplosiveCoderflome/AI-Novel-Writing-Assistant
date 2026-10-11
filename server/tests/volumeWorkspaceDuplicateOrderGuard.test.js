const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findDuplicateOrders,
} = require("../dist/services/novel/volume/volumeWorkspacePersistence.js");

function makeDocument(volumes) {
  return { novelId: "novel-1", workspaceVersion: "v2", volumes };
}

function makeVolume(id, sortOrder, title, chapters) {
  return { id, novelId: "novel-1", sortOrder, title, chapters };
}

function makeChapter(id, volumeId, chapterOrder) {
  return { id, volumeId, chapterOrder, title: `章节-${id}`, summary: "" };
}

test("findDuplicateOrders 对干净文档返回空数组", () => {
  const document = makeDocument([
    makeVolume("v1", 1, "第一卷", [makeChapter("c1", "v1", 1), makeChapter("c2", "v1", 2)]),
    makeVolume("v2", 2, "第二卷", [makeChapter("c3", "v2", 1)]),
  ]);
  assert.deepEqual(findDuplicateOrders(document), []);
});

test("findDuplicateOrders 检出同一卷内重复的章节序号", () => {
  const document = makeDocument([
    makeVolume("v1", 1, "第一卷", [
      makeChapter("c1", "v1", 1),
      makeChapter("c2", "v1", 1),
      makeChapter("c3", "v1", 2),
    ]),
  ]);
  const duplicates = findDuplicateOrders(document);
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].scope, "chapter");
  assert.equal(duplicates[0].order, 1);
  assert.equal(duplicates[0].volumeTitle, "第一卷");
  assert.deepEqual(duplicates[0].ids, ["c1", "c2"]);
});

test("findDuplicateOrders 检出重复的卷序号", () => {
  const document = makeDocument([
    makeVolume("v1", 1, "第一卷", []),
    makeVolume("v2", 1, "第二卷", []),
  ]);
  const duplicates = findDuplicateOrders(document);
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].scope, "volume");
  assert.equal(duplicates[0].order, 1);
});

test("findDuplicateOrders 不把跨卷相同的章节序号当重复", () => {
  const document = makeDocument([
    makeVolume("v1", 1, "第一卷", [makeChapter("c1", "v1", 1)]),
    makeVolume("v2", 2, "第二卷", [makeChapter("c2", "v2", 1)]),
  ]);
  assert.deepEqual(findDuplicateOrders(document), []);
});
