import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

export const WritingFormulaGraphAnnotation = Annotation.Root({
  sourceText: Annotation<string>(),
  extractLevel: Annotation<string>(),
  focusAreas: Annotation<string[]>(),
  styleAnalysis: Annotation<string>(),
  techniqueExtraction: Annotation<string>(),
  formulaMarkdown: Annotation<string>(),
  formulaStructured: Annotation<Record<string, string | null>>(),
  error: Annotation<string | undefined>(),
});

export type WritingFormulaGraphState = typeof WritingFormulaGraphAnnotation.State;
export type WritingFormulaGraphInput = Pick<
  WritingFormulaGraphState,
  "sourceText" | "extractLevel" | "focusAreas"
>;
export type WritingFormulaGraphOutput = Pick<
  WritingFormulaGraphState,
  "styleAnalysis" | "techniqueExtraction" | "formulaMarkdown" | "formulaStructured" | "error"
>;

async function analyzeStyle(state: WritingFormulaGraphState, llm: BaseChatModel) {
  try {
    const result = await llm.invoke([
      new SystemMessage("你是写作风格分析专家，请分析语言风格、叙事视角和节奏。"),
      new HumanMessage(state.sourceText),
    ]);
    const text = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
    return { styleAnalysis: text };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "风格分析失败。" };
  }
}

async function extractTechniques(state: WritingFormulaGraphState, llm: BaseChatModel) {
  try {
    const result = await llm.invoke([
      new SystemMessage("请提取可复现的写作技巧并归纳规则。"),
      new HumanMessage(
        `风格分析：
${state.styleAnalysis}
关注维度：${state.focusAreas.join(", ")}`,
      ),
    ]);
    const text = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
    return { techniqueExtraction: text };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "技巧提取失败。" };
  }
}

async function buildFormula(state: WritingFormulaGraphState, llm: BaseChatModel) {
  try {
    const result = await llm.invoke([
      new SystemMessage("请将分析结果整理为 Markdown 写作公式文档。"),
      new HumanMessage(
        `风格分析：
${state.styleAnalysis}

技巧提取：
${state.techniqueExtraction}

请按以下标题组织：
## 整体风格定位
## 核心写作技巧（含原文例句）
## 可复现的写作公式
## 应用指南（如何用这个公式写新文本）`,
      ),
    ]);
    const text = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
    return { formulaMarkdown: text };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "公式文档构建失败。" };
  }
}

function extractSection(content: string, heading: string): string | null {
  const regex = new RegExp(`##\\s*${heading}[\\s\\S]*?(?=\\n##\\s|$)`, "i");
  const matched = content.match(regex)?.[0];
  if (!matched) {
    return null;
  }
  return matched.replace(new RegExp(`##\\s*${heading}`, "i"), "").trim();
}

async function structureFormula(state: WritingFormulaGraphState) {
  try {
    return {
      formulaStructured: {
        style: extractSection(state.formulaMarkdown, "整体风格定位"),
        formulaDescription: extractSection(state.formulaMarkdown, "核心写作技巧（含原文例句）"),
        formulaSteps: extractSection(state.formulaMarkdown, "可复现的写作公式"),
        applicationTips: extractSection(state.formulaMarkdown, "应用指南（如何用这个公式写新文本）"),
      },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "公式结构化失败。" };
  }
}

export function createWritingFormulaGraph(llm: BaseChatModel) {
  return new StateGraph(WritingFormulaGraphAnnotation)
    .addNode("analyzeStyle", (state) => analyzeStyle(state, llm))
    .addNode("extractTechniques", (state) => extractTechniques(state, llm))
    .addNode("buildFormula", (state) => buildFormula(state, llm))
    .addNode("structureFormula", structureFormula)
    .addEdge(START, "analyzeStyle")
    .addConditionalEdges("analyzeStyle", (state) => (state.error ? END : "extractTechniques"))
    .addConditionalEdges("extractTechniques", (state) => (state.error ? END : "buildFormula"))
    .addConditionalEdges("buildFormula", (state) => (state.error ? END : "structureFormula"))
    .addEdge("structureFormula", END)
    .compile({
      name: "writing-formula-graph",
    });
}
