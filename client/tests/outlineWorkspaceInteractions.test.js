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
    window: dom.window, FormData: dom.window.FormData, sessionStorage: dom.window.sessionStorage, requestAnimationFrame: callback => setTimeout(callback,0), document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true,
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
    if (custom !== undefined) return reply(await custom);
    let data;
    if (url === "/outlines") data = method === "post" ? { project: record() } : [];
    else if (url === "/outlines/p") data = record();
    else if (url.endsWith("/book-binding")) data = null;
    else if (url.endsWith("/conversation") || url.endsWith("/proposals")) data = [];
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
test("大纲两侧栏宽独立保存，取消拖动或恢复默认不影响另一侧", async t => {
  const first = await open(t, "/outlines/p");
  const grid = await until(() => document.querySelector(".outline-workspace-grid"));
  // JSDOM has no layout engine. Supply the measured tracks used by a desktop grid.
  grid.style.gridTemplateColumns = "200px 600px 400px";
  assert.equal(grid.querySelectorAll("[role=separator]").length, 2);
  await click(button("大纲助手"));
  assert.equal(grid.querySelectorAll("[role=separator]").length, 1);
  await click(button("大纲助手"));
  const [left, right] = grid.querySelectorAll("[role=separator]");
  function pointer(handle, type, x) {
    const event = new window.MouseEvent(type, { bubbles: true, clientX: x, button: 0 });
    Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
    handle.dispatchEvent(event);
  }
  left.setPointerCapture = () => {};
  pointer(left, "pointerdown", 200);
  pointer(left, "pointermove", 272);
  pointer(left, "pointerup", 272);
  right.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
  assert.equal(grid.style.getPropertyValue("--left-preferred"), "272px");
  assert.equal(grid.style.getPropertyValue("--right-preferred"), "412px");
  pointer(left, "pointerdown", 272);
  pointer(left, "pointermove", 310);
  pointer(left, "lostpointercapture", 310);
  assert.equal(grid.style.getPropertyValue("--left-preferred"), "272px");
  assert.deepEqual(first.writes, []);
  await click(button("大纲助手"));
  await first.close();

  const reopened = await open(t, "/outlines/p");
  const restored = await until(() => document.querySelector(".outline-workspace-grid"));
  await click(button("大纲助手"));
  assert.equal(restored.style.getPropertyValue("--left-preferred"), "272px");
  assert.equal(restored.style.getPropertyValue("--right-preferred"), "412px");
  const reset = side => restored.querySelector(`[data-column-divider="${side}"]`).dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true }));
  reset("right");
  assert.equal(restored.style.getPropertyValue("--right-preferred"), "");
  assert.equal(restored.style.getPropertyValue("--left-preferred"), "272px");
  reset("left");
  assert.deepEqual(reopened.writes, []);
});
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

test("大纲列表每份只出现一次，按日期区分同名稿，空列表就近提供三个起步入口", async t => {
  const projects = [
    { id: "new", updatedAt: "2026-11-22T12:15:00Z", currentVersion: 4, summary: "一封迟到的信", boundNovelId: "book" },
    { id: "earlier", updatedAt: "2026-11-22T11:15:00Z", currentVersion: 2 },
    { id: "old", updatedAt: "2026-11-20T12:15:00Z", currentVersion: 1 },
  ].map(item => ({ ...item, title: "新故事大纲" }));
  const { close, writes } = await open(t, "/outlines", url => url === "/outlines" ? projects : undefined);
  const library = await until(() => document.querySelector(".outline-library"));
  assert.deepEqual([...library.querySelectorAll(".outline-catalog-link")].map(link => link.getAttribute("href")),
    ["/outlines/new", "/outlines/earlier", "/outlines/old"]);
  const latest = library.querySelector(".is-latest");
  for (const value of ["继续编辑", "修订 v4", "一封迟到的信", "已开书"]) assert.ok(latest.textContent.includes(value));
  assert.equal(library.querySelectorAll(".outline-day").length, 2);
  assert.deepEqual([...library.querySelectorAll("time")].map(time => time.dateTime), projects.map(item => item.updatedAt));
  assert.deepEqual(writes, []);
  await close();
  const emptyPage = await open(t, "/outlines");
  const empty = await until(() => document.querySelector(".outline-library-empty"));
  assert.deepEqual([...empty.querySelectorAll("button")].map(item => item.textContent), ["从一个想法开始", "空白大纲", "导入大纲"]);
  assert.equal(document.querySelectorAll(".outline-library-actions").length, 1);
  await click(button("导入大纲", empty));
  assert.equal(document.querySelector("#outline-import").hidden, false);
  assert.deepEqual(emptyPage.writes, []);
});

