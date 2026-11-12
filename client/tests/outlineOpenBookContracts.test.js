import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = relative => readFile(new URL(relative, import.meta.url), "utf8");

test("大纲开书入口使用独立预览路由并在移动端隐藏", async () => {
  const [workspace, router, page] = await Promise.all([
    read("../src/pages/outlines/OutlineWorkspacePage.tsx"),
    read("../src/router/index.tsx"),
    read("../src/pages/outlines/openBook/OutlineOpenBookPage.tsx"),
  ]);
  assert.match(workspace, /useIsMobileViewport/);
  assert.match(workspace, /按这份大纲开书/);
  assert.match(workspace, /bindingQuery\.isSuccess/);
  assert.match(router, /outlines\/:id\/open-book/);
  assert.match(page, /请在电脑端确认大纲并开书/);
});

test("开书请求遵循共享合同并冻结保存修订", async () => {
  const [api, page] = await Promise.all([
    read("../src/api/outlines.ts"),
    read("../src/pages/outlines/openBook/OutlineOpenBookPage.tsx"),
  ]);
  assert.match(api, /@ai-novel\/shared\/types\/outlineOpenBook/);
  assert.doesNotMatch(api, /export interface OutlineOpenBook(?:Preview|Settings|Binding)/);
  assert.match(page, /volumeQuotas:quotas/);
  assert.match(page, /requestHash:hash/);
  assert.match(page, /preview\.variables/);
  assert.match(page, /待采纳的 AI 建议不会进入这次开书/);
  assert.match(page, /unsaved/);
  assert.match(page, /getOutlineRevision\(id, revisionId\)/);
  assert.match(page, /不会自动调用模型或生成正文/);
});

test("绑定查询直接保留 200/null，项目404不冒充未绑定", async () => {
  const api = await read("../src/api/outlines.ts");
  assert.doesNotMatch(api, /validateStatus:.*404|response\.status === 404 \? null/);
  assert.match(api, /as OutlineBookBindingView \| null/);
});
