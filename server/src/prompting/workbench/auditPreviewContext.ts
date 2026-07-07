import type { PromptContextBlock } from "../core/promptTypes";
import { createContextBlock } from "../core/contextBudget";
import {
  compactPreviewText,
  parseSceneCards,
  previewListBlock,
  readString,
  readStringList,
  truncatePreviewText,
  type PreviewChapterRow,
  type PreviewNovelRow,
} from "./previewContextSupport";

export function buildChapterPreviewBlocks(input: {
  novel: PreviewNovelRow;
  chapter: PreviewChapterRow;
}): PromptContextBlock[] {
  const { chapter, novel } = input;
  const scenes = parseSceneCards(chapter.sceneCards);
  const firstScene = scenes[0] ?? null;
  const lastScene = scenes[scenes.length - 1] ?? null;
  const mustAdvance = scenes.flatMap((scene) => readStringList(scene.mustAdvance)).slice(0, 8);
  const mustPreserve = scenes.flatMap((scene) => readStringList(scene.mustPreserve)).slice(0, 8);
  const forbiddenExpansion = scenes.flatMap((scene) => readStringList(scene.forbiddenExpansion)).slice(0, 8);
  const chapterLabel = `第 ${chapter.order} 章《${chapter.title || "未命名章节"}》`;

  return [
    createContextBlock({
      id: "chapter_mission",
      group: "chapter_mission",
      priority: 100,
      content: [
        `Chapter mission: ${chapterLabel}`,
        chapter.expectation ? `Objective: ${chapter.expectation}` : "",
        chapter.targetWordCount ? `Target length: around ${chapter.targetWordCount} Chinese characters.` : "",
        previewListBlock("Must advance", mustAdvance.length > 0 ? mustAdvance : [chapter.expectation]),
        previewListBlock("Must preserve", mustPreserve),
        chapter.taskSheet ? `Original task sheet:\n${truncatePreviewText(chapter.taskSheet, 2200)}` : "",
        chapter.hook ? `Ending hook: ${chapter.hook}` : "",
      ].filter(Boolean).join("\n"),
    }),
    createContextBlock({
      id: "chapter_boundary",
      group: "chapter_boundary",
      priority: 99,
      required: true,
      allowSummary: false,
      content: [
        "Chapter boundary:",
        chapter.expectation ? `Exclusive event: ${chapter.expectation}` : `Exclusive event: ${chapterLabel}`,
        firstScene ? `Entry state: ${readString(firstScene.entryState) || "未提供场景入口状态"}` : "",
        lastScene ? `Ending state: ${readString(lastScene.exitState) || compactPreviewText(chapter.hook) || "未提供场景结束状态"}` : "",
        chapter.hook ? `Next chapter entry state: ${chapter.hook}` : "",
        previewListBlock("Do not cross", [
          chapter.mustAvoid,
          ...forbiddenExpansion,
          chapter.hook ? `不得直接展开钩子之后的后续事件：${chapter.hook}` : "",
        ]),
        previewListBlock("Protected reveals", []),
      ].filter(Boolean).join("\n"),
    }),
    createContextBlock({
      id: "structure_obligations",
      group: "structure_obligations",
      priority: 94,
      required: true,
      content: [
        "Structure obligations",
        ...[
          chapter.expectation ? `- chapter objective: ${chapter.expectation}` : "",
          ...mustAdvance.map((item) => `- must advance: ${item}`),
          ...mustPreserve.map((item) => `- must preserve: ${item}`),
          chapter.hook ? `- hook target: ${chapter.hook}` : "",
          chapter.mustAvoid ? `- boundary do-not-cross: ${chapter.mustAvoid}` : "",
        ].filter(Boolean),
      ].join("\n"),
    }),
    createContextBlock({
      id: "local_state",
      group: "local_state",
      priority: 89,
      content: [
        "Local state before review:",
        `Novel: ${novel.title}`,
        `Chapter: ${chapterLabel}`,
        chapter.content?.trim()
          ? `Current draft excerpt:\n${truncatePreviewText(chapter.content, 1800)}`
          : "Current draft excerpt: 该章节暂无正文，预览使用章节任务和任务单展示上下文。",
      ].join("\n"),
    }),
    createContextBlock({
      id: "world_rules",
      group: "world_rules",
      priority: 84,
      content: [
        "Relevant book rules:",
        novel.description ? `简介：${truncatePreviewText(novel.description, 600)}` : "",
        novel.targetAudience ? `目标读者：${novel.targetAudience}` : "",
        novel.bookSellingPoint ? `核心卖点：${novel.bookSellingPoint}` : "",
        novel.first30ChapterPromise ? `前 30 章承诺：${novel.first30ChapterPromise}` : "",
      ].filter(Boolean).join("\n"),
    }),
  ].filter((block) => block.content.trim().length > 0);
}
