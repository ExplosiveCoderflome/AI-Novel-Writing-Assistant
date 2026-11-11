import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { nodeStyles } from "./support/nodeStyles.js";

test("A3 settings preserve model choice, validate frequency, and select pending items only", async () => {
  const { feedbackSettingsInput, selectedFeedbackIds, feedbackVisible, feedbackItemProtected } = await import("../src/pages/outlines/feedback/feedbackModel.ts");
  const settings = { mode: "chapter", everyN: 5, provider: "custom", model: "chosen" };
  for (const invalid of ["", "0", "-2", "1.5", "101", "abc"]) assert.equal(feedbackSettingsInput(settings, "every_n", invalid), null);
  assert.deepEqual(feedbackSettingsInput(settings, "every_n", "3"), { ...settings, mode: "every_n", everyN: 3 });
  for (const mode of ["chapter", "volume", "off"]) assert.deepEqual(feedbackSettingsInput(settings, mode, ""), { ...settings, mode });
  const run = { items: [{ operationId: "a", status: "pending" }, { operationId: "b", status: "adopted" }, { operationId: "c", status: "rejected" }] };
  assert.deepEqual(selectedFeedbackIds(run, ["a", "b", "c", "unknown"]), ["a"]);
  for (const binding of [null, undefined, {}, { feedbackEligible: false }]) assert.equal(feedbackVisible(false, binding), false);
  assert.equal(feedbackVisible(true, { feedbackEligible: true }), false);
  assert.equal(feedbackVisible(false, { feedbackEligible: true }), true);
  const binding = { mapping: { chapters: [{ nodeId: "past", chapterOrder: 1 }] }, policy: { rules: [{ nodeId: "hero", field: "arcDirection", mode: "propose_change" }] } };
  assert.equal(feedbackItemProtected(binding, { nodeId: "hero", fields: { arcDirection: "信任" } }, 1), false);
  assert.equal(feedbackItemProtected(binding, { nodeId: "hero", fields: { name: "覆盖" } }, 1), true);
  assert.equal(feedbackItemProtected(binding, { nodeId: "past", fields: {} }, 1), true);
});

test("A3 renders source, textual diff, outcomes and protected/stale disabled adoption", async () => {
  const { build } = createRequire(import.meta.resolve("vite"))("esbuild");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const output = path.join(root, "tests", `.a3-ui-${Date.now()}.mjs`);
  try {
    await build({ stdin: { contents: `
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {MemoryRouter} from 'react-router-dom';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {FeedbackRun} from './src/pages/outlines/feedback/FeedbackRun';import {FeedbackSettings} from './src/pages/outlines/feedback/FeedbackSettings';
const binding={projectId:'p',novelId:'n',policy:{rules:[]},mapping:{chapters:[{nodeId:'future',chapterOrder:2}]}},document={story:{nodeId:'story'},volumes:[],chapters:[{nodeId:'future',title:'追查'}],characters:[],payoffs:[],facts:[]};
const run={id:'run',chapterId:'c1',chapterOrder:1,status:'completed',createdAt:'2026-11-11T00:00:00Z',stale:true,sourceSummary:'钥匙是假的',sourceNodes:[{nodeId:'future',fields:{summary:'原任务'}}],items:[{operationId:'a',nodeId:'future',reason:'承接发现',fields:{summary:'追查买家'},status:'pending'},{operationId:'b',nodeId:'future',fields:{purpose:'揭示交易'},status:'adopted',revisionId:'r2',revisionVersion:2},{operationId:'c',nodeId:'future',fields:{summary:'废弃建议'},status:'rejected'}]};
const render=node=>renderToStaticMarkup(<MemoryRouter><QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider></MemoryRouter>);
export const html=render(<FeedbackRun run={run} binding={binding} document={document} unsaved={false}/>),settings=render(<FeedbackSettings projectId='p' settings={{mode:'chapter',everyN:5}}/>);
`, resolveDir: root, loader: "tsx" }, bundle: true, platform: "node", format: "esm", packages: "external", plugins: [nodeStyles], alias: { "@": path.join(root, "src") }, define: { "import.meta.env": "{}" }, outfile: output });
    const result = await import(pathToFileURL(output).href);
    for (const text of ["钥匙是假的", "− 调整前", "＋ 建议调整后", "原任务", "追查买家", "后续章节任务调整提议", "字段受保护", "需重新分析", "已采纳", "已拒绝", "revisionId=r2", "查看采纳修订 v2"]) assert.ok(result.html.includes(text), text);
    assert.match(result.html, /disabled=""[^>]*>采纳所选/);
    for (const text of ["每章（默认）", "每 N 章", "每卷", "关闭", "仍可继续写下一章"]) assert.ok(result.settings.includes(text), text);
  } finally { fs.rmSync(output, { force: true }); }
});

test("A3 mounts only for eligible desktop binding and uses dedicated per-item APIs", () => {
  const read = file => fs.readFileSync(new URL(file, import.meta.url), "utf8");
  const workspace = read("../src/pages/outlines/OutlineWorkspacePage.tsx");
  assert.match(workspace, /feedbackEnabled && feedbackOpen && bindingQuery.data \? <OutlineFeedbackPanel/);
  assert.match(workspace, /feedbackVisible\(isMobileViewport, bindingQuery.data\)/);
  assert.match(read("../src/components/outlines/OutlineBookSource.tsx"), /feedbackVisible\(mobile,binding\)/);
  const api = read("../src/api/outlineFeedback.ts");
  assert.match(api, /\{ operationIds \}/);
  assert.doesNotMatch(api, /proposals\/.*apply/);
});
