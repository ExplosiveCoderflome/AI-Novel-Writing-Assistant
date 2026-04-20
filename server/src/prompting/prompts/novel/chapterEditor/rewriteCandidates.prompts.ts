import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";
import {
  chapterEditorRewriteCandidatesSchema,
  type ChapterEditorRewriteCandidatesParsed,
} from "./rewriteCandidates.promptSchemas";

export interface ChapterEditorRewriteCandidatesPromptInput {
  operation: "polish" | "expand" | "compress" | "emotion" | "conflict" | "custom";
  operationLabel: string;
  scope: "selection" | "chapter";
  customInstruction?: string;
  selectedText: string;
  beforeParagraphs: string[];
  afterParagraphs: string[];
  goalSummary?: string | null;
  chapterSummary?: string | null;
  styleSummary?: string | null;
  characterStateSummary?: string | null;
  worldConstraintSummary?: string | null;
  macroContextSummary: string;
  resolvedIntentSummary: string;
  constraintsText: string;
}

function renderOptionalBlock(title: string, value?: string | null): string {
  const text = value?.trim() ?? "";
  return `${title}\n${text || "无"}`;
}

export const chapterEditorRewriteCandidatesPrompt: PromptAsset<
  ChapterEditorRewriteCandidatesPromptInput,
  ChapterEditorRewriteCandidatesParsed
> = {
  id: "novel.chapter_editor.rewrite_candidates",
  version: "v2",
  taskType: "writer",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterEditorRewrite,
  },
  outputSchema: chapterEditorRewriteCandidatesSchema,
  structuredOutputHint: {
    mode: "auto",
    note: "返回 2 到 3 个候选改写方案，保持 JSON 稳定。",
  },
  render: (input) => [
    new SystemMessage([
      "你是中文网络小说章节编辑器里的局部改写助手。",
      "你的职责是围绕用户选中的一段正文，给出 2 到 3 个可直接比较的候选改写版本。",
      "",
      "任务边界：",
      "1. 只改写选中片段，不要重写整章。",
      "2. 改写必须贴合前后文语气、人物状态和本章目标。",
      "3. 不要解释过程，不要输出 Markdown，不要输出候选以外的额外文本。",
      "4. 必须返回符合 schema 的 JSON。",
      "",
      "硬性约束：",
      "1. 不改剧情事实。",
      "2. 不改变人称和叙事视角。",
      "3. 不新增未授权设定。",
      "4. 尽量保留原段核心信息与上下文承接。",
      "5. 不要把文本改得明显像模板化 AI 文风。",
      "",
      "候选要求：",
      "1. 返回 2 到 3 个候选。",
      "2. 每个候选都必须是完整可替换的片段文本。",
      "3. rationale 用一句话说明这版主要改法。",
      "4. riskNotes 列出 0 到 3 条需要用户注意的风险。",
      "5. macroAlignmentNote 用一句话说明这些候选如何服务本章/本卷目标。",
      "6. label 要短，适合在编辑器里做候选切换。",
      "7. summary 用一句话概括主要改动。",
      "8. semanticTags 只保留 2 到 4 个高价值标签，例如“增强情绪”“压缩重复”“补足动作细节”。",
      "",
      "改写范围：",
      "1. selection 表示只改写选中片段。",
      "2. chapter 表示改写整章，但依旧要保持章节事实、主线和卷内定位。",
      "3. 候选要形成清晰差异，例如更自然、更克制、更强化情绪，但都要可用。",
      "",
      `本次改写意图：${input.operationLabel}`,
      `改写范围：${input.scope === "selection" ? "选中片段" : "整章"}`,
      input.customInstruction?.trim()
        ? `用户补充要求：${input.customInstruction.trim()}`
        : "用户补充要求：无",
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
      renderOptionalBlock("【已解析的修改目标】", input.resolvedIntentSummary),
      "",
      "【改写硬约束】",
      input.constraintsText,
      "",
      "【前文片段】",
      input.beforeParagraphs.length > 0 ? input.beforeParagraphs.join("\n\n") : "无",
      "",
      "【待改写原文】",
      input.selectedText,
      "",
      "【后文片段】",
      input.afterParagraphs.length > 0 ? input.afterParagraphs.join("\n\n") : "无",
      "",
      "请只返回 JSON。",
    ].join("\n")),
  ],
};