test("从故事想法生成初稿，在主栏预览，重进继续追问并采纳", async t => {
  window.localStorage.clear();
  const turns = [];
  const result = { id: "first", kind: "initial_generation", baseVersion: 1, status: "pending",
    draftSummary: { title: "末班渡船", volumeCount: 0, chapterCount: 0, characterCount: 0 } };
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
      version = 2; result.status = "applied"; result.adoptedVersion = 2;
      return { revision: { version }, document: { ...blank, story: storyFields } };
    }
  }
  const first = await open(t, "/outlines", respond);
  await click(await until(() => button("从一个想法开始")));
  const input = () => document.querySelector('[aria-label="给大纲助手发消息"]');
  const sendKey = init => runtime.act(async () => input().dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, ...init })));
  const idea = await until(() => document.querySelector("#outline-story-idea"));
  assert.equal(document.querySelectorAll("textarea").length, 1);
  assert.equal(document.querySelector(".outline-inspector"), null);
  await change(idea, "帮我调整开篇的渡河。");
  assert.deepEqual(first.writes.map(item => item.url), ["/outlines"]);
  await click(button("根据这个想法生成初稿"));
  assert.equal(first.writes[1].body.action, "generate_initial");
  await until(() => button("采用这份初稿"));
  const draft = await until(() => document.querySelector("button.agent-draft"));
  assert.ok(document.querySelector(".outline-inspector").contains(draft));
  assert.equal(document.querySelector("#outline-story-idea"), null);
  assert.equal(document.querySelector(".outline-editor h2").textContent, "末班渡船");
  assert.match(draft.textContent, /末班渡船.*待确认.*0 卷 · 0 章 · 0 位人物.*查看大纲/);
  assert.equal(document.querySelector(".agent-reference").textContent, "正在讨论《末班渡船》");
  await first.close();
  const reopened = await open(t, "/outlines/p", respond);
  await until(() => button("继续讨论《末班渡船》"));
  assert.equal(document.querySelector(".outline-workspace-grid").dataset.pane, "editor");
  assert.match(document.querySelector('[aria-label="对话记录"]').textContent, /帮我调整开篇的渡河/);
  await change(input(), "为什么要安排风暴？");
  await sendKey({ isComposing: true }); await sendKey({ shiftKey: true });
  assert.deepEqual(reopened.writes, []);
  await click(button("继续讨论《末班渡船》"));
  await until(() => document.querySelector('[aria-label="对话记录"]').textContent.includes("自己做决定"));
  assert.equal(reopened.writes.length, 1);
  assert.equal(reopened.writes[0].body.parentResultId, "first");
  assert.equal(version, 1);
  await click(document.querySelector("button.agent-draft"));
  await click(await until(() => button("采用这份初稿")));
  await until(() => document.querySelector(".outline-reading h2")?.textContent === "末班渡船");
  await until(() => document.querySelector(".agent-draft-status")?.textContent === "已采纳为 v2");
  assert.equal(version, 2);
});

