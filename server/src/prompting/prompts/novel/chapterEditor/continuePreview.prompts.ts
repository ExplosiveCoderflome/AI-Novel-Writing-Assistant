import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";
import {
  chapterEditorContinuationCandidatesSchema,
  type ChapterEditorContinuationCandidatesParsed,
} from "./continuePreview.promptSchemas";
import type { ChapterEditorCursorOperation } from "@ai-novel/shared/types/novel";

export interface ChapterEditorContinuationPromptInput {
  operation: ChapterEditorCursorOperation;
  operationLabel: string;
  instruction?: string;
  beforeParagraphs: string[];
  afterParagraphs: string[];
  goalSummary?: string | null;
  chapterSummary?: string | null;
  styleSummary?: string | null;
  characterStateSummary?: string | null;
  worldConstraintSummary?: string | null;
  macroContextSummary: string;
}

function renderOptionalBlock(title: string, value?: string | null): string {
  const text = value?.trim() ?? "";
  return `${title}\n${text || "无"}`;
}

export const chapterEditorContinuationPreviewPrompt: PromptAsset<
  ChapterEditorContinuationPromptInput,
  ChapterEditorContinuationCandidatesParsed
> = {
  id: "novel.chapter_editor.continue_preview",
  version: "v1",
  taskType: "writer",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterEditorRewrite,
  },
  contextRequirements: [
    { group: "chapter_mission", priority: 100, sourceHint: "Chapter goal and current continuation task." },
    { group: "style_contract", priority: 88, sourceHint: "Current style profile and anti-AI guidance." },
    { group: "participant_subset", priority: 82, sourceHint: "Relevant character state for local continuation." },
    { group: "world_slice", priority: 76, sourceHint: "World constraints that continuation must preserve." },
    { group: "recent_chapters", priority: 64, sourceHint: "Nearby continuity for editor preview." },
  ],
  outputSchema: chapterEditorContinuationCandidatesSchema,
  structuredOutputHint: {
    mode: "auto",
    note: "返回 2 到 3 个只包含新增正文的候选续写方案。",
  },
  render: (input) => [
    new SystemMessage([
      "你是中文网络小说正文编辑器里的光标续写助手。",
      "用户把光标放在正文中，请围绕光标前后的真实上下文，生成 2 到 3 个可以直接插入正文的候选片段。",
      "",
      "任务边界：",
      "1. 只输出光标位置之后要新增的正文，不要重复光标前后的原文。",
      "2. 候选要能直接接在光标处，除非上下文需要，不要擅自添加段首标题或解释。",
      "3. 不要输出 Markdown、分析过程或候选以外的额外文本，必须返回 schema 对应 JSON。",
      "4. 每个候选控制在 1 到 3 个自然段，优先具体动作、对话和可感知的细节。",
      "",
      "硬性约束：",
      "1. 保留已知剧情事实、人物关系、人称和叙事视角。",
      "2. 不新增未授权世界设定，不替用户做重大剧情跳跃。",
      "3. 不重复最近一句已经完成的动作或信息。",
      "4. 续写要推进当前场景或形成自然过渡，避免空泛总结和模板化 AI 文风。",
      "5. 先理解光标前后的上下文，再执行用户选择的方向。",
      "",
      `本次续写方向：${input.operationLabel}`,
      input.instruction?.trim() ? `用户补充要求：${input.instruction.trim()}` : "用户补充要求：无",
      "",
      "候选要求：",
      "1. 返回 2 到 3 个候选，每个 content 只写新增正文。",
      "2. 每个候选都要有短 label、summary、rationale；风险确实存在时再填写 riskNotes。",
      "3. macroAlignmentNote 用一句话说明候选如何服务本章/本卷目标。",
      "4. semanticTags 只保留 2 到 4 个高价值标签。",
    ].join("\n")),
    new HumanMessage([
      renderOptionalBlock("【本章目标】", input.goalSummary),
      "",
      renderOptionalBlock("【本章摘要】", input.chapterSummary),
      "",
      renderOptionalBlock("【写法与语气】", input.styleSummary),
      "",
      renderOptionalBlock("【角色状态】", input.characterStateSummary),
      "",
      renderOptionalBlock("【世界与设定约束】", input.worldConstraintSummary),
      "",
      renderOptionalBlock("【宏观定位】", input.macroContextSummary),
      "",
      "【光标前的上下文】",
      input.beforeParagraphs.length > 0 ? input.beforeParagraphs.join("\n\n") : "无（光标位于正文开头）",
      "",
      "【光标后的上下文】",
      input.afterParagraphs.length > 0 ? input.afterParagraphs.join("\n\n") : "无（光标位于正文结尾）",
      "",
      "请只返回 JSON。",
    ].join("\n")),
  ],
};
