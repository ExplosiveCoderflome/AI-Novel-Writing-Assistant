import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { payoffLedgerSyncOutputSchema } from "./payoffLedgerSync.promptSchemas";

const PAYOFF_LEDGER_SYNC_EXAMPLE = {
  items: [
    {
      ledgerKey: "system_hidden_rules",
      title: "系统隐藏规则浮出水面",
      summary: "主角第一次确认隐藏规则真实存在，后续必须继续推进并兑现其代价。",
      scopeType: "book",
      currentStatus: "setup",
      targetStartChapterOrder: 3,
      targetEndChapterOrder: 40,
      firstSeenChapterOrder: 3,
      lastTouchedChapterOrder: 9,
      setupChapterOrder: 3,
      sourceRefs: [
        {
          kind: "major_payoff",
          refLabel: "第一次看见系统异常提示",
          chapterOrder: 3,
          volumeSortOrder: 1,
        },
      ],
      evidence: [
        {
          summary: "第三章已经明确出现异常提示并影响主角判断。",
          chapterOrder: 3,
        },
      ],
      riskSignals: [
        {
          code: "payoff_missing_progress",
          severity: "medium",
          summary: "已经进入应持续推进阶段，但后续还缺少新的触碰动作。",
        },
      ],
      statusReason: "已建立核心铺垫，但仍未进入明确兑现窗口。",
      confidence: 0.82,
    },
  ],
};

export interface PayoffLedgerSyncPromptInput {
  novelTitle: string;
  activeVolumeSummary: string;
  latestChapterContext: string;
  majorPayoffsText: string;
  openPayoffsText: string;
  chapterPayoffRefsText: string;
  foreshadowStatesText: string;
  payoffConflictsText: string;
  payoffAuditIssuesText: string;
}

export const payoffLedgerSyncPrompt: PromptAsset<
  PayoffLedgerSyncPromptInput,
  z.infer<typeof payoffLedgerSyncOutputSchema>
