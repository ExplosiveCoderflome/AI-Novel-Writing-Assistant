import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { nodeStyles } from "./support/nodeStyles.js";

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
      import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
      import { CandidateReviewWorkspace } from "./src/pages/novels/autoDirector/candidateReview/CandidateReviewWorkspace";
      import { useCandidateSelection } from "./src/pages/novels/autoDirector/candidateReview/useCandidateSelection";
      import Batches from "./src/pages/novels/components/NovelAutoDirectorCandidateBatches";
      export { act } from "react";
      export { apiClient } from "./src/api/client";
      export function mount(batches, confirm) {
        const cache = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: Infinity}}});
        const app = createRoot(document.querySelector("main"));
        function Workspace() {
          const selection = useCandidateSelection(batches);
          return <CandidateReviewWorkspace taskId="test" selection={selection} disabled={false}>
            <Batches batches={batches} discussionKey={selection.active.key} selectedPresets={[]} titlePatchFeedbacks={{}}
              feedback="" onConfirmCandidate={confirm} />
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
  const reads = [], confirmations = [];
  apiClient.defaults.adapter = async config => {
    reads.push([config.method, config.url]);
    return { config, data: { data: [] }, status: 200, statusText: "OK", headers: {} };
  };
  const batches = ["first", "next"].map((id, i) => ({
    id, roundLabel: `第 ${i + 1} 轮`, presets: [],
    candidates: [{ id: "same", workingTitle: "渡口", toneKeywords: [], targetChapterCount: 40,
      logline: "渡船送信", hookStrategy: `开篇场景${i + 1}`, endingDirection: `结局${i + 1}` }],
  }));
  batches[1].candidates.push({ ...batches[1].candidates[0], id: "another", workingTitle: "夜船" });
  let cleanup;
  try {
    await act(async () => { cleanup = mount(batches, (candidate, batch) => confirmations.push(batch.id)); });
    const inspector = document.querySelector("aside.candidate-inspector");
    const reader = document.querySelector(".candidate-reading");
    assert.equal(document.querySelectorAll(".agent-conversation").length, 1);
    assert.ok(inspector.querySelector(".agent-conversation"));
    assert.equal(reader.querySelector(".agent-conversation"), null);
    const select = () => inspector.querySelector("select");
    const [first, second, third] = Array.from(select().options, option => option.value);
    assert.notEqual(first, second);
    assert.ok(reader.contains(document.getElementById(second)));
    assert.equal(reader.querySelectorAll("article").length, 3);
    const comparison = reader.querySelector(".candidate-comparison");
    assert.deepEqual([...comparison.querySelectorAll(":scope > article")].map(article => article.id), [second, third]);
    assert.equal(document.getElementById(first).closest(".candidate-comparison"), null, "单方案轮次独立排版");
    assert.equal(reader.querySelectorAll(".candidate-story-notes[open]").length, 3);
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
      assert.equal(document.activeElement, select());
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
    assert.deepEqual(confirmations, []);
    const confirm = [...document.getElementById(second).querySelectorAll("button")].find(button => button.textContent.includes("选用这套"));
    await act(async () => confirm.click());
    assert.deepEqual(confirmations, ["next"]);
  } finally {
    if (cleanup) await act(async () => cleanup());
  }
});
