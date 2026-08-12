import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("设置路由提供四个独立页面并兼容旧模型路由链接", async () => {
  const source = await read("src/router/index.tsx");
  assert.match(source, /path: "settings\/models", element: <ModelsSettingsPage \/>/);
  assert.match(source, /path: "settings\/director", element: <DirectorSettingsPage \/>/);
  assert.match(source, /path: "settings\/knowledge", element: <KnowledgeSettingsPage \/>/);
  assert.match(source, /path: "settings\/maintenance", element: <MaintenanceSettingsPage \/>/);
  assert.match(source, /path: "settings\/model-routes", element: <Navigate to="\/settings\/models" replace \/>/);
});

test("系统导航只保留设置入口，设置页提供稳定二级导航", async () => {
  const [sidebar, shell] = await Promise.all([
    read("src/components/layout/Sidebar.tsx"),
    read("src/pages/settings/components/SettingsShell.tsx"),
  ]);
  assert.doesNotMatch(sidebar, /label: "模型路由"/);
  for (const label of ["设置总览", "模型与厂商", "自动导演", "知识库与写法", "桌面与维护"]) {
    assert.match(shell, new RegExp(label));
  }
});
