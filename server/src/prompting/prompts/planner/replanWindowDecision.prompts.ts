import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AiReplanWindowDecision } from "@ai-novel/shared/types/replanWindowDecision";
import { aiReplanWindowDecisionSchema } from "@ai-novel/shared/types/replanWindowDecision";
import type { PromptAsset } from "../../core/promptTypes";
import { renderCacheContextSections } from "../../core/cache";

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
  version: "v3",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 2200,
    requiredGroups: ["canonical_baseline", "canonical_state", "audit", "payoff_ledger", "chapter_goal", "protected_secrets"],
    preferredGroups: ["canonical_state", "audit", "payoff_ledger", "chapter_goal"],
  },
  outputSchema: aiReplanWindowDecisionSchema,
  cacheBoundary: { messageIndex: 0, contentBlockIndex: 0 },
  structuredOutputHint: { compact: true, placement: "stable_prefix" },
  render: (input, context) => {
    const sections = renderCacheContextSections(context);
    const fallback = (id: string, label: string, value: string) =>
      context.blocks.some(block => block.id === id) ? "" : `【${label}】\n${value}`;
    return [
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
        "8. 书级状态基线和动态 canonical state 共同组成完整状态。动态 narrative 的 pendingPayoffs、urgentPayoffs、overduePayoffs 若为整数数组，每个数字是 payoffStates 的从 0 开始索引；必须还原并核对各列表全部成员。同 ID 的不同事实版本不得合并。旧格式的对象数组按完整记录读取。",
      ].join("\n")),
      new HumanMessage([
        sections.stable,
        "",
        `触发类型：${input.triggerType}`,
        `用户/系统原因：${input.reason}`,
        `锚点章节：第${input.targetChapterOrder}章`,
        `请求窗口大小：${input.requestedWindowSize}`,
        `可选章节：${input.availableChapterOrdersJson}`,
        `来源问题：${input.sourceIssueIdsJson}`,
        "",
        sections.dynamic,
        fallback("audit", "审校报告", input.auditReportsJson),
        "",
        fallback("payoff_ledger", "伏笔账本摘要", input.payoffSummaryJson),
        "",
        fallback("canonical_state", "canonical state", input.canonicalStateJson),
        "",
        `【下一步状态】${input.nextAction}`,
        "",
        fallback("chapter_goal", "章节目标", input.chapterStateGoalJson),
        "",
        fallback("protected_secrets", "受保护秘密", input.protectedSecretsJson),
        "",
        "请输出重规划窗口决策 JSON。",
      ].join("\n")),
    ];
  },
};
