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
6. 策略解读 (narrativeReport)：采用清晰、严谨、条理分明且极具实操价值的专业金融研报结构，禁止使用任何修仙、游戏、魔法或玄幻比喻。
请包含以下四个结构化段落：
【持仓健康诊断】：(评估当前持仓集中度、风险分散度与资产配置结构)
【大盘与催化剂点评】：(分析隔夜美股宏观数据、联储动态及持仓与自选股最新催化剂)
【核心个股归因分析】：(逐一分析持仓及自选个股的估值、关键支撑/阻力位及走势)
【今日调仓与资金策略】：(给出具体的建仓/加仓/减仓/现金留存操作建议与风控防线)`
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

请进行全面的持仓健康度诊断与隔夜催化剂分析，优先基于用户的自选关注池输出今日开盘前的调仓建议清单、风控警报与专业机构研报。`
      ),
    ];
  },
};

