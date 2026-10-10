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

test("半自动步骤确认把正文修改回填动作放在章节执行台", async () => {
  const source = await read("src/pages/novels/components/ChapterExecutionActionPanel.tsx");
  assert.match(source, /把本章修改交还给自动导演/);
  assert.match(source, /确认本章修改并继续/);
  assert.match(source, /manualDirectorHandoff\.onAccept/);
});

test("正文编辑器在光标处提供续写候选并保留候选写回入口", async () => {
  const editor = await read("src/pages/novels/components/chapterEditor/ChapterEditorShell.tsx");
  const toolbar = await read("src/pages/novels/components/chapterEditor/CursorAIFloatingToolbar.tsx");
  assert.match(toolbar, /CHAPTER_EDITOR_CURSOR_OPERATION_LABELS/);
  assert.match(toolbar, /"continue"/);
  assert.match(toolbar, /"conflict"/);
  assert.match(editor, /previewChapterCursorContinuation/);
  assert.match(editor, /insertChapterContinuation/);
  assert.match(editor, /expectedUpdatedAt: draft\.savedUpdatedAt/);
});

test("自定义厂商配置可选择鉴权方式", async () => {
  const source = await read("src/pages/settings/components/ProviderConfigDialog.tsx");
  assert.match(source, /Authorization: Bearer/);
  assert.match(source, /x-api-key/);
  assert.match(source, /无需鉴权/);
});
