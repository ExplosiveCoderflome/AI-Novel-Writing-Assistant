import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";
import {
  chapterEditorIssueFixPreviewSchema,
  type ChapterEditorIssueFixPreviewParsed,
} from "./issueFixPreview.promptSchemas";

export interface ChapterEditorIssueFixPreviewPromptInput {
  issueDescription: string;
  issueEvidence: string;
  issueFixSuggestion: string;
  selectedText: string;
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

export const chapterEditorIssueFixPreviewPrompt: PromptAsset<
  ChapterEditorIssueFixPreviewPromptInput,
  ChapterEditorIssueFixPreviewParsed
> = {
  id: "novel.chapter_editor.issue_fix_preview",
  version: "v1",
  taskType: "writer",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterEditorRewrite,
  },
  contextRequirements: [
    { group: "chapter_mission", priority: 100, sourceHint: "Chapter goal and context." },
    { group: "style_contract", priority: 88, sourceHint: "Prose style contract." },
    { group: "participant_subset", priority: 82, sourceHint: "Relevant character profiles." },
    { group: "world_slice", priority: 76, sourceHint: "World rules." },
  ],
  outputSchema: chapterEditorIssueFixPreviewSchema,
  structuredOutputHint: {
    mode: "auto",
    note: "针对审校问题返回 2 到 3 个修改方案，保持 JSON 稳定。",
  },
  render: (input) => {
    return [
      new SystemMessage([
        "你是中文网络小说章节编辑器里的审校问题修复助手。",
        "你的职责是针对审校诊断出的具体问题（包含问题描述、问题证据、修复建议），对涉及的待改写正文段落（selectedText）进行定向修复，给出 2 到 3 个可供选择的修改片段。",
        "",
        "任务边界：",
        "1. 只针对 selectedText 进行修改，其余上下文（beforeParagraphs/afterParagraphs）只作为参考连贯性的环境，不要修改它们。",
        "2. 修改必须确实解决诊断出的问题，同时符合文风语气、人物状态和本章目标，杜绝AI腔、说教感。",
        "3. 不要解释过程，不要输出 Markdown，必须返回符合 schema 的 JSON。",
        "",
        "候选要求：",
        "1. 返回 2 到 3 个候选。",
        "2. content 是修复后的完整段落文本，可以直接替换 selectedText。",
        "3. rationale 概括这版修改是如何解决该审校问题的。",
        "4. semanticTags 附带 2-3 个合适的高价值标签，如“修复人称偏差”“补充动作细节”“压缩多余词汇”等。",
        "5. label 应该非常简短（如“修复称呼”、“精简描写”）。",
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
        "【待修复的问题】",
        `问题描述: ${input.issueDescription}`,
        `问题证据: ${input.issueEvidence}`,
        `修复建议: ${input.issueFixSuggestion}`,
        "",
        "【前文片段】",
        input.beforeParagraphs.length > 0 ? input.beforeParagraphs.join("\n\n") : "无",
        "",
        "【待修改原文 (selectedText)】",
        input.selectedText,
        "",
        "【后文片段】",
        input.afterParagraphs.length > 0 ? input.afterParagraphs.join("\n\n") : "无",
        "",
        "请只返回 JSON。",
      ].join("\n")),
    ];
  },
};
