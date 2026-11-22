import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import postcss from "postcss";
import { nodeStyles } from "./support/nodeStyles.js";

test("并排对照从每对方案继承同一组自适应行，窄栏使用自然文流", async () => {
  const source = await readFile(new URL("../src/pages/novels/autoDirector/candidateReview/candidateReviewWorkspace.css", import.meta.url), "utf8");
  const wide = postcss.parse(source).nodes.find(rule => rule.name === "container" && rule.params === "candidate-list (min-width: 52rem)");
  const declarations = selector => {
    const values = {};
    wide.walkRules(rule => {
      if (rule.selectors.includes(selector)) rule.walkDecls(node => { values[node.prop] = node.value; });
    });
    return values;
  };
  const tracks = declarations(".candidate-comparison")["grid-template-rows"].trim().split(/\s+/);
  const names = ["byline", "title", "lead", "keywords", "hookStrategy", "progressionLoop", "notes", "plannedDirection", "logline",
    "coreConflict", "sellingPoint", "protagonistPath", "positioning", "endingDirection", "whyItFits", "platform", "foundation", "titleOptions", "decision"];
  assert.deepEqual(tracks, [...names.flatMap(name => [`[${name}]`, "auto"]), "[end]"]);
  for (const selector of [".candidate-comparison > article", ".candidate-comparison > article > header",
    ".candidate-comparison .candidate-story-notes", ".candidate-comparison .candidate-fields:not([hidden])"]) {
    assert.equal(declarations(selector)["grid-template-rows"], "subgrid");
  }
  assert.equal(declarations(".candidate-comparison .candidate-fields > div")["grid-row"], "var(--candidate-field-row)");
  assert.equal(declarations(".candidate-comparison .candidate-lead")["grid-row"], "lead");
  assert.equal(declarations(".candidate-comparison > article > .candidate-fields")["grid-row"], "hookStrategy / notes");
  assert.equal(declarations(".candidate-comparison .candidate-story-notes > .candidate-fields")["grid-row"], "plannedDirection / titleOptions");
});

