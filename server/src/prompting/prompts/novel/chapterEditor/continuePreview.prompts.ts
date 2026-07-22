import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";
import {
  chapterEditorContinuePreviewSchema,
  type ChapterEditorContinuePreviewParsed,
} from "./continuePreview.promptSchemas";

export interface ChapterEditorContinuePreviewPromptInput {
  textBefore: string;
  textAfter?: string | null;
  customInstruction?: string | null;
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

export const chapterEditorContinuePreviewPrompt: PromptAsset<
  ChapterEditorContinuePreviewPromptInput,
  ChapterEditorContinuePreviewParsed
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
    { group: "chapter_mission", priority: 100, sourceHint: "Chapter goal and context." },
    { group: "style_contract", priority: 88, sourceHint: "Prose style contract." },
    { group: "participant_subset", priority: 82, sourceHint: "Relevant character profiles." },
    { group: "world_slice", priority: 76, sourceHint: "World rules." },
  ],
  outputSchema: chapterEditorContinuePreviewSchema,
  structuredOutputHint: {
    mode: "auto",
    note: "生成 2 到 3 个候选续写方案，可以直接续接在 textBefore 之后，保持 JSON 稳定。",
  },
  render: (input) => {
    return [
      new SystemMessage([
        "你是中文网络小说章节编辑器里的续写助手。",
        "你的职责是根据光标处的上下文，顺接前文（textBefore）并平滑过渡到后文（textAfter，若有），给出 2 到 3 个可供选择的后续续写片段。",
        "",
        "任务边界：",
        "1. 只生成续写片段内容（通常是几句话到一两段），不要重写整章。",
        "2. 续写必须贴合前后文语气、人物状态和本章目标，保持网文风格节奏，杜绝AI腔、说教感。",
        "3. 不要解释过程，不要输出 Markdown，必须返回符合 schema 的 JSON。",
        "",
        "硬性约束：",
        "1. 严格遵守人称、视角和世界设定限制。",
        "2. 平滑承接，逻辑合理，不可无端跳跃剧情。",
        "3. 如果用户提供了“续写方向说明”（customInstruction），续写候选应朝该方向延伸。",
        "",
        "候选要求：",
        "1. 返回 2 到 3 个候选。",
        "2. content 是可以直接追加在 textBefore 之后，并且逻辑上能平滑连接 textAfter（如果有）的文本。",
        "3. rationale 概括这版续写的设计侧重或情感线索。",
        "4. semanticTags 附带 2-3 个合适的高价值标签，如“增加心理描写”“推进情节动作”等。",
        "5. label 应该非常简短（如“顺接情节”、“强化矛盾”）。",
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
        input.customInstruction?.trim()
          ? `【用户指定的续写方向】\n${input.customInstruction.trim()}`
          : "【用户指定的续写方向】\n顺接前文自然发展",
        "",
        "【光标前文本 (textBefore)】",
        input.textBefore,
        "",
        "【光标后文本 (textAfter)】",
        input.textAfter || "无（光标位于章节末尾）",
        "",
        "请只返回 JSON。",
      ].join("\n")),
    ];
  },
};