test("空白大纲共用一个构思入口，历史与手填可来回切换，再次打开可接着讨论生成初稿", async t => {
  const blank = { ...fixture(), volumes: [], chapters: [], characters: [] };
  const turns = [];
  let releaseFollowUp;
  function respond(url, method, body) {
    if (url === "/outlines/p") return { id: "p", title: blank.story.title, currentVersion: 1, document: blank };
    if (url === "/outlines/p/conversation") return structuredClone(turns);
    if (url === "/outlines/p/conversation/turns") {
      const finish = () => {
        turns.push({ id: body.requestId, requestText: body.requestText, status: "completed",
          contextVersion: "1", createdAt: new Date().toISOString(), replyText: "船上还有谁？", result: null });
        return { turnId: body.requestId };
      };
      if (turns.length === 1) return new Promise(resolve => { releaseFollowUp = () => resolve(finish()); });
      return finish();
    }
  }
  const first = await open(t, "/outlines/p", respond);
  const idea = () => document.querySelector("#outline-story-idea");
  const chat = () => document.querySelector('.outline-editor [aria-label="给大纲助手发消息"]');
  await until(idea);
  assert.equal(button("根据这个想法生成初稿").disabled, true);
  assert.equal(button("先帮我想一想").disabled, false);
  await change(idea(), "一艘无人渡船每晚准时靠岸");
  await click(button("版本历史"));
  assert.equal(document.querySelectorAll("textarea").length, 1);
  await click(button("整书讨论"));
  await click(button("自己填写大纲"));
  await click(button("回到阅读"));
  assert.equal(idea().value, "一艘无人渡船每晚准时靠岸");
  assert.deepEqual(first.writes, []);
  await click(button("先帮我想一想"));
  await until(chat);
  assert.match(turns[0].requestText, /一艘无人渡船每晚准时靠岸/);
  assert.equal(first.writes.length, 1);
  assert.equal(first.writes[0].body.action, undefined);
  assert.equal(idea(), null);
  await first.close();

  const reopened = await open(t, "/outlines/p?start=idea", respond);
  await until(chat);
  assert.equal(document.querySelectorAll("textarea").length, 1);
  assert.match(document.querySelector('.outline-editor [aria-label="对话记录"]').textContent, /船上还有谁/);
  await change(chat(), "船上只有一只鸟");
  await click(button("发送给大纲助手"));
  await until(() => releaseFollowUp && button("根据讨论生成初稿").disabled);
  await runtime.act(async () => { releaseFollowUp(); });
  await until(() => !button("根据讨论生成初稿").disabled);
  await click(button("根据讨论生成初稿"));
  await until(() => reopened.writes.length === 2);
  assert.equal(reopened.writes[1].body.action, "generate_initial");
  assert.equal(reopened.writes[1].body.baseVersion, 1);
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
  assert.equal(button("发送给大纲助手").disabled,true);
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
  await click(button("修改阿黎"));
  await change(document.querySelector('[aria-label="人物局部修改"] textarea'), "让阿黎在第二卷才知道真相");
  assert.equal(document.querySelectorAll(".agent-conversation").length, 1);
  await change(document.querySelector('[aria-label="给大纲助手发消息"]'), "保留渡口这一章");
  assert.equal(document.querySelector('[aria-label="对话范围"]'), null);
  assert.equal(document.querySelector('[aria-label="人物局部修改"] textarea').value, "让阿黎在第二卷才知道真相");
  await click(button("手动编辑"));
  await change(motivation(), "找回父亲的航海日志");
  assert.equal(button("发送给大纲助手").disabled, true);
  await click(button("风暴", document.querySelector('[aria-label="关联内容"]')));
  assert.equal(document.querySelector('.outline-title').value, "风暴");
  await click(button("阿黎", directory));
  assert.equal(motivation().value, "找回父亲的航海日志");
  assert.equal(document.querySelector('[aria-label="给大纲助手发消息"]').value, "保留渡口这一章");
  conflict();
  await runtime.act(async () => { await page.cache.invalidateQueries({ queryKey: ["outline", "p"] }); });
  await until(() => button("载入最新修订"));
  assert.equal(motivation().value, "找回父亲的航海日志");
  assert.equal(button("保存为新修订").disabled, true);
  assert.deepEqual(writes, []);
});

