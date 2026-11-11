import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatOutlineValue, localizeOutlineText } from "../src/pages/outlines/outlineNodes.ts";

const before = { story: { nodeId: "s", title: "总纲" }, volumes: [], chapters: [{ nodeId: "c", title: "第一章：来信" }], characters: [{ nodeId: "p", name: "苏禾" }], payoffs: [], facts: [] };
const after = { ...before, chapters: [{ nodeId: "c", title: "第一章：空信封" }] };

test("outline comparisons resolve arrays against each selected revision", () => {
  assert.equal(formatOutlineValue(["c"], "payoffChapterNodeIds", before), "第一章：来信");
  assert.equal(formatOutlineValue(["c"], "payoffChapterNodeIds", after), "第一章：空信封");
  assert.equal(formatOutlineValue(["p"], "characterNodeIds", before), "苏禾");
});
test("outline empty and deleted references are human readable", () => {
  assert.equal(formatOutlineValue([], "relatedNodeIds", before), "无");
  assert.equal(formatOutlineValue(["missing"], "relatedNodeIds", before), "（已删除的节点）");
  assert.equal(formatOutlineValue({ type: "chapter", nodeId: "c" }, "scope", before), "类型：章节；节点：第一章：来信");
});
test("proposal references include newly added and renamed nodes", () => {
  assert.equal(formatOutlineValue(["new-c"], "chapterNodeIds", before, { "new-c": "第二章：退潮" }), "第二章：退潮");
  assert.equal(formatOutlineValue("c", "volumeNodeId", before, { c: "新标题" }), "新标题");
});
test("model risk prose translates known fields and hides internal operation IDs", () => {
  assert.equal(localizeOutlineText("theme 重复；immutable=false；与 op-tone-07 保持一致", { "op-tone-07": "修改「总纲」" }), "主题 重复；可调整的设定；与 修改「总纲」 保持一致");
  assert.equal(localizeOutlineText("op-unknown-01 依赖 tone"), "相关修改 依赖 基调");
});
test("outline layout is scoped, independently scrollable and comparison columns use pane width", () => {
  const css = readFileSync(new URL("../src/pages/outlines/outlineWorkspace.css", import.meta.url), "utf8");
  assert.match(css, /@container \(min-width: 400px\)/);
  assert.match(css, /clamp\(420px, 32vw, 480px\)/);
  assert.match(css, /overflow-y: auto/);
  const sidebar = readFileSync(new URL("../src/components/layout/Sidebar.tsx", import.meta.url), "utf8");
  assert.ok(!sidebar.includes('"bg-primary/5 hover:bg-primary/10"'));
});
