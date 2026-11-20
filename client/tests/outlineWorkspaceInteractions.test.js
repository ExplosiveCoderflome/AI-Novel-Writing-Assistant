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
    else if (url.endsWith("/conversation")) data = [];
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

test("从一个想法开始直接进入对话，讨论起点可编辑，中文选词不发消息，重进后接着提案聊", async t => {
  window.localStorage.clear();
  const turns = [];
  const result = { id: "first", kind: "initial_generation", baseVersion: 1, status: "pending" };
  const blank = { ...fixture(), volumes: [], chapters: [], characters: [], facts: [], payoffs: [] };
  const storyFields = { ...blank.story, title: "末班渡船", synopsis: "女孩驶入风暴。" };
  let version = 1;
  function respond(url, method, body) {
    if (url === "/outlines/p") {
      const doc = version === 1 ? blank : { ...blank, story: storyFields };
      return { id: "p", title: doc.story.title, currentVersion: version, document: doc };
    }
    if (url.endsWith("/revisions")) return [{ id: "r", version: 1 }, ...(version === 2 ? [{ id: "r2", version: 2 }] : [])];
    if (url.endsWith("/revisions/r")) return { id: "r", version: 1, document: blank };
    if (url === "/outlines/p/conversation") return structuredClone(turns);
    if (url === "/outlines/p/conversation/turns") {
      turns.push({ id: body.requestId, requestText: body.requestText, contextVersion: "1", createdAt: new Date().toISOString(),
        parentResultId: body.parentResultId ?? null, replyText: turns.length ? "风暴让她自己做决定。" : "可以从一次渡河写起。",
        status: "completed", result: turns.length ? null : result });
      return { turnId: body.requestId };
    }
    if (url.endsWith("/proposals/first")) return { ...result, projectId: "p", proposalJson: JSON.stringify({
      storyFields, volumes: [], chapters: [], characters: [], facts: [], payoffs: [],
    }) };
    if (url.endsWith("/proposals/first/apply")) {
      version = 2; result.status = "applied";
      return { revision: { version }, document: { ...blank, story: storyFields } };
    }
  }
  const first = await open(t, "/outlines", respond);
  await click(await until(() => button("从一个想法开始")));
  const input = () => document.querySelector('[aria-label="给大纲搭档发消息"]');
  const sendKey = init => runtime.act(async () => input().dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, ...init })));
  await click(await until(() => button("我只有一个画面")));
  assert.equal(document.activeElement, input());
  assert.match(input().value, /画面/);
  assert.equal(document.querySelector('[aria-label="AI 建议类型"]'), null);
  assert.equal(document.querySelector(".outline-workspace-grid").dataset.pane, "assistant");
  await change(input(), "帮我调整开篇的渡河。");
  await sendKey({ isComposing: true });
  await sendKey({ shiftKey: true });
  assert.deepEqual(first.writes.map(item => item.url), ["/outlines"]);
  await sendKey({});
  await until(() => button("查看第 1 轮提案 · 待确认"));
  await first.close();
  const reopened = await open(t, "/outlines/p", respond);
  await until(() => button("继续讨论第 1 轮提案"));
  assert.equal(document.querySelector(".outline-workspace-grid").dataset.pane, "assistant");
  assert.match(document.querySelector('[aria-label="对话记录"]').textContent, /帮我调整开篇的渡河/);
  await change(input(), "为什么要安排风暴？");
  await click(button("继续讨论第 1 轮提案"));
  await until(() => document.querySelector('[aria-label="对话记录"]').textContent.includes("自己做决定"));
  assert.equal(reopened.writes.length, 1);
  assert.equal(reopened.writes[0].body.parentResultId, "first");
  assert.equal(version, 1);
  await click(button("查看第 1 轮提案 · 待确认"));
  await click(await until(() => button("采纳这份大纲")));
  await until(() => document.querySelector(".outline-title").value === "末班渡船");
  await until(() => button("查看第 1 轮提案 · 已采纳"));
  assert.equal(version, 2);
});