test("手动保存的回执晚于新版大纲返回时，阅读区保留新版修订和书名", async t => {
  let latest, finishSave;
  const { page } = await open(t, "/outlines/p?nodeId=s", (url, method, body) => {
    if (url.endsWith("/document")) return new Promise(resolve => {
      finishSave = () => resolve({ revision: { version: 2 }, document: body.document });
    });
    if (url === "/outlines/p" && method === "get") return latest;
  });
  await click(await until(() => button("手动编辑")));
  await change(document.querySelector(".outline-title"), "第二版书名");
  await click(button("保存为新修订"));
  await until(() => finishSave);

  const key = ["outline", "p"];
  const original = page.cache.getQueryData(key);
  latest = { ...original, currentVersion: 3, title: "第三版书名",
    document: { ...original.document, story: { ...original.document.story, title: "第三版书名" } } };
  await runtime.act(async () => { await page.cache.refetchQueries({ queryKey: key, exact: true }); });
  const seenVersions = [];
  const unsubscribe = page.cache.getQueryCache().subscribe(event => {
    if (event.type === "updated" && event.query === page.cache.getQueryCache().find({ queryKey: key, exact: true })) {
      seenVersions.push(event.query.state.data.currentVersion);
    }
  });
  try {
    await runtime.act(async () => { finishSave(); });
    await until(() => !page.cache.isMutating());
    assert.ok(seenVersions.length > 0);
    assert.ok(seenVersions.every(version => version === 3), seenVersions.join(", "));
    assert.equal(page.cache.getQueryData(key).title, latest.title);
    assert.equal(page.cache.getQueryData(key).document.story.title, latest.title);
  } finally {
    unsubscribe();
  }
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
        return { revision: { version: 2 }, document: fixture() };
      }
    }
  }
  window.localStorage.clear();
  const first = await open(t, "/outlines/p?nodeId=person", respond);
  const input = () => document.querySelector('[aria-label="人物局部修改"] textarea');
  await click(await until(() => button("修改阿黎")));
  await change(await until(input), "让阿黎提前起疑");
  await click(button("生成修改建议"));
  await until(() => document.querySelector(".outline-review-reading input[type=checkbox]"));
  await first.close();

  await open(t, "/outlines/p", respond);
  const records = await until(() => document.querySelector(".outline-local-history"));
  await click(records.querySelector("summary"));
  assert.match(records.textContent,/让阿黎提前起疑/);
  assert.equal(document.querySelector(".outline-inspector .outline-local-history"), null);
  await click(button("沿用这份建议",records));
  await change(input(), "仍然救师父");
  await click(button("生成修改建议"));
  await until(() => document.querySelector(".outline-review-reading input[type=checkbox]"));
  assert.deepEqual(accepted, []);
  await click(button("回到当前稿"));
  const old = [...document.querySelectorAll(".outline-local-history li")].find(li => li.textContent.includes("已有后续建议"));
  await click(button("查看建议", old));
  await until(() => document.querySelector(".outline-review-reading")?.textContent.includes("已有后续建议"));
  assert.equal(button("采纳所选（2）"), undefined);
  await click(button("回到当前稿"));
  await click(await until(() => button("查看建议",document.querySelector(".outline-local-history li") ?? document)));
  const boxes = await until(() => {
    const items = document.querySelectorAll('.outline-review-reading input[type="checkbox"]');
    return items.length === 2 && items;
  });
  await click(boxes[1]); await click(button("采纳阿黎这 1 处修改"));
  await until(() => document.querySelector(".outline-local-history")?.textContent.includes("部分采纳"));
  assert.deepEqual(accepted, [["person"]]);
});

