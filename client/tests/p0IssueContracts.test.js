import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("AI 执行台在审校待确认且有报告时提供修复入口", async () => {
  const source = await read("src/pages/novels/components/ChapterExecutionActionPanel.tsx");
  assert.match(source, /displayedStatus === "pending_review"/);
  assert.match(source, /selectedChapter\.generationState === "reviewed"/);
  assert.match(source, /chapterAuditReports\.length > 0/);
});

test("自定义厂商配置可选择鉴权方式", async () => {
  const source = await read("src/pages/settings/components/ProviderConfigDialog.tsx");
  assert.match(source, /Authorization: Bearer/);
  assert.match(source, /x-api-key/);
  assert.match(source, /无需鉴权/);
});
