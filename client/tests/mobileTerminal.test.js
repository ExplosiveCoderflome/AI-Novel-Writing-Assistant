import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveMobileTerminalRoute } from "../src/mobile/terminal/routePolicy.ts";

const clientDir = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(clientDir, "tests", `.mobile-terminal-${process.pid}.mjs`);
let render;
before(async () => {
  const { build } = createRequire(import.meta.resolve("vite"))("esbuild");
  await build({ stdin: { resolveDir: clientDir, loader: "tsx", contents: `
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MobileTerminal} from './src/mobile/terminal';
import {queryKeys} from './src/api/queryKeys';
import {previewView} from './src/pages/directorNext/preview';
export function render(path, mode='running', legacyProjection=null) {
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 const book={id:'book',title:'测试小说',directorVersion:legacyProjection?'v1':'v2',estimatedChapterCount:10,chapters:[{id:'chapter',order:1,title:'第一章',content:'已保存的正文。',updatedAt:'2026-11-09T00:00:00Z'}]};
 client.setQueryData(['mobileShelf',1,''],{data:{items:[{...book,_count:{chapters:1},bookProgress:{writtenChapters:1,targetChapters:10}}],total:1,totalPages:1}});
 client.setQueryData(['mobileNovel','book'],{data:book});
 client.setQueryData(queryKeys.directorNext.summary('book'),{data:{...previewView(mode),novelId:'book'}});
 if(legacyProjection)client.setQueryData(['mobileBookAutomation','book'],{data:{projection:legacyProjection}});
 client.setQueryData(['mobileRecords',undefined],{data:{items:[{id:'run',kind:'novel_workflow',title:'章节任务',status:'failed',pendingManualRecovery:true,progress:0.5,sourceRoute:'/lab/director/book',lastError:'需要重试'}]}});
 client.setQueryData(['mobileNotifications'],{data:{items:[{itemType:'task',directorTaskId:'run',novelId:'book',novelTitle:'测试小说',reasonLabel:'暂停提醒',followUpSummary:'请查看本书任务'}]}});
 try{return renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><MobileTerminal/></MemoryRouter></QueryClientProvider>);}
 finally{client.clear();}
}
` }, bundle: true, platform: "node", format: "esm", packages: "external", alias: { "@": path.join(clientDir, "src") }, define: { "import.meta.env": "{}" }, outfile: output });
  ({ render } = await import(pathToFileURL(output).href));
});
after(() => { if (fs.existsSync(output)) fs.unlinkSync(output); });

test("mobile route policy includes reading and task entrypoints while excluding large workbenches", () => {
  for (const route of ["/settings/models", "/settings/model-routes", "/settings/maintenance", "/worlds/a/workspace", "/base-characters", "/comic", "/drama", "/book-analysis", "/create", "/novels/book/ai-usage", "/novels/auto-director"]) {
    assert.equal(resolveMobileTerminalRoute(route).kind, "desktop", route);
  }
  for (const route of ["/novels/book/edit", "/lab/director/book", "/novels/book/preview", "/novels/book/simple", "/novels/book/chapters/chapter"]) assert.equal(resolveMobileTerminalRoute(route).kind, "novel");
  assert.equal(resolveMobileTerminalRoute("/tasks").kind, "records");
  assert.equal(resolveMobileTerminalRoute("/auto-director/follow-ups").kind, "notifications");
});

test("mobile shelf and chapter expose progress, reading and small edits without configuration controls", () => {
  assert.match(render("/novels"), /已写 1 \/ 10 章/);
  const html = render("/novels/book/chapters/chapter");
  assert.match(html, /已保存的正文/);
  assert.match(html, /小改正文/);
  assert.match(html, /章节目录与状态/);
  assert.match(html, /暂停任务/);
  assert.doesNotMatch(html, /导出|批量拆章|配置连接|API Key|角色表单/);
  assert.match(render("/settings/models"), /请在电脑端打开此工具/);
});

test("mobile recovery stays on the novel and running records only navigate", () => {
  const paused = render("/lab/director/book", "manual");
  assert.match(paused, /本书任务/);
  assert.match(paused, /继续|恢复/);
  const records = render("/tasks");
  assert.match(records, /打开来源页面/);
  assert.match(records, /href="\/lab\/director\/book"/);
  assert.doesNotMatch(records, />重试<|>取消<|>继续<|>暂停</);
  assert.match(render("/auto-director/follow-ups"), /暂停提醒/);
});

test("mobile records and legacy task controls reuse task-center and dashboard projections", () => {
  const records = render("/tasks");
  assert.match(records, /需要恢复/);

  const notifications = render("/auto-director/follow-ups");
  assert.match(notifications, /href="\/novels\/book\/edit"/);
  assert.doesNotMatch(notifications, /directorTaskId|workspaceTaskId/);

  const projection = {
    userHeadline: "等待恢复",
    detail: "从本书保存进度继续",
    primaryAction: null,
    secondaryActions: [],
    latestTask: { id: "legacy", status: "running", pendingManualRecovery: true, lastError: null },
    dashboardView: { mode: "recovering" },
  };
  assert.doesNotMatch(render("/novels/book/edit", "running", projection), />暂停任务</);
  assert.match(render("/novels/book/edit", "running", { ...projection, dashboardView: { mode: "running" } }), />暂停任务</);
});