test("旧建议对照 v4 保存稿，重审沿用指定的 v3 建议，确认后才返回新版人物", async t => {
  window.localStorage.clear();
  const doc = fixture();
  const person = doc.characters[0];
  Object.assign(person, {name:"李斯", goal:"以秦法约束赵高", motivation:"维护成法", conflict:"廷尉之争", appearanceNodeIds:["出海"]});
  const original = structuredClone(doc);
  original.characters[0].goal = "v3 的原文";
  let version = 4;
  const turns = [{id:"old-turn",status:"completed",contextVersion:"3",requestText:"丰富李斯的动机",replyText:"请核对建议",result:{id:"old",status:"pending",baseVersion:3}}];
  const fields = {goal:"保住家人",motivation:"亲族牵挂",conflict:"难以两全"};
  const next = {...fields,goal:"以法度护住家人"};
  function proposal(id,baseVersion,values) {
    return {id,projectId:"p",kind:"character_impact",baseVersion,status:"pending",proposalJson:JSON.stringify({
      impact:{characterId:"person",retained:[],writtenChapterIds:[]},
      operations:[{operationId:"person",kind:"update_fields",nodeId:"person",fields:values,reason:"衔接人物选择",dependsOn:[],risks:[],affectedNodeIds:["person"]}],
    })};
  }
  const {writes} = await open(t, "/outlines/p?nodeId=person", (url,method,body) => {
    if (url === "/outlines/p") return {id:"p",title:doc.story.title,currentVersion:version,document:structuredClone(doc)};
    if (url.endsWith("/revisions")) return [3,4,5].slice(0,version-2).map(v => ({version:v,id:"r"+v}));
    if (url.endsWith("/revisions/r3")) return {version:3,document:original};
    if (url.endsWith("/revisions/r4")) return {version:4,document:doc};
    if (url.endsWith("/diff")) return [];
    if (url.endsWith("/proposals")) return [{id:"old",baseVersion:3,characterId:"person",requestText:"丰富李斯的动机",kind:"character_impact"}];
    if (url.endsWith("/proposals/old")) return proposal("old",3,fields);
    if (url.endsWith("/proposals/new")) return proposal("new",4,next);
    if (url.endsWith("/character-impact/conversation")) return structuredClone(turns);
    if (url.endsWith("/character-impact/conversation/turns")) {
      turns.push({id:body.requestId,contextVersion:"4",status:"completed",requestText:body.requestText,
        replyText:"请预览建议",parentResultId:"old",result:{id:"new",status:"pending",baseVersion:4,source:"workbench"}});
      return {turnId:body.requestId};
    }
    if (url.endsWith("/proposals/new/apply")) {
      version++; Object.assign(person,next);
      return {revision:{version},document:structuredClone(doc)};
    }
  });
  const directory = await until(() => document.querySelector(".outline-directory"));
  const grid = document.querySelector(".outline-workspace-grid");
  const divider = grid.querySelector('[data-column-divider="right"]');
  const expectInspectorOpen = () => {
    assert.equal(grid.dataset.inspectorOpen, "true");
    assert.equal(grid.querySelector('[data-column-divider="right"]'), divider);
  };
  const personInput = () => document.querySelector('[aria-label="人物局部修改"] textarea');
  await click(button("修改李斯"));
  await change(personInput(), "李斯为什么迟疑？");
  await click(button("总纲", directory));
  expectInspectorOpen();
  await click(button("李斯", directory));
  assert.equal(personInput().value, "李斯为什么迟疑？");
  await click(button("版本历史"));
  assert.equal(button("修订历史").getAttribute("aria-pressed"), "true");
  await click(button("大纲助手"));
  assert.equal(button("整书讨论").getAttribute("aria-pressed"), "true");
  expectInspectorOpen();
  await click(document.querySelector(".outline-local-history summary"));
  await click(button("与当前稿对照"));
  const before = await until(() => document.querySelector(".outline-comparison dd"));
  expectInspectorOpen();
  assert.equal(before.textContent, "以秦法约束赵高");
  assert.equal(document.querySelector(".outline-base-text p").textContent, "v3 的原文");
  assert.equal(document.querySelectorAll(".outline-comparison dd")[1].textContent, "保住家人");
  assert.equal(document.querySelectorAll(".outline-review-reading input[type=checkbox]").length, 0);
  assert.equal(button("采纳李斯这 3 处修改"), undefined);
  assert.deepEqual(writes,[]);
  await change(document.querySelector(".outline-review-followup textarea"), "保留牵挂家人的动机");
  await click(button("按当前大纲重新给建议"));
  const accept = await until(() => button("采纳李斯这 3 处修改"));
  assert.equal(version,4);
  assert.deepEqual(writes.map(w => [w.body.baseVersion,w.body.priorProposalId,w.body.requestText]),[[4,"old","保留牵挂家人的动机"]]);
  await click(accept);
  await until(() => document.querySelector(".outline-reading h2")?.textContent === "李斯");
  assert.equal(writes.length,2);
  assert.deepEqual(writes[1].body.operationIds, ["person"]);
  assert.match(document.querySelector(".outline-reading").textContent,/以法度护住家人/);
  assert.match(document.querySelector(".outline-activity").textContent,/已采纳为 v5/);
  expectInspectorOpen();
  await click(document.querySelector('[aria-label="收起侧栏"]'));
  await click(button("出海", directory));
  assert.equal(grid.dataset.inspectorOpen, "false");
  assert.equal(grid.querySelector('[data-column-divider="right"]'), null);
});