test("模型返回的思考先独立显示，回复逐段渲染，重新打开可回看本轮预览", async t => {
  const sources = [];
  const original = Object.getOwnPropertyDescriptor(globalThis, "EventSource");
  class Source {
    constructor(url, options) { this.url = url; this.options = options; sources.push(this); }
    close() { this.closed = true; }
    frame(payload) { this.onmessage({data:JSON.stringify(payload)}); }
  }
  Object.defineProperty(globalThis,"EventSource",{configurable:true,value:Source});
  t.after(() => { if (original) Object.defineProperty(globalThis,"EventSource",original); else delete globalThis.EventSource; });
  const turn = {id:"live-turn",createdAt:new Date().toISOString(),status:"running",requestText:"开篇写什么？",
    replyText:null,contextVersion:"1",parentResultId:null,result:null};
  const read = url => url === "/outlines/p/conversation" ? [structuredClone(turn)] : undefined;
  const {writes,close} = await open(t,"/outlines/p?start=idea",read);
  const source = await until(() => sources[0]);
  assert.match(source.url,/\/conversation\/turns\/live-turn\/stream$/);
  assert.equal(source.options.withCredentials,true);
  const thinking = [{stage:"大纲搭档",text:"先理清她为何下船。",enabled:false}];
  const send = (text,done=false,turnId=turn.id) => runtime.act(async () => source.frame({turnId,stage:"正在回复…",text,done,thinking}));
  await send("串线的回复",false,"other-turn");
  assert.doesNotMatch(document.body.textContent,/串线的回复|先理清她为何下船/);
  await send("");
  assert.equal(button("思考过程").getAttribute("aria-expanded"),"true");
  assert.equal(document.querySelector(".agent-thinking-content p").textContent,thinking[0].text);
  assert.equal(document.querySelector(".agent-thinking-note"),null);
  await click(button("思考过程"));
  assert.equal(document.querySelector(".agent-thinking-content").hidden,true);
  await send("从**渡口**开篇");
  assert.equal(document.querySelector(".agent-reply strong")?.textContent,"渡口");
  assert.equal(button("发送给大纲搭档").disabled,true);
  await send("从**渡口**开篇，让她自己决定。");
  assert.ok(document.querySelector(".agent-reply").textContent.includes("自己决定"));
  turn.status="completed"; turn.replyText="保存的回复：从渡口开篇。"; turn.thinking=thinking;
  await send("",true);
  await until(() => document.querySelector(".agent-reply").textContent.includes("保存的回复"));
  assert.doesNotMatch(document.querySelector(".agent-reply").textContent,/自己决定/);
  assert.ok(source.closed); assert.deepEqual(writes,[]);
  await close();
  await open(t,"/outlines/p?start=idea",read);
  const toggle = await until(() => button("思考过程"));
  assert.equal(toggle.getAttribute("aria-expanded"),"false");
  await click(toggle);
  assert.equal(document.querySelector(".agent-thinking-content").hidden,false);
  assert.equal(document.querySelector(".agent-thinking-content p").textContent,thinking[0].text);
});

test("只有思考用量时展示实际数值，历史空记录不补写思考", async t => {
  const base = {createdAt:new Date().toISOString(),status:"completed",requestText:"帮我看动机",replyText:"可以。",contextVersion:"1",parentResultId:null,result:null};
  const turns = [
    {...base,id:"usage",thinking:[{stage:"大纲搭档",text:"",enabled:false,reasoningTokens:697}]},
    {...base,id:"disabled",thinking:[{stage:"大纲搭档",text:"",enabled:false}]},
    {...base,id:"old"},
  ];
  await open(t,"/outlines/p?start=idea",url => url === "/outlines/p/conversation" ? turns : undefined);
  await until(() => document.querySelector(".agent-thinking-note"));
  const notes = [...document.querySelectorAll(".agent-thinking-note")].map(el => el.textContent);
  assert.equal(notes.length,2);
  assert.match(notes[0],/697 个思考 token/);
  assert.match(notes[1],/关闭思考/);
  assert.equal(button("思考过程"),undefined);
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
  await click(button("整份大纲", document.querySelector('[aria-label="对话范围"]')));
  assert.equal(document.querySelectorAll(".agent-conversation").length, 1);
  await change(document.querySelector('[aria-label="给大纲搭档发消息"]'), "保留渡口这一章");
  await click(button("人物 · 阿黎"));
  assert.equal(document.querySelector('[aria-label="人物联动审阅"] textarea').value, "让阿黎在第二卷才知道真相");
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
