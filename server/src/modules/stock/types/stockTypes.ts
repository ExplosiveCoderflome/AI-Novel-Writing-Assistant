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

// AI 调仓推演结构化输出 Schema
export const DailyAllocationOutputSchema = z.object({
  marketOverview: z.string().describe("隔夜美股宏观大盘与核心催化剂总结"),
  actions: z.array(StrategyActionItemSchema).describe("每日操盘买卖调仓指令建议列表 (仅供参考，非自动下单)"),
  riskAlerts: z.array(StrategyRiskAlertSchema).describe("集中度与止损风险提示"),
  institutionalReport: z.string().describe("专业机构投研视角报告 (包含财务因子、技术支点、宏观演绎)"),
  narrativeReport: z.string().describe("爽感战报降维解读 (将多空博弈、突破、渡劫等用极低认知负荷的叙事呈现)"),
});

export type DailyAllocationOutput = z.infer<typeof DailyAllocationOutputSchema>;
