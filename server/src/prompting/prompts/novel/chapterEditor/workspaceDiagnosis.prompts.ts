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
    id: string;
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
  version: "v2",
  taskType: "writer",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterEditorWorkspaceDiagnosis,
  },
  contextRequirements: [
    { group: "chapter_mission", required: true, priority: 100, sourceHint: "Chapter task shown in the editor workspace." },
    { group: "volume_window", priority: 90, sourceHint: "Volume position and adjacent chapter direction." },
    { group: "open_conflicts", priority: 84, sourceHint: "Active conflicts and unresolved pressure." },
    { group: "participant_subset", priority: 78, sourceHint: "Characters that matter to current edit decisions." },
    { group: "current_draft_excerpt", priority: 72, sourceHint: "Current chapter draft excerpt for diagnosis preview." },
  ],
  outputSchema: chapterEditorWorkspaceDiagnosisSchema,
  structuredOutputHint: {
    mode: "auto",
    note: [
      "输出 0 到 4 个适合初学作者立即处理的问题卡，按阅读影响从高到低排列，并只保留一个最优先任务。",
      "recommendedAction 只能使用英文枚举：polish、expand、compress、emotion、conflict。",
    ].join(" "),
  },
  render: (input) => [
    new SystemMessage([
      "你是中文网络小说章节编辑页中的修文导演。",
      "你的任务是阅读本章的宏观定位、开放问题和段落摘录，为写作新手挑出最值得先处理的问题。",
      "",
      "必须遵守：",
      "1. 面向写作新手，语言直接，不要使用内部系统标签。",
      "2. 问题卡必须可执行，但 recommendedAction 只能输出英文枚举值：compress（精简）、polish（优化表达）、emotion（强化情绪）、conflict（强化冲突）、expand（扩写）。",
      "3. 优先选择真正影响阅读推进、情绪承接或卷内节奏的问题。",
      "4. paragraphStart / paragraphEnd 必须引用提供的段落编号；整章问题可留空。",
      "5. 如果问题卡直接对应【开放问题】中的某一条，sourceIssueId 必须填写该条问题的 id；如果只是新的写作建议则留空。",
      "6. 不要输出 schema 之外的任何解释。",
      "7. 不要输出中文动作词本身；只能输出对应的英文枚举值。",
      "",
      "推荐逻辑：",
      "1. 如果存在明显的节奏、冲突、情绪或承接问题，优先选择这类问题。",
      "2. 推荐任务只能保留一个，且必须是当前最值得用户先动手的任务。",
      "3. 对于问题卡，problemSummary 说明问题本身，whyItMatters 说明为什么现在要改。",
      "4. cards 按对本章任务和目标读者的实际影响排序，第一张是首要问题；recommendedTask 必须对应第一张的范围和动作。不要把修饰词或重复描写优先于未成立的关键行动、人物动机或因果。根据具体题材判断，不强迫所有章节增加冲突或反转。",
      "5. 每张卡提供 repairGoal（怎样才算改善）、repairApproach（具体改什么）和 mustPreserve（这段中必须保留的剧情信息、线索或有效表达）。mustPreserve 只引用已有内容，没有专门保留项则返回空数组。",
      "6. 修复目标必须针对当前问题，例如压缩重复感受并保留新增线索，不能只写通用润色、增强表现力或更有网文感。",
      "7. 没有值得处理的问题时返回空 cards 并省略 recommendedTask，不为了凑卡片制造问题。",
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
        input.openIssues.map((issue, index) => `- ${index + 1}. id=${issue.id} [${issue.severity}/${issue.auditType}/${issue.code}] ${issue.evidence}；建议：${issue.fixSuggestion}`),
      ),
      "",
      renderList(
        "【段落摘录】",
        input.paragraphs.map((paragraph) => `- P${paragraph.index}: ${paragraph.text}`),
      ),
      "",
      "【结构示例；具体诊断必须来自本章正文】",
      "{\"cards\":[{\"title\":\"痛感描写重复\",\"problemSummary\":\"多段反复描述同一种痛感，没有新增信息。\",\"whyItMatters\":\"会拖慢读者进入眼前危机。\",\"repairGoal\":\"压缩重复感受，让危机更快推进。\",\"repairApproach\":\"合并重复的身体感受，保留痛感变化与新增发现。\",\"mustPreserve\":[\"原文中痛感加重的变化\"],\"recommendedAction\":\"compress\",\"recommendedScope\":\"selection\",\"paragraphStart\":12,\"paragraphEnd\":18,\"severity\":\"medium\",\"sourceTags\":[\"节奏\"]}],\"recommendedTask\":{\"title\":\"先压缩重复痛感\",\"summary\":\"保留必要变化，删减没有新增信息的感受。\",\"recommendedAction\":\"compress\",\"recommendedScope\":\"selection\",\"paragraphStart\":12,\"paragraphEnd\":18}}",
      "",
      "请只返回 JSON。",
    ].join("\n")),
  ],
};
