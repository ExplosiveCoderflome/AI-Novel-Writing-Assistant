import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readClientFile = (relativePath) => readFileSync(join(clientRoot, relativePath), "utf8");

const workbenchPage = readClientFile("src/pages/promptWorkbench/PromptWorkbenchPage.tsx");
const editorShell = readClientFile("src/pages/promptWorkbench/components/PromptEditorShell.tsx");
const runBar = readClientFile("src/pages/promptWorkbench/components/PromptRunBar.tsx");
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
