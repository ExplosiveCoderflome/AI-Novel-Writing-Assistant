import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../core/promptTypes";
import { DailyAllocationOutputSchema, DailyAllocationOutput, StockKnowledgeGraphItem } from "../../../modules/stock/types/stockTypes";

export interface StockAllocationPromptInput {
  strategyDate: string;
  cashBalance: number;
  totalBudget: number;
  riskPreference: string;
  positionsJson: string;
  watchlistJson?: string;
  marketIntelContext: string;
  // === 记忆治理与 P&L 输入 ===
  generationMode?: "FRESH" | "REPLAN" | "ADJUST";       // 生成模式
  currentTotalPnLContext?: string;                       // HOT: 当前实时 P&L（已格式化）
  positionChangesContext?: string;                       // REPLAN: 持仓变化摘要
  retroContext?: string;                                 // WARM: 上次复盘结果
  disciplineContext?: string;                            // COLD: 交易纪律账本
  warmStrategySummaries?: string;                        // WARM: 近期指南压缩摘要
}

export const stockAllocationPrompt: PromptAsset<StockAllocationPromptInput, DailyAllocationOutput> = {
  id: "stock.allocation.strategy",
  version: "v2",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  outputSchema: DailyAllocationOutputSchema,
  contextPolicy: {
    maxTokensBudget: 4000,
  },
  render(input: StockAllocationPromptInput) {
    const mode = input.generationMode ?? "FRESH";

    // 模式感知的任务说明
    const modeInstruction =
      mode === "REPLAN"
        ? `【模式：REPLAN — 持仓已发生变化】用户已操盘！请以持仓变化为起点，结合复盘结果，重新推演今日操盘方案。复盘中必须包含具体 P&L 归因数字。`
        : mode === "ADJUST"
        ? `【模式：ADJUST — 持仓无变化】持仓无变化，但市场可能发生了新的变化。请分析最新行情/新闻，微调目标价和操盘指令。保持策略连续性，结合现有 P&L 状态给出新的目标价。`
        : `【模式：FRESH — 首次生成】首次生成今日操盘指南，基于当前持仓、实时 P&L 状态、可用资金与隔夜行情给出操盘建议。`;

    return [
      new SystemMessage(
        `你是一位顶级华尔街量化投资经理与资深美股策略师。你的任务是根据用户的美股持仓、可用资金/预算、风险偏好以及隔夜美股宏观新闻，推演并给出每日仓位调整策略建议 (Daily Allocation Blueprint)。

${modeInstruction}

【重要安全原则与写作要求】
1. 本指令仅为投资研究与调仓建议 (Advisory Only)，绝不会自动下单。
2. 调仓指令必须严格考虑用户的闲置现金与新增预算上限，严禁建议超出可用资金的买入。
3. 检查单股集中度风险：若单只股票持仓占比超过总资产 30%，需在风控提示 (riskAlerts) 中醒目预警。
4. 【自选股优先法则】：建议加仓或新建仓位时，【必须优先从【用户 MooMoo 自选关注股票池】中挑选】最具上涨潜力和隔夜催化剂的标的。
5. 【数据真实性铁律】：AI 仅负责提供专业研判逻辑 (rationale) 与买卖方向决策 (action)，【严禁虚构或自行估计任何股价数字】！必须 100% 忠实于上下文中由 OpenD 实盘抓取的真实股价数据！
6. 【P&L 输出必须字段】：每条 action 必须包含 targetPrice (目标价)、stopLossPrice (止损价)、projectedPnL (预期盈亏 $)、projectedPnLPct (预期盈亏%)、timeHorizon (预期实现周期)。
7. 【三大核心指南】必须结构化输出：
   - existingPositionGuidance：【指南一：已有仓位的增减】
   - newPositionGuidance：【指南二：新仓位的建立】
   - retrospectiveGuidance：【指南三：昨日指南复盘与沉淀优化】— 必须包含具体盈亏归因数字。
8. 【每股真实知识图谱 (Knowledge Graph Triples)】：严禁硬编码假节点。
9. 策略解读 (narrativeReport)：采用清晰、严谨、条理分明且极具实操价值的专业金融研报结构。`
      ),
      new HumanMessage(
        `【日期】：${input.strategyDate}
【用户资金】：闲置现金 $${input.cashBalance} | 计划新增预算 $${input.totalBudget} | 风险偏好: ${input.riskPreference}

${input.currentTotalPnLContext ? `${input.currentTotalPnLContext}

` : ""}【当前 MooMoo 真实持仓】：
${input.positionsJson}

【★ 用户 MooMoo 自选关注股票池 (优先推荐池)】：
${input.watchlistJson || "暂无自选"}
${input.positionChangesContext ? `
【⚡ 持仓变化记录（REPLAN 触发原因）】：
${input.positionChangesContext}
` : ""}
${input.retroContext ? `【🔄 上次指南复盘结果】：
${input.retroContext}
` : ""}
${input.disciplineContext ? `【📚 交易纪律账本】：
${input.disciplineContext}
` : ""}
${input.warmStrategySummaries ? `【🗓 近期指南记录】：
${input.warmStrategySummaries}
` : ""}
【美股隔夜宏观与持仓/自选个股情报】：
${input.marketIntelContext}

请输出包含【指南一：已有仓位增减】、【指南二：新仓位建立】与【指南三：昨日指南复盘沉淀】的今日调仓建议清单、各股票知识图谱实体与三元组边、风控警报与专业机构研报。
【P&L 输出要求】：每条 action 必须包含 targetPrice, stopLossPrice, projectedPnL, projectedPnLPct, timeHorizon。`
      ),
    ];
  },
};

export interface StockKnowledgeGraphDistillInput {
  rawNewsText: string;
  symbols: string[];
}

export const stockKnowledgeGraphDistillPrompt: PromptAsset<StockKnowledgeGraphDistillInput, { items: StockKnowledgeGraphItem[] }> = {
  id: "stock.knowledgegraph.distill",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 2000,
  },
  render(input: StockKnowledgeGraphDistillInput) {
    return [
      new SystemMessage(
        `你是一位专业的金融 NLP 文本分析与知识图谱蒸馏专家。
你的任务是从给定的美股隔夜海量新闻与快讯中，根据真实数据、新闻提及的事实与美股产业链常识，为目标股票列表 (${input.symbols.join(", ")}) 动态构建标准的金融语义知识图谱。

【蒸馏与建模铁律】：
1. 【动态提取实体 nodes】：识别主股票 (ROOT_STOCK)、供应商 (SUPPLIER)、客户 (CLIENT)、竞争对手 (COMPETITOR)、宏观环境 (MACRO) 与概念板块 (CONCEPT)。
2. 【构建语义三元组 edges】：提取方向性实体关系 (source, target, relation, impact: POSITIVE/NEGATIVE/NEUTRAL)。
3. 【数据真实性】：只提炼输入新闻和美股产业链真实包含的关系与事实，严禁凭空编造假信息，绝对禁止写死固定条件。`
      ),
      new HumanMessage(
        `【目标股票清单】：${input.symbols.join(", ")}

【海量美股原始新闻流】：
${input.rawNewsText}

请为以上每一只目标股票动态提炼并输出包含真实实体 nodes 和三元组 edges 的结构化知识图谱与新闻催化剂清单。`
      ),
    ];
  },
};

