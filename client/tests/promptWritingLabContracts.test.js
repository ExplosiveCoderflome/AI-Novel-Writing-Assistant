import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readClientFile = (relativePath) => readFileSync(join(clientRoot, relativePath), "utf8");

const workbenchPage = readClientFile("src/pages/promptWorkbench/PromptWorkbenchPage.tsx");
const editorShell = readClientFile("src/pages/promptWorkbench/components/PromptEditorShell.tsx");
const catalogSidebar = readClientFile("src/pages/promptWorkbench/components/PromptCatalogSidebar.tsx");
const runBar = readClientFile("src/pages/promptWorkbench/components/PromptRunBar.tsx");
const themeStyles = readClientFile("src/index.css");
const chapterPage = readClientFile("src/pages/novels/NovelChapterEdit.tsx");
const writingFormulaPage = readClientFile("src/pages/writingFormula/WritingFormulaPage.tsx");

test("正文效果实验室从章节与写法引擎直达本书高级模板试写", () => {
  assert.match(chapterPage, /experience=writing&novelId=/);
  assert.match(writingFormulaPage, /prompt-workbench\?experience=writing/);
  assert.match(workbenchPage, /正文效果实验室/);
  assert.match(workbenchPage, /novel\.chapter\.writer/);
  assert.match(runBar, /试写效果/);
});

test("提示词页隐藏治理摘要，并只在高级模板显示上下文引用", () => {
  assert.doesNotMatch(editorShell, /可编辑槽位|锁定边界/);
  assert.match(workbenchPage, /contextPanel=\{isAdvancedMode/);
});

test("提示词工作台在深色主题下将旧的浅色面板映射为语义色", () => {
  assert.match(workbenchPage, /prompt-workbench-theme/);
  assert.match(workbenchPage, /bg-background text-foreground/);
  assert.match(runBar, /bg-card\/95/);
  assert.match(runBar, /bg-primary text-primary-foreground/);
  assert.match(themeStyles, /\.dark \.prompt-workbench-theme \[class\*="bg-white"\]/);
  assert.match(themeStyles, /\.dark \.prompt-workbench-theme \[class\*="text-\[#254"\]/);
});

test("提示词目录的状态标签使用语义色，避免深色主题下白字失去背景", () => {
  assert.match(catalogSidebar, /bg-success px-1\.5 py-0\.5 text-\[11px\] font-medium leading-4 text-success-foreground/);
  assert.match(catalogSidebar, /bg-success\/15 text-success/);
  assert.doesNotMatch(catalogSidebar, /bg-\[#0f766e\].*text-white/);
});
