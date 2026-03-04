import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

export const ChapterWritingGraphAnnotation = Annotation.Root({
  novelContext: Annotation<string>(),
  chapterTitle: Annotation<string>(),
  chapterSummary: Annotation<string>(),
  previousSummaries: Annotation<string[]>(),
  scenePlan: Annotation<string>(),
  dialoguePoints: Annotation<string>(),
  chapterContent: Annotation<string>(),
  chapterSummaryGenerated: Annotation<string>(),
  error: Annotation<string | undefined>(),
});

export type ChapterWritingGraphState = typeof ChapterWritingGraphAnnotation.State;
export type ChapterWritingGraphInput = Pick<
  ChapterWritingGraphState,
  "novelContext" | "chapterTitle" | "chapterSummary" | "previousSummaries"
>;
export type ChapterWritingGraphOutput = Pick<
  ChapterWritingGraphState,
  "scenePlan" | "dialoguePoints" | "chapterContent" | "chapterSummaryGenerated" | "error"
>;

async function planScene(state: ChapterWritingGraphState, llm: BaseChatModel) {
  try {
    const result = await llm.invoke([
      new SystemMessage("你是小说分镜编辑，请给出章节场景规划（开头/中段/结尾）。"),
      new HumanMessage(
        `小说背景：
${state.novelContext}
章节标题：${state.chapterTitle}
章节简介：${state.chapterSummary}
前文摘要：
${state.previousSummaries.join("\n") || "无"}`,
      ),
    ]);
    const text = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
    return { scenePlan: text };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "场景规划失败。" };
  }
}

async function generateContent(state: ChapterWritingGraphState, llm: BaseChatModel) {
  try {
    const result = await llm.invoke([
      new SystemMessage("你是小说创作助手，请按场景规划写出章节正文。"),
      new HumanMessage(
        `章节标题：${state.chapterTitle}
章节规划：
${state.scenePlan}
章节简介：
${state.chapterSummary}
请输出完整章节内容。`,
      ),
    ]);
    const text = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
    return {
      chapterContent: text,
      dialoguePoints: "对话要点已融合在章节正文中。",
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "章节生成失败。" };
  }
}

async function summarizeChapter(state: ChapterWritingGraphState, llm: BaseChatModel) {
  try {
    const result = await llm.invoke([
      new SystemMessage("请将章节内容总结为 100 字摘要。"),
      new HumanMessage(state.chapterContent),
    ]);
    const text = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
    return {
      chapterSummaryGenerated: text,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "章节摘要生成失败。" };
  }
}

export function createChapterWritingGraph(llm: BaseChatModel) {
  return new StateGraph(ChapterWritingGraphAnnotation)
    .addNode("planScene", (state) => planScene(state, llm))
    .addNode("generateContent", (state) => generateContent(state, llm))
    .addNode("summarizeChapter", (state) => summarizeChapter(state, llm))
    .addEdge(START, "planScene")
    .addConditionalEdges("planScene", (state) => (state.error ? END : "generateContent"))
    .addConditionalEdges("generateContent", (state) => (state.error ? END : "summarizeChapter"))
    .addEdge("summarizeChapter", END)
    .compile({
      name: "chapter-writing-graph",
    });
}
