import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AiReplanWindowDecision } from "@ai-novel/shared/types/replanWindowDecision";
import { aiReplanWindowDecisionSchema } from "@ai-novel/shared/types/replanWindowDecision";
import type { PromptAsset } from "../../core/promptTypes";

export interface ReplanWindowDecisionPromptInput {
  triggerType: string;
  reason: string;
  targetChapterOrder: number;
  requestedWindowSize: number;
  availableChapterOrdersJson: string;
  sourceIssueIdsJson: string;
  auditReportsJson: string;
  payoffSummaryJson: string;
  canonicalStateJson: string;
  nextAction: string;
  chapterStateGoalJson: string;
  protectedSecretsJson: string;
}

export const replanWindowDecisionPrompt: PromptAsset<
  ReplanWindowDecisionPromptInput,
  AiReplanWindowDecision
> = {
  id: "planner.replan.window_decision",
  version: "v2",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 2200,
    preferredGroups: ["canonical_state", "audit", "payoff_ledger", "chapter_goal"],
    dropOrder: ["protected_secrets"],
  },
  outputSchema: aiReplanWindowDecisionSchema,
  structuredOutputHint: { compact: true },
  render: (input) => [
    new SystemMessage([
      "你是长篇小说自动导演的重规划窗口决策器。",
      "你的任务是基于 canonical state、章节目标、审校问题和伏笔账本，决定本次重规划应该影响哪些章节，以及为什么。",
      "只输出严格 JSON，不要 Markdown、解释或额外文本。",
      "",
      "【决策规则】",
      "1. affectedChapterOrders 必须只从 availableChapterOrders 中选择，优先选择连续小窗口。",
      "2. 默认窗口 1-5 章；除非状态明确显示跨章连锁问题，不要扩大范围。",
      "3. 普通质量问题优先 repairIntent=patch_repair；计划目标错位用 state_realign；伏笔/承诺错位用 payoff_rebalance。",
      "4. chapter_rewrite 只在结构性缺章或原计划完全不可用时使用。",
      "5. 不要把 protectedSecrets 写进剧情结论，只能作为选择窗口时的保密约束。",
      "6. triggerReason、windowReason、whyTheseChapters 必须让新手能理解为什么要调整这些章节。",
      "7. 审校报告使用 reports 和 assessments：每份 report 的 assessmentIndex 是 assessments 的从 0 开始索引，共享相同评估内容；仍须分别核对 report 的 issues、summary 与章节身份。unparsedAssessment 是无法解析的历史原始评估，只作参考，不得忽略对应报告的问题。",
    ].join("\n")),
    new HumanMessage([
      `触发类型：${input.triggerType}`,
      `用户/系统原因：${input.reason}`,
      `锚点章节：第${input.targetChapterOrder}章`,
      `请求窗口大小：${input.requestedWindowSize}`,
      `可选章节：${input.availableChapterOrdersJson}`,
      `来源问题：${input.sourceIssueIdsJson}`,
      "",
      "【审校报告】",
      input.auditReportsJson,
      "",
      "【伏笔账本摘要】",
      input.payoffSummaryJson,
      "",
      "【canonical state】",
      input.canonicalStateJson,
      "",
      `【下一步状态】${input.nextAction}`,
      "",
      "【章节目标】",
      input.chapterStateGoalJson,
      "",
      "【受保护秘密】",
      input.protectedSecretsJson,
      "",
      "请输出重规划窗口决策 JSON。",
    ].join("\n")),
  ],
};
