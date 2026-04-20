import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";
import {
  chapterEditorWorkspaceDiagnosisSchema,
  type ChapterEditorWorkspaceDiagnosisParsed,
} from "./workspaceDiagnosis.promptSchemas";

export interface ChapterEditorWorkspaceDiagnosisPromptInput {
  chapterTitle: string;
  chapterMission: string;
  volumePositionLabel: string;
  volumePhaseLabel: string;
  paceDirective: string;
  previousChapterBridge: string;
  nextChapterBridge: string;
  activePlotThreads: string[];
  paragraphs: Array<{
    index: number;
    text: string;
  }>;
  openIssues: Array<{
    severity: "low" | "medium" | "high" | "critical";
    auditType: string;
    code: string;
    evidence: string;
    fixSuggestion: string;
  }>;
}

function renderList(title: string, rows: string[]): string {
  return `${title}\n${rows.length > 0 ? rows.join("\n") : "无"}`;
}

export const chapterEditorWorkspaceDiagnosisPrompt: PromptAsset<
  ChapterEditorWorkspaceDiagnosisPromptInput,
  ChapterEditorWorkspaceDiagnosisParsed
> = {
  id: "novel.chapter_editor.workspace_diagnosis",
  version: "v1",
  taskType: "writer",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterEditorWorkspaceDiagnosis,
  },
  outputSchema: chapterEditorWorkspaceDiagnosisSchema,
  structuredOutputHint: {
    mode: "auto",
    note: "输出 1 到 4 个适合初学作者立即处理的问题卡，并只保留一个最优先任务。",
  },
  render: (input) => [
    new SystemMessage([
      "你是中文网络小说章节编辑页中的修文导演。",
      "你的任务是阅读本章的宏观定位、开放问题和段落摘录，为写作新手挑出最值得先处理的问题。",
      "",
      "必须遵守：",
      "1. 面向写作新手，语言直接，不要使用内部系统标签。",
      "2. 问题卡必须可执行，优先给出“精简、优化表达、强化情绪、强化冲突、扩写”中的一个建议动作。",
      "3. 优先选择真正影响阅读推进、情绪承接或卷内节奏的问题。",
      "4. paragraphStart / paragraphEnd 必须引用提供的段落编号；整章问题可留空。",
      "5. 不要输出 schema 之外的任何解释。",
      "",
      "推荐逻辑：",
      "1. 如果存在明显的节奏、冲突、情绪或承接问题，优先选择这类问题。",
      "2. 推荐任务只能保留一个，且必须是当前最值得用户先动手的任务。",
      "3. 对于问题卡，problemSummary 说明问题本身，whyItMatters 说明为什么现在要改。",
    ].join("\n")),
    new HumanMessage([
      `【章节】${input.chapterTitle}`,
      `【本章任务】${input.chapterMission}`,
      `【卷内位置】${input.volumePositionLabel}`,
      `【阶段定位】${input.volumePhaseLabel}`,
      `【节奏建议】${input.paceDirective}`,
      `【承接上一章】${input.previousChapterBridge}`,
      `【铺向下一章】${input.nextChapterBridge}`,
      renderList("【当前主线/伏笔】", input.activePlotThreads.map((item) => `- ${item}`)),
      "",
      renderList(
        "【开放问题】",
        input.openIssues.map((issue, index) => `- ${index + 1}. [${issue.severity}/${issue.auditType}/${issue.code}] ${issue.evidence}；建议：${issue.fixSuggestion}`),
      ),
      "",
      renderList(
        "【段落摘录】",
        input.paragraphs.map((paragraph) => `- P${paragraph.index}: ${paragraph.text}`),
      ),
      "",
      "请只返回 JSON。",
    ].join("\n")),
  ],
};
