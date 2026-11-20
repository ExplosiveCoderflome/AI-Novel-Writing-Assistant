import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { nodeStyles } from "./support/nodeStyles.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = new URL(`./.outline-workspace-${process.pid}.mjs`, import.meta.url);
let dom, runtime;
const globals = new Map();

before(async () => {
  const { JSDOM } = createRequire(new URL("../../site/package.json", import.meta.url))("jsdom");
  dom = new JSDOM("<main></main>", { url: "http://localhost/" });
  for (const [key, value] of Object.entries({
    window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const { build } = createRequire(import.meta.resolve("vite"))("esbuild");
  await build({
    stdin: { resolveDir: root, loader: "tsx", contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { MemoryRouter, Route, Routes } from "react-router-dom";
      import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
      import Workspace from "./src/pages/outlines/OutlineWorkspacePage";
      import List from "./src/pages/outlines/OutlineListPage";
      export { apiClient } from "./src/api/client";
      export { act } from "react";
      export function mount(path) {
        const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
        const app = createRoot(document.querySelector("main"));
        app.render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={[path]}><Routes>
          <Route path="/outlines" element={<List />} /><Route path="/outlines/:id" element={<Workspace />} />
        </Routes></MemoryRouter></QueryClientProvider>);
        return { app, cache };
      }
    ` }, bundle: true, platform: "node", packages: "external", format: "esm", outfile: fileURLToPath(bundle),
    plugins: [nodeStyles], alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) }, define: { "import.meta.env": "{}" },
  });
  runtime = await import(bundle.href);
});

after(async () => {
  dom?.window.close();
  for (const [key, old] of globals) {
    if (old) Object.defineProperty(globalThis, key, old);
    else delete globalThis[key];
  }
  await unlink(bundle).catch(error => { if (error.code !== "ENOENT") throw error; });
});

function fixture() {
  const volume = (id, order, chapter) => ({ nodeId: id, title: id, order, summary: "", planningDepth: "rough", chapterNodeIds: [chapter] });
  const chapter = (id, parent) => ({ nodeId: id, title: id, volumeNodeId: parent, order: 0, summary: "", planningDepth: "rough", characterNodeIds: ["person"], payoffNodeIds: [] });
  return {
    schemaVersion: 1, story: { nodeId: "s", title: "渡口", premise: "", synopsis: "", theme: "", tone: "", endingDirection: "" },
    volumes: [volume("回航", 1, "风暴"), volume("启航", 0, "出海")], chapters: [chapter("风暴", "回航"), chapter("出海", "启航")],
    characters: [{ nodeId: "person", name: "阿黎", appearanceNodeIds: [] }], payoffs: [], facts: [],
  };
}

async function open(t, path, respond = () => undefined) {
  const writes = [];
  let saved = fixture(), version = 1;
  runtime.apiClient.defaults.adapter = async config => {
    const { url, method } = config;
    const body = config.data && JSON.parse(config.data);
    if (method !== "get") writes.push({ url, body });
    const record = () => ({ id: "p", title: saved.story.title, currentVersion: version, document: saved });
    const reply = data => ({ config, data: { success: true, data }, headers: {}, status: 200, statusText: "OK" });
    const custom = respond(url, method, body);
    if (custom !== undefined) return reply(custom);
    let data;
    if (url === "/outlines") data = method === "post" ? { project: record() } : [];
    else if (url === "/outlines/p") data = record();
    else if (url.endsWith("/book-binding")) data = null;
    else if (url.endsWith("/character-impact/conversation")) data = [];
    else if (url.endsWith("/revisions")) data = [{ id: "r", version }];
    else if (url.endsWith("/revisions/r")) data = { id: "r", version, document: saved };
    else if (url.endsWith("/document")) {
      saved = body.document;
      data = { revision: { version: ++version }, document: saved };
    } else throw Error("Unexpected outline endpoint " + url);
    return reply(data);
  };
  let page;
  await runtime.act(async () => { page = runtime.mount(path); });
  let mounted = true;
  const close = async () => {
    if (!mounted) return;
    mounted = false;
    await runtime.act(async () => page.app.unmount()); page.cache.clear();
  };
  t.after(close);
  return { writes, page, close, conflict: () => { version++; } };
}

const button = (label, scope = document) => [...scope.querySelectorAll("button")].find(item => item.textContent.trim() === label);
const click = item => runtime.act(async () => { assert.ok(item); item.click(); });
async function until(read) {
  for (let i = 0; i < 80; i++) {
    const result = read();
    if (result) return result;
    await runtime.act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  }
  assert.fail("Expected outline state: " + document.body.textContent);
}
const change = (el, value) => runtime.act(async () => {
  assert.ok(el);
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set.call(el, value);
  el.dispatchEvent(new window.Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
});

test("从想法起草打开初版输入框，只在作者提交时生成", async t => {
  const { writes } = await open(t, "/outlines");
  await click(await until(() => button("从一个想法开始")));
  await until(() => document.querySelector('[aria-label="你的故事想法"]'));
  assert.equal(document.querySelector('[aria-label="AI 建议类型"]').value, "initial_generation");
  assert.equal(document.querySelector(".outline-workspace-grid").dataset.pane, "assistant");
  assert.deepEqual(writes.map(item => item.url), ["/outlines"]);
});

test("目录按卷搜索，在缺省人物字段中编辑，经关联章节返回仍保留草稿，冲突时保护输入", async t => {
  const { page, writes, conflict } = await open(t, "/outlines/p?nodeId=person");
  const directory = await until(() => document.querySelector('[aria-label="大纲目录"]'));
  const search = directory.querySelector("input[type=search]");
  await change(search, "风暴");
  assert.ok(directory.querySelector('ul[aria-label="回航的章节"]').textContent.includes("风暴"));
  assert.equal(button("出海", directory), undefined);
  await change(search, "");
  const motivation = () => [...document.querySelectorAll(".outline-editor label")].find(item => item.querySelector("span")?.textContent === "动机").querySelector("textarea");
  await change(document.querySelector('[aria-label="人物联动审阅"] textarea'), "让阿黎在第二卷才知道真相");
  await change(motivation(), "找回父亲的航海日志");
  assert.equal(button("分析相关卷章与伏笔").disabled, true);
  await click(button("风暴", document.querySelector('[aria-label="关联内容"]')));
  assert.equal(document.querySelector('.outline-title').value, "风暴");
  await click(button("阿黎", directory));
  assert.equal(motivation().value, "找回父亲的航海日志");
  assert.equal(document.querySelector('[aria-label="人物联动审阅"] textarea').value, "让阿黎在第二卷才知道真相");
  conflict();
  await runtime.act(async () => { await page.cache.invalidateQueries({ queryKey: ["outline", "p"] }); });
  await until(() => button("载入最新修订"));
  assert.equal(motivation().value, "找回父亲的航海日志");
  assert.equal(button("保存为新修订").disabled, true);
  assert.deepEqual(writes, []);
});

test("人物对话重进后自动恢复，追问绑定上一版，旧提案只读，勾选后才写入", async t => {
  const turns = [], proposals = new Map(), accepted = [];
  const op = (id, title) => ({ operationId: id, kind: "update_fields", nodeId: id, fields: { role: title },
    reason: "保留救人的动机", dependsOn: [], affectedNodeIds: [id], risks: [] });
  function respond(url, method, body) {
    if (url.endsWith("/character-impact/conversation")) return structuredClone(turns);
    if (url.endsWith("/conversation/turns")) {
      const previous = turns.at(-1);
      assert.equal(body.priorProposalId, previous?.result.id);
      if (previous) { previous.result.status = "superseded"; proposals.get(previous.result.id).status = "superseded"; }
      const id = "proposal-" + (turns.length + 1);
      const result = { id, status: "pending", baseVersion: 1, source: "workbench" };
      turns.push({ id: body.requestId, requestText: body.requestText, contextVersion: "1", createdAt: new Date().toISOString(),
        parentResultId: body.priorProposalId ?? null, replyText: "可以保留救人的决定。", status: "completed", result });
      proposals.set(id, { ...result, projectId: "p", kind: "character_impact",
        proposalJson: JSON.stringify({ operations: [op("person","提前起疑"),op("风暴","坚持救人")],
          impact: { characterId: "person", retained: [], writtenChapterIds: [] } }) });
      return { turnId: body.requestId };
    }
    if (url.includes("/proposals/")) {
      const id = url.split("/proposals/")[1].split("/")[0];
      if (method === "get") return structuredClone(proposals.get(id));
      if (url.endsWith("/apply")) {
        accepted.push(body.operationIds);
        proposals.get(id).status = "partially_applied"; turns.at(-1).result.status = "partially_applied";
        return {};
      }
    }
  }
  window.localStorage.clear();
  const first = await open(t, "/outlines/p?nodeId=person", respond);
  const input = () => document.querySelector('[aria-label="人物联动审阅"] textarea');
  await change(await until(input), "让阿黎提前起疑");
  await click(await until(() => !button("分析相关卷章与伏笔")?.disabled && button("分析相关卷章与伏笔")));
  await until(() => button("继续讨论第 1 轮提案"));
  await first.close();

  await open(t, "/outlines/p", respond);
  await until(() => button("继续讨论第 1 轮提案"));
  assert.equal(document.querySelector(".outline-workspace-grid").dataset.pane, "assistant");
  assert.match(document.querySelector('[aria-label="对话记录"]').textContent, /让阿黎提前起疑/);
  await change(input(), "仍然救师父");
  await click(button("继续讨论第 1 轮提案"));
  await until(() => button("继续讨论第 2 轮提案"));
  assert.deepEqual(accepted, []);
  await click(button("查看第 1 轮提案 · 已有后续提案"));
  await until(() => document.querySelector('[aria-label="人物联动审阅"]').textContent.includes("提案内容"));
  assert.equal(button("采纳所选（2）"), undefined);
  await click(button("查看第 2 轮提案 · 待确认"));
  const boxes = await until(() => {
    const items = document.querySelectorAll('[aria-label="人物联动审阅"] input[type="checkbox"]');
    return items.length === 2 && items;
  });
  await click(boxes[1]); await click(button("采纳所选（1）"));
  await until(() => button("查看第 2 轮提案 · 部分采纳"));
  assert.deepEqual(accepted, [["person"]]);
});

test("选卷添加章节后统一保存，修订同时保留章节归属和卷内顺序", async t => {
  const { writes } = await open(t, "/outlines/p?nodeId=回航");
  const add = await until(() => document.querySelector('[aria-label="添加大纲内容"]'));
  await click(add);
  const form = document.querySelector(".outline-directory form");
  assert.equal(form.querySelector('[aria-label="添加类型"]').value, "chapter");
  assert.equal(form.querySelectorAll("select")[1].value, "回航");
  await change(form.querySelector("input"), "靠岸");
  await click(button("添加章节", form));
  assert.equal(document.querySelector(".outline-title").value, "靠岸");
  assert.equal(writes.length, 0);
  await click(button("保存为新修订"));
  await until(() => button("保存为新修订").disabled && document.querySelector(".outline-save-bar").textContent.includes("v2"));
  const { expectedVersion, document: result } = writes[0].body;
  const chapter = result.chapters.at(-1);
  assert.equal(expectedVersion, 1);
  assert.equal(chapter.volumeNodeId, "回航");
  assert.equal(chapter.order, 1);
  assert.deepEqual(result.volumes[0].chapterNodeIds, ["风暴", chapter.nodeId]);
});