test("切换李斯和第二章保留整书会话与各自输入，章节建议在本章确认", async t => {
  window.localStorage.clear();
  const doc = fixture();
  doc.story.title = "赵高倒计时";
  doc.characters[0].name = "李斯";
  const chapter = doc.chapters[1];
  chapter.title = "第二章《不发的诏书》";
  const path = "/outlines/p/chapters/" + encodeURIComponent(chapter.nodeId) + "/conversation";
  const current = structuredClone(doc);
  const chapterTurns = [];
  const globalTurn = {id:"whole-9",contextVersion:"3",status:"completed",requestText:"梳理整书倒计时",replyText:"从沙丘开始。",result:null};
  let version = 4;
  const {writes} = await open(t, "/outlines/p?nodeId=person", (url,method,body) => {
    if (url === "/outlines/p") return {id:"p",title:doc.story.title,currentVersion:version,document:structuredClone(doc)};
    if (url === "/outlines/p/conversation") return [globalTurn];
    if (url === path) return structuredClone(chapterTurns);
    if (url === path + "/turns") {
      chapterTurns.push({id:body.requestId,contextVersion:"4",status:"completed",requestText:body.requestText,replyText:"核对本章梗概。",result:{id:"chapter-result",baseVersion:4,status:"pending"}});
      return {turnId:body.requestId};
    }
    if (url.endsWith("/revisions")) return [{id:"r4",version:4}];
    if (url.endsWith("/revisions/r4")) return {version:4,document:current};
    if (url.endsWith("/proposals/chapter-result")) return {id:"chapter-result",projectId:"p",kind:"chapter_edit",baseVersion:4,status:"pending",
      proposalJson:JSON.stringify({chapterId:chapter.nodeId,operations:[{kind:"update_fields",operationId:"summary",nodeId:chapter.nodeId,
        fields:{summary:"李斯按住诏书"},reason:"延后交付",affectedNodeIds:[chapter.nodeId],risks:[],dependsOn:[]}]})};
    if (url.endsWith("/proposals/chapter-result/apply")) {
      chapter.summary = "李斯按住诏书"; version++;
      chapterTurns[0].result.status = "applied";
      return {document:structuredClone(doc),revision:{version}};
    }
  });
  const directory = await until(() => document.querySelector(".outline-directory"));
  const side = document.querySelector(".outline-inspector");
  await until(() => side.textContent.includes(globalTurn.requestText));
  const whole = side.querySelector("textarea");
  await change(whole, "整书结尾的倒计时如何回收？");
  const local = () => document.querySelector("#outline-local-form textarea");
  const heading = document.querySelector(".outline-reading-heading");
  const body = document.querySelector(".outline-reading-body");
  const adjust = button("修改李斯", heading);
  assert.ok(adjust);
  assert.ok(!body.contains(adjust));
  assert.equal(body.nextElementSibling, null);
  body.scrollTop = 400;
  await click(adjust);
  const personDock = body.nextElementSibling;
  assert.equal(personDock.tagName, "FOOTER");
  assert.equal(personDock.querySelector('[aria-label="人物局部修改"] textarea'), local());
  assert.equal(local().form.id, adjust.getAttribute("aria-controls"));
  assert.equal(body.scrollTop, 400);
  assert.equal(document.activeElement, local());
  await change(local(), "丰富李斯的目标和动机");
  await click(button("收起修改", heading));
  assert.equal(adjust.getAttribute("aria-expanded"), "false");
  assert.equal(body.nextElementSibling, null);
  assert.equal(body.scrollTop, 400);
  await click(adjust);
  assert.equal(local().value, "丰富李斯的目标和动机");
  await click(button(chapter.title, directory));
  const chapterPage = document.querySelector(".outline-local-page");
  const chapterBody = chapterPage.querySelector(".outline-reading-body");
  const adjustChapter = button("调整本章", chapterPage.querySelector("header"));
  chapterBody.scrollTop = 350;
  assert.equal(chapterPage.querySelector("footer"), null);
  await click(adjustChapter);
  const dock = chapterBody.nextElementSibling;
  assert.equal(dock.tagName, "FOOTER");
  assert.equal(dock.querySelector("textarea"), local());
  assert.equal(local().form.id, adjustChapter.getAttribute("aria-controls"));
  assert.equal(adjustChapter.getAttribute("aria-expanded"), "true");
  assert.equal(document.activeElement, local());
  assert.equal(chapterBody.scrollTop, 350);
  assert.equal(local().value, "");
  await change(local(), "请明确本章的冲突");
  await click(adjustChapter);
  assert.equal(chapterPage.querySelector("footer"), null);
  assert.equal(chapterBody.scrollTop, 350);
  await click(adjustChapter);
  assert.equal(local().value, "请明确本章的冲突");
  await click(button("李斯", directory));
  await click(button("修改李斯"));
  assert.equal(local().value, "丰富李斯的目标和动机");
  await click(button(chapter.title, directory));
  await click(button("调整本章"));
  assert.equal(local().value, "请明确本章的冲突");
  assert.deepEqual(writes, []);
  await click(await until(() => {const send = button("生成修改建议"); return send && !send.disabled && send;}));
  const adopt = await until(() => button("采纳所选（1）"));
  assert.equal(version,4);
  assert.equal(writes[0].url,path + "/turns");
  await click(adopt);
  await until(() => document.querySelector(".outline-reading h2")?.textContent === chapter.title);
  assert.deepEqual(writes[1].body.operationIds,["summary"]);
  assert.equal(version,5);
  assert.equal(side.querySelector("textarea"),whole);
  assert.equal(whole.value,"整书结尾的倒计时如何回收？");
  assert.ok(side.textContent.includes(globalTurn.requestText));
  assert.ok(!side.textContent.includes("请明确本章的冲突"));
});

