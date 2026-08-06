import { z } from "zod";

// 单个持仓定义
export interface StockPositionItem {
  id?: string;
  symbol: string;         // 如 "NVDA", "AAPL"
  companyName?: string;
  shares: number;         // 持有股数
  costBasis: number;      // 持仓成本 ($)
  marketPrice?: number;   // 最新市价 ($)
  targetWeight?: number;  // 目标仓位比例 0.0 - 1.0
  notes?: string;
}

// 组合设置与资金定义
export interface StockPortfolioInput {
  name: string;
  sourceType: "MOOMOO" | "MANUAL" | "CSV_IMPORT";
  baseCurrency: string;
  totalBudget: number;      // 新增可动用预算 ($)
  cashBalance: number;      // 现有闲置现金 ($)
  riskPreference: "AGGRESSIVE" | "BALANCED" | "CONSERVATIVE";
  positions: StockPositionItem[];
}

// 单条调仓建议指令 (Advisory Only)
export interface StrategyActionItem {
  action: "BUY" | "SELL" | "HOLD" | "TRIM"; // 买入、全卖、持有、减仓
  symbol: string;
  companyName?: string;
  suggestedShares: number;       // 建议操作股数
  estimatedPrice: number;        // 参考评估股价 ($)
  estimatedAmount: number;       // 预计涉及金额 ($)
  rationale: string;             // 调仓逻辑依据
  urgency: "HIGH" | "MEDIUM" | "LOW";
}

export const StrategyActionItemSchema = z.object({
  action: z.enum(["BUY", "SELL", "HOLD", "TRIM"]),
  symbol: z.string(),
  companyName: z.string().optional(),
  suggestedShares: z.number(),
  estimatedPrice: z.number(),
  estimatedAmount: z.number(),
  rationale: z.string(),
  urgency: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

// 每日风控提示
export interface StrategyRiskAlert {
  level: "WARNING" | "CRITICAL" | "INFO";
  title: string;
  description: string;
  relatedSymbol?: string;
}

export const StrategyRiskAlertSchema = z.object({
  level: z.enum(["WARNING", "CRITICAL", "INFO"]),
  title: z.string(),
  description: z.string(),
  relatedSymbol: z.string().optional(),
});

// 单只股票知识图谱与互联网/OpenD资讯节点
export const StockKnowledgeGraphItemSchema = z.object({
  symbol: z.string(),
  companyName: z.string(),
  positionCategory: z.enum(["EXISTING", "NEW_DISCOVERY"]),
  industrySector: z.string(),
  newsCatalysts: z.array(z.string()).describe("互联网新闻与OpenD API资讯快讯"),
  knowledgeGraphNodes: z.array(
    z.object({
      relation: z.string(),
      targetNode: z.string(),
    })
  ),
  actionAdvice: z.enum(["BUY", "SELL", "HOLD", "TRIM"]),
  guidanceText: z.string().describe("增减仓或新建仓的具体策略研判"),
});

export type StockKnowledgeGraphItem = z.infer<typeof StockKnowledgeGraphItemSchema>;

// AI 调仓推演结构化输出 Schema
export const DailyAllocationOutputSchema = z.object({
  marketOverview: z.string().describe("隔夜美股宏观大盘与核心催化剂总结"),
  existingPositionGuidance: z.string().optional().describe("指南一：已有仓位增减诊断与调优策略"),
  newPositionGuidance: z.string().optional().describe("指南二：新仓位建立与自选风口挖潜策略"),
  retrospectiveGuidance: z.string().optional().describe("指南三：昨日指南与真实成交对比复盘及沉淀优化法则"),
  actions: z.array(StrategyActionItemSchema).describe("每日操盘买卖调仓指令建议列表 (仅供参考，非自动下单)"),
  riskAlerts: z.array(StrategyRiskAlertSchema).describe("集中度与止损风险提示"),
  knowledgeGraph: z.array(StockKnowledgeGraphItemSchema).optional().describe("基于各股票的知识图谱与新闻资讯关联"),
  institutionalReport: z.string().describe("专业机构投研视角报告 (包含财务因子、技术支点、宏观演绎)"),
  narrativeReport: z.string().describe("爽感战报降维解读 (将多空博弈、突破、渡劫等用极低认知负荷的叙事呈现)"),
});

export type DailyAllocationOutput = z.infer<typeof DailyAllocationOutputSchema>;
