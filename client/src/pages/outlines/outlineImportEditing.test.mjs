import test from "node:test";
import assert from "node:assert/strict";
import { setImportChapterVolume, setImportReferences, toggleId, updateImportNodeTitle } from "./outlineImportEditing.ts";

function createDocument() {
  return {
    schemaVersion: 1,
    story: { nodeId: "story", title: "故事", premise: "", synopsis: "", theme: "", tone: "", endingDirection: "" },
    volumes: [
      { nodeId: "v1", title: "第一卷", order: 0, planningDepth: "rough", summary: "", chapterNodeIds: ["c1"] },
      { nodeId: "v2", title: "第二卷", order: 1, planningDepth: "rough", summary: "", chapterNodeIds: ["c2"] },
    ],
    chapters: [
      { nodeId: "c1", volumeNodeId: "v1", title: "第一章", order: 0, planningDepth: "rough", summary: "", characterNodeIds: [], payoffNodeIds: [] },
      { nodeId: "c2", volumeNodeId: "v2", title: "第二章", order: 1, planningDepth: "rough", summary: "", characterNodeIds: [], payoffNodeIds: [] },
    ],
    characters: [{ nodeId: "char1", name: "林澜", appearanceNodeIds: [] }],
    payoffs: [{ nodeId: "p1", title: "信件来源", kind: "mystery", setupDescription: "", payoffDescription: "", setupChapterNodeIds: [], payoffChapterNodeIds: [], relatedNodeIds: [] }],
    facts: [{ nodeId: "f1", title: "信件规则", content: "", scope: { type: "story" }, relatedNodeIds: [], immutable: false }],
  };
}

test("moving an imported chapter rebuilds both volume chapter lists", () => {
  const original = createDocument();
  const edited = setImportChapterVolume(original, "c1", "v2");
  assert.equal(edited.chapters[0].volumeNodeId, "v2");
  assert.deepEqual(edited.volumes[0].chapterNodeIds, []);
  assert.deepEqual(edited.volumes[1].chapterNodeIds, ["c1", "c2"]);
  assert.deepEqual(original.volumes[0].chapterNodeIds, ["c1"]);
});

test("import reference editing toggles IDs without duplicating selections", () => {
  const original = createDocument();
  const selected = toggleId(toggleId([], "char1"), "char1");
  assert.deepEqual(selected, []);
  const withCharacter = setImportReferences(original, "chapters", "c1", "characterNodeIds", ["char1"]);
  const withPayoff = setImportReferences(withCharacter, "payoffs", "p1", "payoffChapterNodeIds", ["c1"]);
  assert.deepEqual(withPayoff.chapters[0].characterNodeIds, ["char1"]);
  assert.deepEqual(withPayoff.payoffs[0].payoffChapterNodeIds, ["c1"]);
  assert.deepEqual(original.chapters[0].characterNodeIds, []);
});

test("import title editing uses names for characters and titles for other nodes", () => {
  const original = createDocument();
  const renamedCharacter = updateImportNodeTitle(original, "characters", "char1", "新名字");
  const renamedChapter = updateImportNodeTitle(renamedCharacter, "chapters", "c1", "新章节名");
  assert.equal(renamedChapter.characters[0].name, "新名字");
  assert.equal(renamedChapter.chapters[0].title, "新章节名");
  assert.equal(original.characters[0].name, "林澜");
});