test("开书候选共用右栏，同名方案跨轮切换时保留各自输入与开书范围", async t => {
  const { JSDOM } = createRequire(new URL("../../site/package.json", import.meta.url))("jsdom");
  const dom = new JSDOM("<main></main>", { url: "http://localhost" });
  t.after(() => dom.window.close());
  for (const [name, value] of Object.entries({
    window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    t.after(() => previous ? Object.defineProperty(globalThis, name, previous) : delete globalThis[name]);
  }
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const root = fileURLToPath(new URL("../", import.meta.url));
  const bundle = new URL(`./.opening-candidate-workspace-${process.pid}.mjs`, import.meta.url);
  const { build } = createRequire(import.meta.resolve("vite"))("esbuild");
  await build({
    stdin: { resolveDir: root, loader: "tsx", contents: `
      import { createRoot } from "react-dom/client";
      import { useState } from "react";
      import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
      import { CandidateReviewWorkspace } from "./src/pages/novels/autoDirector/candidateReview/CandidateReviewWorkspace";
      import { useCandidateSelection } from "./src/pages/novels/autoDirector/candidateReview/useCandidateSelection";
      import Batches from "./src/pages/novels/components/NovelAutoDirectorCandidateBatches";
      import { toggleDirectorCorrectionPreset } from "./src/pages/novels/components/directorCandidateSelectionHandlers";
      export { act } from "react";
      export { apiClient } from "./src/api/client";
      export function mount(batches, confirm, generate) {
        const cache = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}});
        const app = createRoot(document.querySelector("main"));
        function Workspace() {
          const selection = useCandidateSelection(batches);
          const [feedback, setFeedback] = useState("");
          const [selectedPresets, setPresets] = useState([]);
          return <CandidateReviewWorkspace taskId="test" selection={selection} disabled={false}
            nextRound={{ feedback, selectedPresets, onFeedbackChange: setFeedback,
              onTogglePreset: preset => setPresets(previous => toggleDirectorCorrectionPreset(previous, preset)),
              onGenerate: () => generate({ feedback, selectedPresets }) }}>
            <Batches batches={batches} discussionKey={selection.active.key} openingMode="auto_to_ready" titlePatchFeedbacks={{}} onConfirmCandidate={confirm} />
          </CandidateReviewWorkspace>;
        }
        app.render(<QueryClientProvider client={cache}><Workspace /></QueryClientProvider>);
        return () => { app.unmount(); cache.clear(); };
      }
    ` }, bundle: true, jsx: "automatic", platform: "node", packages: "external", format: "esm", outfile: fileURLToPath(bundle),
    plugins: [nodeStyles], alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) }, define: { "import.meta.env": "{}" },
  });
  t.after(() => unlink(bundle));
  const { act, apiClient, mount } = await import(bundle.href);
  const reads = [], confirmations = [], newRounds = [];
  apiClient.defaults.adapter = async config => {
    reads.push([config.method, config.url]);
    return { config, data: { data: [] }, status: 200, statusText: "OK", headers: {} };
  };
  const batches = ["first", "next"].map((id, i) => ({
    id, roundLabel: `第 ${i + 1} 轮`, presets: [],
    candidates: [{ id: "same", workingTitle: "渡口", toneKeywords: [], targetChapterCount: 40,
      logline: "渡船送信", coreConflict: "渡船失踪。".repeat(30), sellingPoint: "送信解谜",
      hookStrategy: `开篇场景${i + 1}`, endingDirection: `结局${i + 1}` }],
  }));
  batches[1].candidates.push({ ...batches[1].candidates[0], id: "another", workingTitle: "夜船", coreConflict: "守桥",
    plannedDirection: "接力运走名册上仍活着的人", progressionLoop: "沿河追查名册",
    toneKeywords: ["双线追查", "身份错位"], protagonistPath: "从逃避到守护", writingPlatformReason: "适合悬疑连载" });
  batches[1].candidates.push({ ...batches[1].candidates[0], id: "last", workingTitle: "灯影", coreConflict: undefined });
  let cleanup;
  try {
    await act(async () => { cleanup = mount(batches, (candidate, batch, mode) => confirmations.push([candidate.id, batch.id, mode]), input => newRounds.push(input)); });
    const inspector = document.querySelector("aside.candidate-inspector");
    const reader = document.querySelector(".candidate-reading");
    assert.equal(document.querySelectorAll(".agent-conversation").length, 1);
    assert.ok(inspector.querySelector(".agent-conversation"));
    assert.equal(reader.querySelector(".agent-conversation"), null);
    const select = () => inspector.querySelector("select");
    const [first, second, third, last] = Array.from(select().options, option => option.value);
    assert.notEqual(first, second);
    assert.ok(reader.contains(document.getElementById(second)));
    assert.equal(reader.querySelectorAll("article").length, 4);
    const [comparison, lastPair] = reader.querySelectorAll(".candidate-comparison");
    assert.deepEqual([...comparison.querySelectorAll(":scope > article")].map(article => article.id), [second, third]);
    assert.deepEqual([...lastPair.querySelectorAll(":scope > article")].map(article => article.id), [last]);
    assert.equal(document.getElementById(first).closest(".candidate-comparison"), null, "单方案轮次独立排版");
    const rowNames = id => [...document.getElementById(id).querySelectorAll(".candidate-fields > div")]
      .map(field => field.style.getPropertyValue("--candidate-field-row"));
    assert.deepEqual(rowNames(second), ["hookStrategy", "logline", "coreConflict", "sellingPoint", "endingDirection"]);
    assert.deepEqual(rowNames(third), ["hookStrategy", "progressionLoop", "plannedDirection", "logline", "sellingPoint", "protagonistPath", "endingDirection", "platform"]);
    const secondStory = document.getElementById(second);
    const thirdStory = document.getElementById(third);
    const legacyStory = document.getElementById(last);
    assert.equal(secondStory.querySelector(".candidate-book-title + .candidate-lead dd").textContent, "渡船失踪。");
    assert.equal(secondStory.querySelector(".candidate-lead dd").textContent
      + secondStory.querySelector('[data-field="coreConflict"] dd').textContent, batches[1].candidates[0].coreConflict);
    assert.equal(thirdStory.querySelector(".candidate-lead dd").textContent, "守桥");
    assert.deepEqual([...thirdStory.querySelectorAll(":scope > .candidate-fields dt")].map(term => term.textContent), ["开篇看什么", "后面追什么"]);
    assert.equal(legacyStory.querySelector(".candidate-lead dt").textContent, "一句话故事");
    assert.equal(legacyStory.querySelector(".candidate-lead dd").textContent, "渡船送信");
    assert.equal(legacyStory.querySelector('[data-field="logline"]'), null);
    assert.ok(!document.getElementById(second).querySelector(".candidate-keywords"));
    assert.equal(secondStory.querySelector('[data-field="plannedDirection"]'), null);
    assert.equal(thirdStory.querySelector('.candidate-story-notes [data-field="plannedDirection"] dd').textContent, "接力运走名册上仍活着的人");
    assert.deepEqual([...document.getElementById(third).querySelectorAll(".candidate-keywords li")].map(item => item.textContent), ["双线追查", "身份错位"]);
    assert.equal(reader.querySelectorAll('.candidate-story-notes > button[aria-expanded="true"]').length, 4);
    const toggle = document.getElementById(second).querySelector(".candidate-story-notes > button");
    const extraFields = document.getElementById(toggle.getAttribute("aria-controls"));
    await act(async () => toggle.click());
    assert.equal(extraFields.hidden, true);
    assert.equal(document.getElementById(third).querySelector(".candidate-story-notes dl").hidden, false);
    await act(async () => toggle.click());
    assert.equal(extraFields.hidden, false);
    assert.ok(document.getElementById(first).textContent.includes("结局1"));
    assert.ok(document.getElementById(second).textContent.includes("结局2"));
    await act(async () => reader.querySelectorAll("nav button")[1].click());
    assert.equal(document.activeElement.id, third + "-title");
    assert.equal(select().value, first, "跳读另一套全文应保留右栏正在讨论的对象");
    Object.defineProperty(reader, "clientHeight", { value: 400 });
    t.mock.method(reader, "getBoundingClientRect", () => ({ top: 40 }));
    t.mock.method(document.getElementById(second), "getBoundingClientRect", () => ({ top: 640 }));
    async function switchTo(key) {
      await act(async () => {
        select().focus();
        select().value = key;
        select().dispatchEvent(new window.Event("change", { bubbles: true }));
      });
      assert.ok(document.activeElement === select());
    }
    const draft = () => inspector.querySelector("textarea").value;
    async function useStarter(index) {
      for (let i = 0; i < 60 && !inspector.querySelector(".agent-starters"); i++) {
        await act(() => new Promise(resolve => setTimeout(resolve, 5)));
      }
      await act(async () => inspector.querySelectorAll(".agent-starters button")[index].click());
    }
    await useStarter(0);
    assert.match(inspector.querySelector(".agent-welcome").textContent, /开篇场景1/);
    const firstDraft = draft();
    await switchTo(second);
    assert.equal(reader.scrollTop, 600);
    assert.equal(draft(), "");
    await useStarter(1);
    assert.match(inspector.querySelector(".agent-welcome").textContent, /开篇场景2/);
    assert.ok(document.getElementById(second).querySelector(".candidate-discussing"));
    assert.equal(reader.querySelectorAll(".candidate-discussing").length, 1);
    assert.notEqual(draft(), firstDraft);
    await switchTo(first);
    assert.equal(draft(), firstDraft);
    assert.deepEqual([...new Set(reads.map(([method, url]) => method + " " + url))], [
      "get /novels/director/tasks/test/batches/first/candidates/same/conversation",
      "get /novels/director/tasks/test/batches/next/candidates/same/conversation",
    ]);
    const tabs = document.querySelectorAll(".candidate-pane-switch button");
    await act(async () => tabs[1].click());
    assert.equal(tabs[1].getAttribute("aria-pressed"), "true");
    await act(async () => tabs[0].click());
    assert.equal(draft(), firstDraft);
    const changeRound = [...reader.querySelectorAll("button")].find(button => button.textContent === "都不合适，换一批");
    const nextForm = () => inspector.querySelector('section[aria-label="生成下一轮方向"] form');
    const strongerConflict = () => [...nextForm().querySelectorAll("button")].find(button => button.textContent === "冲突更强");
    assert.ok(!reader.querySelector("textarea"));
    assert.ok(!nextForm());
    await act(async () => changeRound.click());
    assert.equal(tabs[1].getAttribute("aria-pressed"), "true", "窄屏也切到助手");
    assert.equal(document.activeElement.textContent, "生成下一轮方向");
    assert.ok(select().closest("[hidden]"));
    assert.equal(nextForm().querySelector("textarea").value, "");
    const requirements = "保留渡船，换一个主角";
    await act(async () => {
      strongerConflict().click();
      const input = nextForm().querySelector("textarea");
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(input, requirements);
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    await act(async () => [...inspector.querySelectorAll("button")].find(button => button.textContent === "返回方案讨论").click());
    assert.ok(!nextForm());
    assert.ok(document.activeElement === select());
    assert.equal(draft(), firstDraft);
    await act(async () => changeRound.click());
    assert.equal(strongerConflict().getAttribute("aria-pressed"), "true");
    assert.equal(nextForm().querySelector("textarea").value, requirements);
    assert.deepEqual(newRounds, [], "打开表单、选方向和返回讨论均不启动生成");
    await act(async () => nextForm().querySelector('[type="submit"]').click());
    assert.deepEqual(newRounds, [{ feedback: requirements, selectedPresets: ["stronger_conflict"] }]);
    assert.ok(reads.every(([method]) => method === "get"), "下一轮的要求不写入单套方案对话");
    await act(async () => [...inspector.querySelectorAll("button")].find(button => button.textContent === "返回方案讨论").click());
    assert.deepEqual(confirmations, []);
    const decisions = [...document.getElementById(second).querySelectorAll("button")];
    for (const label of ["选用并逐阶段确认", "选用并自动准备"]) {
      await act(async () => decisions.find(button => button.textContent === label).click());
    }
    assert.deepEqual(confirmations, [["same", "next", "stage_review"], ["same", "next", "auto_to_ready"]]);
  } finally {
    if (cleanup) await act(async () => cleanup());
  }
});
