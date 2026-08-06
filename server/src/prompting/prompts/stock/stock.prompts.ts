import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../core/promptTypes";
import { DailyAllocationOutputSchema, DailyAllocationOutput } from "../../../modules/stock/types/stockTypes";

export interface StockAllocationPromptInput {
  strategyDate: string;
  cashBalance: number;
  totalBudget: number;
  riskPreference: string;
  positionsJson: string;
  watchlistJson?: string;
  marketIntelContext: string;
}

export const stockAllocationPrompt: PromptAsset<StockAllocationPromptInput, DailyAllocationOutput> = {
  id: "stock.allocation.strategy",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  outputSchema: DailyAllocationOutputSchema,
  contextPolicy: {
    maxTokensBudget: 4000,
  },
  render(input: StockAllocationPromptInput) {
    return [
      new SystemMessage(
        `你是一位顶级华尔街量化投资经理与资深美股策略师。你的任务是根据用户的美股持仓、可用资金/预算、风险偏好以及隔夜美股宏观新闻，推演并给出每日仓位调整策略建议 (Daily Allocation Blueprint)。

【重要安全原则与写作要求】
1. 本指令仅为投资研究与调仓建议 (Advisory Only)，绝不会自动下单。请在输出中明确强调风险并给予稳健的专业理由。
2. 调仓指令必须严格考虑用户的闲置现金与新增预算上限，严禁建议超出可用资金的买入。
3. 检查单股集中度风险：若单只股票持仓占比超过总资产 30%，需在风控提示 (riskAlerts) 中醒目预警。
4. 【自选股优先法则】：在建议加仓或新建仓位 (BUY/TRIM) 时，【必须优先从【用户 MooMoo 自选关注股票池】中挑选】最具上涨潜力和隔夜催化剂的标的进行推荐，精准契合用户的个人研究与关注偏好！
5. 【数据真实性铁律】：AI 仅负责提供专业研判逻辑 (rationale) 与买卖方向决策 (action)，【严禁虚构或自行估计任何股价数字】！必须 100% 忠实于上下文中由 OpenD 实盘抓取的真实股价数据！
6. 【三大核心指南】必须结构化输出：
   - existingPositionGuidance：【指南一：已有仓位的增减】(针对用户 MooMoo 真实持仓进行集中度、盈亏状态与加减仓/止盈止损策略判定)；
   - newPositionGuidance：【指南二：新仓位的建立】(优先基于 MooMoo 自选池及行业风口，挖掘具备强催化剂的潜在新标的并分配新预算)；
   - retrospectiveGuidance：【指南三：昨日指南复盘与沉淀优化】(对比历史操盘策略与真实持仓成交追踪，归因损益并沉淀为长效交易纪律)；
7. 【每股知识图谱 knowledgeGraph】：为涉及的每一只核心股票构建包含产业链/基本面节点 (knowledgeGraphNodes)、互联网新闻与 OpenD 资讯快讯 (newsCatalysts)、所属分类 (EXISTING 或 NEW_DISCOVERY) 的知识图谱。
8. 策略解读 (narrativeReport)：采用清晰、严谨、条理分明且极具实操价值的专业金融研报结构。`
      ),
      new HumanMessage(
        `【日期】：${input.strategyDate}
【用户资金】：闲置现金 $${input.cashBalance} | 计划新增预算 $${input.totalBudget} | 风险偏好: ${input.riskPreference}
【当前 MooMoo 真实持仓】：
${input.positionsJson}

【⭐ 用户 MooMoo 自选关注股票池 (优先推荐池)】：
${input.watchlistJson || "暂无自选"}

【美股隔夜宏观与持仓/自选个股情报】：
${input.marketIntelContext}

请输出包含【指南一：已有仓位增减】、【指南二：新仓位建立】与【指南三：昨日指南复盘沉淀】的今日调仓建议清单、各股票知识图谱、风控警报与专业机构研报。`
      ),
    ];
  },
};
