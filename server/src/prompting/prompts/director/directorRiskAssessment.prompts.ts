import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import {
  DIRECTOR_ISSUE_CODES,
  directorIssueAssessmentSchema,
  type DirectorIssueAssessment,
} from "@ai-novel/shared/types/directorIssue";
import type { PromptAsset } from "../../core/promptTypes";

export interface DirectorIssueAssessmentPromptInput {
  suggestedIssueCode: string;
  stage: string;
  runMode: string;
  summary: string;
  evidence: string;
  affectedScope: string;
  hasUsableOutput: boolean;
  attempt: number;
  maxAttempts: number;
  detailsJson: string;
}

export const directorRiskAssessmentPrompt: PromptAsset<
  DirectorIssueAssessmentPromptInput,
  DirectorIssueAssessment
> = {
  id: "director.risk.assessment",
  version: "v1",
  taskType: "critical_review",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 1_800 },
  outputSchema: directorIssueAssessmentSchema,
  repairPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你是长篇小说自动导演的问题评估器。",
      "你只负责基于当前结构化事实识别问题码、评估 1-8 分风险并给出建议动作。",
      "只输出严格 JSON，不要 Markdown、解释或额外字段。",
      `issueCode 只能是：${DIRECTOR_ISSUE_CODES.join("、")}。`,
      "分数越高表示越可能破坏全书推进、用户内容或运行状态。",
      "局部章节低分、局部义务缺口和可恢复修复失败不得仅凭分数要求暂停全书。",
      "只有明确重规划、无可用正文、保护内容、运行安全或数据完整性问题可以建议暂停或终止。",
      "如果 suggestedIssueCode 已经准确描述确定性安全检查或结构化 AI 结论，应保持该问题码。",
      "如果输入无法归入任何稳定问题码，使用 runtime.unclassified，不要发明新代码。",
    ].join("\n")),
    new HumanMessage([
      `建议问题码：${input.suggestedIssueCode}`,
      `阶段：${input.stage}`,
      `运行模式：${input.runMode}`,
      `摘要：${input.summary}`,
      `证据：${input.evidence || "无补充证据"}`,
      `影响范围：${input.affectedScope || "未知"}`,
      `存在可用产物：${input.hasUsableOutput ? "是" : "否"}`,
      `重试：${input.attempt}/${input.maxAttempts}`,
      "结构化详情：",
      input.detailsJson || "{}",
    ].join("\n")),
  ],
};
