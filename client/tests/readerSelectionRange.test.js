import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import {
  buildHumanFeedbackInstruction,
  buildHumanFeedbackRepairBrief,
  buildParagraphWindowFromRange,
  resolveSelectedProseRange,
  splitParagraphRanges,
} from "../src/pages/directorNext/workspace/selectionRange.ts";
import { buildDomRangeForAbsoluteOffsets } from "../src/pages/novels/components/chapterEditor/document/selectionHighlight.ts";

test("splitParagraphRanges preserves exact character offsets across blank-line paragraphs", () => {
  const prose = "第一段第一句。\n第一段第二句。\n\n  \n第二段在这里。\n\n第三段收尾。";
  const paragraphs = splitParagraphRanges(prose);

  assert.equal(paragraphs.length, 3);
  for (const item of paragraphs) {
    assert.equal(prose.slice(item.from, item.to), item.text);
  }

  const targetFrom = prose.indexOf("第二段在这里。");
  const targetTo = targetFrom + "第二段在这里。".length;
  const window = buildParagraphWindowFromRange(paragraphs, targetFrom, targetTo);
  assert.deepEqual(window.beforeParagraphs, ["第一段第一句。\n第一段第二句。"]);
  assert.deepEqual(window.afterParagraphs, ["第三段收尾。"]);
});

test("human feedback instruction and repair brief carry selected tags and user guidance", () => {
  const instruction = buildHumanFeedbackInstruction(
    ["ai_taste", "off_voice"],
    "不要用书面总结，改成柜台找零的对话",
  );
  assert.match(instruction, /AI 味太重/);
  assert.match(instruction, /人物口吻不对/);
  assert.match(instruction, /不要用书面总结，改成柜台找零的对话/);

  const brief = buildHumanFeedbackRepairBrief(["padded_filler"], "去掉心里叹气");
  assert.match(brief.title, /废话\/过场太多/);
  assert.equal(brief.problemSummary, "去掉心里叹气");
  assert.equal(brief.mustPreserve?.length, 3);
});

test("buildDomRangeForAbsoluteOffsets highlights exact sub-paragraph substring rather than whole paragraph", () => {
  const { JSDOM } = createRequire(new URL("../../site/package.json", import.meta.url))("jsdom");
  const dom = new JSDOM("<div id='root'><p>他心中五味杂陈，转身走向柜台。</p><p>第二段内容。</p></div>");
  const prevDocument = globalThis.document;
  const prevNodeFilter = globalThis.NodeFilter;
  globalThis.document = dom.window.document;
  globalThis.NodeFilter = dom.window.NodeFilter;
  try {
    const paragraphs = Array.from(dom.window.document.querySelectorAll("p"));
    const texts = ["他心中五味杂陈，转身走向柜台。", "第二段内容。"];
    const domRange = buildDomRangeForAbsoluteOffsets(paragraphs, texts, 1, 7);
    assert.ok(domRange);
    assert.equal(domRange.toString(), "心中五味杂陈");
  } finally {
    globalThis.document = prevDocument;
    globalThis.NodeFilter = prevNodeFilter;
    dom.window.close();
  }
});

test("resolveSelectedProseRange captures sub-paragraph offsets and returns null when selection collapses", () => {
  const { JSDOM } = createRequire(new URL("../../site/package.json", import.meta.url))("jsdom");
  const content = "凌晨的风铃响了，他低头看着小票。\n\n门外站着一个穿灰大衣的女人。";
  const dom = new JSDOM(
    `<div id="prose"><p data-paragraph-index="0">凌晨的风铃响了，他低头看着小票。</p><p data-paragraph-index="1">门外站着一个穿灰大衣的女人。</p></div>`,
  );
  const prevDocument = globalThis.document;
  globalThis.document = dom.window.document;
  try {
    const container = dom.window.document.getElementById("prose");
    const firstP = container.querySelector("p[data-paragraph-index='0']");
    const textNode = firstP.firstChild;
    const range = dom.window.document.createRange();
    range.setStart(textNode, 8);
    range.setEnd(textNode, 15);
    const fakeSelection = {
      rangeCount: 1,
      isCollapsed: false,
      getRangeAt: () => range,
    };
    const paragraphs = splitParagraphRanges(content);
    const resolved = resolveSelectedProseRange(container, content, paragraphs, fakeSelection);
    assert.deepEqual(resolved, { from: 8, to: 15, text: "他低头看着小票" });

    const collapsedSelection = { rangeCount: 1, isCollapsed: true, getRangeAt: () => range };
    assert.equal(resolveSelectedProseRange(container, content, paragraphs, collapsedSelection), null);
  } finally {
    globalThis.document = prevDocument;
    dom.window.close();
  }
});

test("ChapterReader auto-clears deselected prose and anchors feedback inside prose container", () => {
  const readerSource = fs.readFileSync(
    new URL("../src/pages/directorNext/workspace/ChapterReader.tsx", import.meta.url),
    "utf8",
  );
  const editorSource = fs.readFileSync(
    new URL("../src/pages/novels/components/chapterEditor/ChapterTextEditor.tsx", import.meta.url),
    "utf8",
  );
  assert.match(readerSource, /addEventListener\("selectionchange"/);
  assert.match(readerSource, /computeSelectionAnchor/);
  assert.match(editorSource, /focusSource === "selection" && focusRequestKey === 0/);
  assert.match(editorSource, /chapter-editor-selection/);
});
