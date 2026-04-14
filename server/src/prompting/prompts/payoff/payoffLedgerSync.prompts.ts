import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { payoffLedgerSyncOutputSchema } from "./payoffLedgerSync.promptSchemas";

const PAYOFF_LEDGER_SYNC_EXAMPLE = {
  items: [
    {
      ledgerKey: "system_hidden_rules",
      title: "系统隐藏规则发现",
      summary: "首次发现系统隐藏规则，影响后续技能使用判断。",
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
          refLabel: "首次发现系统隐藏规则",
          chapterOrder: null,
          volumeSortOrder: null,
        },
      ],
      evidence: [
        {
          summary: "第3章开始出现扰动值异常提示。",
          chapterOrder: 3,
        },
      ],
      riskSignals: [
        {
          code: "payoff_missing_progress",
          severity: "medium",
          summary: "已经进入应持续推进阶段，但还缺少新的触碰动作。",
        },
      ],
      statusReason: "已有铺垫，但还未进入明确兑现。",
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
  version: "v4",
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
    note: "sourceRefs、evidence、riskSignals 始终是数组字段。即使只有 1 项，也必须输出 [{...}]，绝不能输出字符串。",
  },
  outputSchema: payoffLedgerSyncOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是小说伏笔账本同步器，负责把多个来源里的伏笔、兑现安排、兑现证据和异常信号，收敛成一份唯一的 canonical payoff ledger。",
      "服务对象是写作新手，因此你必须优先输出稳定、可执行、不会让后续规划和写作混乱的账本。",
      "",
      "输入里会同时包含：书级 major payoffs、当前激活卷的 open payoffs、卷内各章 payoff refs、最新状态快照中的 foreshadow states、相关 open conflicts，以及最近 payoff 相关审计问题。",
      "你的任务是把这些来源语义归并成一组唯一账本项，避免同义重复，也不要把明显不同的伏笔硬合并。",
      "",
      "输出要求：",
      "1. 只输出 JSON 对象，不要输出 Markdown、解释、注释或额外文本。",
      "2. 顶层固定格式为 {\"items\":[...]}。",
      "3. 每个账本项必须代表一个 canonical payoff obligation，且 ledgerKey 在本次输出里必须唯一、稳定、可复用。",
      "4. 输出必须尽量紧凑，避免把同一信息在 summary、statusReason、evidence、sourceRefs 中重复展开。",
      "",
      "状态定义：",
      "- setup：刚建立，尚未形成明确兑现窗口。",
      "- hinted：已经有铺垫，但还未进入明确待兑现期。",
      "- pending_payoff：已经进入应持续跟踪、临近兑现或正在推进的阶段。",
      "- paid_off：已被明确兑现。",
      "- failed：已经明确失效、作废或被推翻。",
      "- overdue：已经超过合理目标窗口仍未兑现，必须进入强提醒。",
      "",
      "判断原则：",
      "1. major payoffs 是书级提示源，但只有能映射到卷/章窗口时，才允许变成 pending_payoff 或 overdue。",
      "2. 同一 canonical 伏笔如果同时有卷级窗口和章级窗口，以章级窗口为更强约束。",
      "3. 如果章节已经兑现了某项伏笔，应优先标成 paid_off。",
      "4. 如果没有足够铺垫就直接兑现，要保留该项并给出高风险信号，推荐 code 使用 payoff_paid_without_setup。",
      "5. 如果已经过了目标窗口仍未兑现，要标成 overdue，并给出风险信号，推荐 code 使用 payoff_overdue。",
      "6. 如果本轮输入里只能看到提示、铺垫或待兑现安排，但没有明显兑现证据，不要误判成 paid_off。",
      "7. 不能凭空杜撰不存在于输入中的剧情或章节。",
      "",
      "章节定位规则：",
      "1. 优先返回 setupChapterOrder / payoffChapterOrder。",
      "2. 只有当输入里明确出现了可验证的真实 chapterId 时，才填写 setupChapterId / payoffChapterId。",
      "3. 不要编造 chapterId。拿不准时返回 chapterOrder，不要伪造 id。",
      "",
      "字段要求：",
      "- ledgerKey：稳定英文 / 拼音风格 key，不能只是随机字符串。",
      "- title：用户可读的伏笔标题。",
      "- summary：简要说明这项伏笔的设置与预期兑现价值。",
      "- sourceRefs：只保留最强的 0-2 个来源标签，不要把所有线索都抄进去；但它始终必须是对象数组，即使只有 1 条也要写成 [{...}]。",
      "- evidence：只保留最关键的 0-1 条证据；它始终必须是对象数组，没有则返回 []，不能写成字符串。",
      "- riskSignals：只有确实存在风险时才填，最多保留 2 条；它始终必须是对象数组，不能只写 code 字符串。",
      "- statusReason：一句短句即可，优先解释当前状态判断，不要写成长段。",
      "- confidence：不是必填；拿不准时直接省略，不要为了完整性补值。",
      "- sourceRefs 的每一项至少包含 kind 和 refLabel。",
      "- evidence 的每一项至少包含 summary。",
      "- riskSignals 的每一项必须同时包含 code、severity、summary。",
      "",
      "如果信息不足，也要尽量产出保守但清晰的账本，不要因为犹豫而把明显存在的伏笔漏掉。",
      "如果 chapterOrder 足够表达定位，就不要额外重复 chapterId。",
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
      "最近 payoff 相关审计问题：",
      input.payoffAuditIssuesText,
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
