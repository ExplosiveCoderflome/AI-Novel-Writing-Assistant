import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { payoffLedgerSyncOutputSchema } from "./payoffLedgerSync.promptSchemas";

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
  version: "v2",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  semanticRetryPolicy: {
    maxAttempts: 1,
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
      "- sourceRefs：列出它来自哪些输入来源。",
      "- evidence：只记录能支持当前状态判断的关键证据。",
      "- riskSignals：只有确实存在风险时才填。",
      "- confidence：0 到 1 之间；信息充分且一致时更高。",
      "",
      "如果信息不足，也要尽量产出保守但清晰的账本，不要因为犹豫而把明显存在的伏笔漏掉。",
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