test("调整本卷在阅读栏底部展开，各卷保留自己的输入，采纳后回到目标卷", async t => {
  const saved = fixture(), base = structuredClone(saved), volume = saved.volumes[0];
  const path = "/outlines/p/volumes/" + encodeURIComponent(volume.nodeId) + "/conversation";
  const changed = "卷末收到父亲的求救信。";
  const result = { id: "vol-review", baseVersion: 1, status: "pending" };
  const turns = [];
  let version = 1;
  const { writes } = await open(t, "/outlines/p?nodeId=回航", (url, method, body) => {
    if (url === "/outlines/p") return { id: "p", title: saved.story.title, currentVersion: version, document: saved };
    if (url.endsWith("/revisions/r")) return { version: 1, document: base };
    if (url === path) return structuredClone(turns);
    if (url === path + "/turns") {
      turns.push({ id: body.requestId, requestText: body.requestText, status: "completed",
        contextVersion: "1", createdAt: new Date().toISOString(), replyText: "请预览卷末安排。", result });
      return { turnId: body.requestId };
    }
    if (url.endsWith("/proposals/vol-review")) return { ...result, projectId: "p", kind: "volume_edit",
      proposalJson: JSON.stringify({ volumeId: volume.nodeId, operations: [{ operationId: "endingHook", kind: "update_fields",
        nodeId: volume.nodeId, fields: { endingHook: changed }, reason: "留下悬念", dependsOn: [], risks: [], affectedNodeIds: [volume.nodeId] }] }) };
    if (url.endsWith("/proposals/vol-review/apply")) {
      volume.endingHook = changed;
      version++;
      return { revision: { version }, document: saved };
    }
  });
  const directory = await until(() => document.querySelector(".outline-directory"));
  const toggle = () => button("调整本卷", document.querySelector(".outline-reading-heading"));
  const input = () => document.querySelector('.outline-editor footer [aria-label="分卷局部修改"] textarea');
  const reading = document.querySelector(".outline-reading-body");
  reading.scrollTop = 250;
  await click(toggle());
  assert.equal(document.activeElement, input());
  assert.equal(reading.scrollTop, 250);
  await change(input(), "给回航增加卷末悬念");
  await click(button("启航", directory));
  await click(toggle());
  assert.equal(input().value, "");
  await change(input(), "启航要有代价");
  await click(button("回航", directory));
  await click(toggle());
  assert.equal(input().value, "给回航增加卷末悬念");
  assert.deepEqual(writes, []);
  await click(await until(() => { const send = button("生成修改建议"); return send && !send.disabled && send; }));
  const adopt = await until(() => button("采纳所选（1）"));
  assert.equal(writes[0].url, path + "/turns");
  assert.equal(writes[0].body.baseVersion, 1);
  assert.equal(version, 1);
  await click(adopt);
  await until(() => document.querySelector(".outline-reading-body")?.textContent.includes(changed));
  assert.equal(document.querySelector(".outline-reading h2").textContent, volume.title);
  assert.deepEqual(writes[1].body.operationIds, ["endingHook"]);
  assert.equal(version, 2);
});