> = {
  id: "novel.payoff_ledger.sync",
  version: "v5",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  semanticRetryPolicy: {
    maxAttempts: 1,
  },
  structuredOutputHint: {
    example: PAYOFF_LEDGER_SYNC_EXAMPLE,
    note: [
      "sourceRefs、evidence、riskSignals 始终必须是数组。",
      "sourceRefs.kind 只能是 major_payoff、volume_open_payoff、chapter_payoff_ref、foreshadow_state、open_conflict、audit_issue。",
      "禁止输出旧别名 chapter_payoff 或 volume_open。",
      "scopeType 只能是 book、volume、chapter。",
      "confidence 只能是 0-1 数字；拿不准就省略。",
    ].join(" "),
  },
  outputSchema: payoffLedgerSyncOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是小说伏笔账本同步器，负责把多个来源中的伏笔、兑现安排、兑现证据和异常信号，收敛成唯一的 canonical payoff ledger。",
      "产品服务对象是写作新手，所以你的输出必须稳定、可执行、易于后续系统继续规划，而不是写成长篇分析。",
      "",
      "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释或任何额外文本。",
      "顶层固定格式只能是 {\"items\":[...]}。",
      "",
      "硬性字段约束：",
      "1. sourceRefs.kind 只能是：major_payoff、volume_open_payoff、chapter_payoff_ref、foreshadow_state、open_conflict、audit_issue。",
      "2. 不要输出旧别名 chapter_payoff 或 volume_open。",
      "3. scopeType 只能是：book、volume、chapter。",
      "4. confidence 不是必填；只有明确有把握时才写，而且必须是 0-1 的数字。",
      "5. sourceRefs、evidence、riskSignals 即使只有一项也必须输出数组，不能输出对象或字符串。",
      "",
      "任务目标：",
      "1. 把 major payoffs、open payoffs、chapter payoff refs、foreshadow states、open conflicts 和 payoff audit issues 归并成唯一账本项。",
      "2. 避免把同义重复项拆成多个 ledger item，也不要把明显不同的伏笔强行合并。",
      "3. 账本项必须保守、稳定，不能编造输入中不存在的新剧情。",
      "",
      "状态定义：",
      "- setup：刚建立，还未形成明确兑现窗口。",
      "- hinted：已经有铺垫，但还未进入明确待兑现阶段。",
      "- pending_payoff：已经进入应持续跟进、临近兑现或正在推进的阶段。",
      "- paid_off：已经被明确兑现。",
      "- failed：已经明确失效、作废或被推翻。",
      "- overdue：已经超过合理目标窗口仍未兑现，必须被系统重点提醒。",
      "",
      "章节定位规则：",
      "1. 优先返回 setupChapterOrder / payoffChapterOrder。",
      "2. 只有当输入里明确出现了可验证的真实 chapterId 时，才填写 setupChapterId / payoffChapterId。",
      "3. 不要编造 chapterId；拿不准时返回 chapterOrder，不要伪造 ID。",
      "",
      "压缩输出规则：",
      "1. sourceRefs 只保留最强的 0-2 个来源。",
      "2. evidence 只保留最关键的 0-1 条证据。",
      "3. riskSignals 只在确有风险时填写，最多保留 2 条。",
      "4. statusReason 用一句短句说明当前状态判断依据，不要写长段。",
      "",
      "判断原则：",
      "1. major payoffs 是书级提示源，但只有映射到卷/章窗口后，才允许进入 pending_payoff 或 overdue。",
      "2. 同一 canonical payoff 若同时有卷级窗口和章节窗口，以章节窗口为更强约束。",
      "3. 如果已经有明确兑现证据，应优先标成 paid_off。",
      "4. 如果没有足够铺垫就直接兑现，要保留该项并输出风险信号。",
      "5. 如果已经过了目标窗口仍未兑现，要标成 overdue。",
      "6. 如果输入里只有提示和铺垫，没有明确兑现证据，不要误判为 paid_off。",
      "",
      "输出必须严格符合 payoffLedgerSyncOutputSchema。",
    ].join("\n")),
    new HumanMessage([
      `小说标题：${input.novelTitle}`,
      "",
      "当前激活卷与章节窗口：",
      input.activeVolumeSummary,
      "",
      "最近章节上下文：",
      input.latestChapterContext,
      "",
      "书级 major payoffs：",
      input.majorPayoffsText,
      "",
      "当前卷 open payoffs：",
      input.openPayoffsText,
      "",
      "当前卷 chapter payoff refs：",
      input.chapterPayoffRefsText,
      "",
      "最新 foreshadow states：",
      input.foreshadowStatesText,
      "",
      "相关 open conflicts：",
      input.payoffConflictsText,
      "",
      "最近 payoff 审校问题：",
      input.payoffAuditIssuesText,
      "",
      "输出提醒：",
      "1. kind 只能用规定枚举，禁止使用 chapter_payoff / volume_open。",
      "2. confidence 如填写，必须是数字，不要写成字符串。",
      "3. scopeType 只能是 book、volume、chapter。",
    ].join("\n")),
  ],
  postValidate: (output) => {
    const ledgerKeySet = new Set<string>();
    for (const item of output.items) {
      if (ledgerKeySet.has(item.ledgerKey)) {
        throw new Error(`重复的 ledgerKey：${item.ledgerKey}`);
      }
      ledgerKeySet.add(item.ledgerKey);
      if (
        item.targetStartChapterOrder
        && item.targetEndChapterOrder
        && item.targetStartChapterOrder > item.targetEndChapterOrder
      ) {
        throw new Error(`伏笔 ${item.ledgerKey} 的目标章节窗口非法。`);
      }
      if (item.currentStatus === "paid_off" && !item.payoffChapterId && item.payoffChapterOrder == null) {
        throw new Error(`伏笔 ${item.ledgerKey} 已兑现时必须返回 payoffChapterOrder 或 payoffChapterId。`);
      }
    }
    return output;
  },
};
