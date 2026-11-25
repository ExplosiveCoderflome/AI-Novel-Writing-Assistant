import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { nodeStyles } from "./support/nodeStyles.js";
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
  assert.match(editorSource, /AI 标识\/改…/);
  assert.doesNotMatch(editorSource, /标为反例\.\.\./);

  const shellSource = fs.readFileSync(
    new URL("../src/pages/novels/components/chapterEditor/ChapterEditorShell.tsx", import.meta.url),
    "utf8",
  );
  assert.match(shellSource, /isLocked=\{isChapterLocked\}/);
  assert.match(shellSource, /readOnly=\{isChapterLocked \|\| session\.status !== "idle"\}/);
  assert.match(shellSource, /!isChapterLocked && isDirty && !saveMutation\.isPending/);
});

test("QuickHumanFeedbackBar and ChapterEditorSidebar support unified AI markers and lock toggle", async () => {
  const clientDir = fileURLToPath(new URL("../", import.meta.url));
  const bundlePath = path.join(clientDir, "tests", `.quick-feedback-sidebar-${process.pid}.mjs`);
  const { JSDOM } = createRequire(new URL("../../site/package.json", import.meta.url))("jsdom");
  const { build } = createRequire(import.meta.resolve("vite"))("esbuild");

  await build({
    stdin: {
      resolveDir: clientDir,
      loader: "tsx",
      contents: `
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QuickHumanFeedbackBar } from "./src/pages/novels/components/chapterEditor/assistant/QuickHumanFeedbackBar";
import ChapterEditorSidebar from "./src/pages/novels/components/chapterEditor/ChapterEditorSidebar";

export async function runFeedbackAndSidebar() {
  const feedbacks = [];
  const instructions = [];
  let toggled = 0;
  const root = createRoot(document.getElementById("root"));
  try {
    await act(async () => {
      root.render(
        <div>
          <QuickHumanFeedbackBar
            onInstruction={(text) => instructions.push(text)}
            onFeedback={(payload) => feedbacks.push(payload)}
          />
          <ChapterEditorSidebar
            chapter={{ id: "c1", order: 1, title: "雨夜值班" }}
            workspace={null}
            workspaceStatus="ready"
            wordCount={1200}
            saveStatusLabel="已保存"
            provenanceLabel="人工锁定"
            isLocked={true}
            isTogglingLock={false}
            onToggleLock={() => { toggled += 1; }}
            isDirty={false}
            isSaving={false}
            selectedDiagnosticId={null}
            onSave={() => {}}
            onFocusDiagnostic={() => {}}
            onRunDiagnostic={() => {}}
            onResolveDiagnostic={() => {}}
          />
          <div data-testid="dirty-locked-check">
            <ChapterEditorSidebar
              chapter={{ id: "c2", order: 2, title: "柜台夜班" }}
              workspace={null}
              workspaceStatus="ready"
              wordCount={800}
              saveStatusLabel="未保存"
              provenanceLabel="人工锁定"
              isLocked={true}
              isDirty={true}
              isSaving={false}
              selectedDiagnosticId={null}
              onSave={() => {}}
              onFocusDiagnostic={() => {}}
              onRunDiagnostic={() => {}}
              onResolveDiagnostic={() => {}}
            />
          </div>
        </div>
      );
    });

    const clickButton = async (label) => {
      const btn = [...document.querySelectorAll("button")].find((node) => node.textContent.trim() === label);
      if (!btn) throw new Error("Missing button: " + label);
      await act(async () => { btn.click(); });
      return btn;
    };

    await clickButton("AI 味太重");
    await clickButton("记为反例");
    await clickButton("AI 改写");
    await clickButton("AI 味太重");

    const input = document.querySelector("input[aria-label='自定义修改或 AI 标识意见']");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    await act(async () => {
      setter.call(input, "去掉心里感叹");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickButton("AI 改写");

    const dirtySaveBtn = [...document.querySelectorAll("[data-testid='dirty-locked-check'] button")].find(
      (node) => node.textContent.trim() === "保存 · Ctrl/Cmd+S",
    );
    const saveDisabled = Boolean(dirtySaveBtn && dirtySaveBtn.disabled);
    const bodyText = document.body.textContent ?? "";
    await clickButton("解除锁定");

    return { feedbacks, instructions, toggled, saveDisabled, bodyText };
  } finally {
    await act(async () => root.unmount());
  }
}
`,
    },
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    alias: { "@": path.join(clientDir, "src") },
    define: { "import.meta.env": "{}" },
    outfile: bundlePath,
    plugins: [nodeStyles],
  });

  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/" });
  const restore = [];
  for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Event"]) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    restore.push(() => (descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name]));
    Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
  }
  const actEnvDescriptor = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  restore.push(() => (
    actEnvDescriptor ? Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", actEnvDescriptor) : delete globalThis.IS_REACT_ACT_ENVIRONMENT
  ));
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

  try {
    const { runFeedbackAndSidebar } = await import(pathToFileURL(bundlePath).href);
    const result = await runFeedbackAndSidebar();
    assert.deepEqual(result.feedbacks, [
      { issueTags: ["ai_taste"], feedbackNote: undefined, mode: "record" },
      { issueTags: ["ai_taste"], feedbackNote: undefined, mode: "rewrite" },
    ]);
    assert.deepEqual(result.instructions, ["去掉心里感叹"]);
    assert.equal(result.saveDisabled, true);
    assert.equal(result.toggled, 1);
    assert.match(result.bodyText, /人工锁定/);
  } finally {
    if (fs.existsSync(bundlePath)) fs.unlinkSync(bundlePath);
    dom.window.close();
    restore.reverse().forEach((fn) => fn());
  }
});