test("在卷上预览和采纳节奏，再从对应节奏段打开原章节", async t => {
  const saved = fixture(), original = structuredClone(saved);
  const volume = saved.volumes[0], chapter = saved.chapters[0];
  let version = 1, proposal;
  const beats = [["open_hook","开卷抓手"],["climax","卷高潮"],["end_hook","卷尾钩子"]].map(([key,label]) =>
    ({key,label,title:label,summary:"渡船逼近岸边",chapterSpanHint:"1章",mustDeliver:["靠岸前作出抉择"]}));
  const operations = [{operationId:"v",nodeId:volume.nodeId,fields:{beats}},{operationId:"c",nodeId:chapter.nodeId,fields:{beatKey:"climax"}}]
    .map(op=>({...op,kind:"update_fields",reason:"本卷结构",affectedNodeIds:[op.nodeId],dependsOn:[],risks:[]}));
  const {writes} = await open(t, "/outlines/p?nodeId=回航", (url, method, body) => {
    if (url === "/outlines/p") return {id:"p",title:saved.story.title,currentVersion:version,document:saved};
    if (url.endsWith("/revisions")) return [{id:"r",version:1},...(version===2?[{id:"r2",version:2}]:[])];
    if (url.endsWith("/revisions/r")) return {id:"r",version:1,document:original};
    if (url.endsWith("/volumes/回航/beat-proposals")) {
      assert.deepEqual(body,{baseVersion:1,targetChapterCount:1});
      return proposal={id:"beats",kind:"volume_beats",projectId:"p",baseVersion:1,status:"pending",proposalJson:JSON.stringify({volumeId:volume.nodeId,operations})};
    }
    if (url.endsWith("/proposals/beats")) return proposal;
    if (url.endsWith("/proposals/beats/apply")) {
      assert.deepEqual(body.operationIds,["v","c"]);
      volume.beats = beats; chapter.beatKey = "climax"; version=2;
      proposal={...proposal,status:"applied"};
      return {revision:{version},document:saved};
    }
  });
  await click(await until(()=>button("生成本卷节奏建议")));
  const accept = await until(()=>button("采纳本卷节奏与章节归属"));
  assert.equal(version,1);
  const panel = document.querySelector(".outline-proposal-body");
  assert.ok([...panel.querySelectorAll("details")].find(el=>el.querySelector("summary").textContent.includes("卷高潮")).textContent.includes("风暴"));
  await click(accept);
  await until(()=>button("重新拟定节奏建议"));
  const branch = document.querySelector('[aria-label="展开《回航》的章节"]');
  if (branch) await click(branch);
  const detail = [...document.querySelectorAll(".outline-directory details")].find(el=>el.textContent.includes("卷高潮"));
  assert.equal(button("风暴",detail).textContent,"风暴");
  await click(button("风暴",detail));
  await until(()=>document.querySelector(".outline-reading-body")?.textContent.includes("所属节奏段 · 卷高潮"));
  assert.equal(writes.length,2);
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
