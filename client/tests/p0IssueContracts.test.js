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
  const acceptance = await read("src/pages/novels/components/chapterEditor/review/useCandidateAcceptance.ts");
  assert.match(toolbar, /CHAPTER_EDITOR_CURSOR_OPERATION_LABELS/);
  assert.match(toolbar, /"continue"/);
  assert.match(toolbar, /"conflict"/);
  assert.match(editor, /previewChapterCursorContinuation/);
  assert.match(acceptance, /insertChapterContinuation/);
  assert.match(acceptance, /expectedUpdatedAt: input\.savedUpdatedAt/);
});

test("章节问题卡提供保存后确认已处理的来源页闭环", async () => {
  const sidebar = await read("src/pages/novels/components/chapterEditor/ChapterEditorSidebar.tsx");
  const shell = await read("src/pages/novels/components/chapterEditor/ChapterEditorShell.tsx");
  assert.match(sidebar, /确认问题已处理/);
  assert.match(sidebar, /保存后确认已处理/);
  assert.match(shell, /resolveChapterAuditIssue/);
  assert.match(shell, /onRefreshWorkspace\?\.\(\)/);
});

test("正文候选支持按差异项选择写回", async () => {
  const editor = await read("src/pages/novels/components/chapterEditor/ChapterEditorShell.tsx");
  const panel = await read("src/pages/novels/components/chapterEditor/ChapterEditorDirectorPanel.tsx");
  const acceptance = await read("src/pages/novels/components/chapterEditor/review/useCandidateAcceptance.ts");
  assert.match(acceptance, /applySelectedChapterEditorDiff/);
  assert.match(editor, /selectedDiffChangeIds/);
  assert.match(panel, /选择要写回正文的改动/);
  assert.match(panel, /接受已选/);
});

test("自定义厂商配置可选择鉴权方式", async () => {
  const source = await read("src/pages/settings/components/ProviderConfigDialog.tsx");
  assert.match(source, /Authorization: Bearer/);
  assert.match(source, /x-api-key/);
  assert.match(source, /无需鉴权/);
});
