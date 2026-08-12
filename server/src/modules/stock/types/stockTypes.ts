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

export interface RetrospectiveEvaluationResult {
  executionMatchRate: number;
  followedActionsCount: number;
  totalActionsCount: number;
  avoidedLossAmount: number;
  distilledDisciplines: string[];
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
  estimatedPrice: number;        // 参考评估股价 ($) — 由 OpenD 硬锁定
  estimatedAmount: number;       // 预计涉及金额 ($)
  rationale: string;             // 调仓逻辑依据
  urgency: "HIGH" | "MEDIUM" | "LOW";
  // === P&L KPI 字段 ===
  targetPrice?: number;          // AI 预期止盈目标价 ($)
  stopLossPrice?: number;        // 止损警戒价位 ($)
  riskRewardRatio?: number;      // 盈亏比 (Risk-Reward Ratio, 如 2.4)
  takeProfitPct?: number;        // 预期止盈收益比例 (%)
  stopLossPct?: number;          // 最大止损风险比例 (%)
  projectedPnL?: number;         // 执行此建议预期盈亏 ($)
  projectedPnLPct?: number;      // 预期盈亏百分比
  timeHorizon?: string;                             // 预期实现周期
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
  // P&L KPI
  targetPrice: z.number().optional().describe("执行此建议后 AI 预期达到的止盈目标价格 ($)"),
  stopLossPrice: z.number().optional().describe("止损警戒价位 ($)"),
  riskRewardRatio: z.number().optional().describe("盈亏比 (Target-Price Surplus / Stop-Loss Margin)"),
  takeProfitPct: z.number().optional().describe("预期止盈收益空间比例 (%)"),
  stopLossPct: z.number().optional().describe("最大止损下行风险比例 (%)"),
  projectedPnL: z.number().optional().describe("执行此建议预期盈亏 ($), 正数=盈利, 负数=止损"),
  projectedPnLPct: z.number().optional().describe("预期盈亏百分比"),
  timeHorizon: z.string().optional().describe("预期实现周期"),
});


// 每日风控提示
export interface StrategyRiskAlert {
  level: "WARNING" | "CRITICAL" | "INFO";
  title: string;
  description: string;
  relatedSymbol?: string;
}

export const StrategyRiskAlertSchema = z.object({
  level: z.string(),
  title: z.string(),
  description: z.string(),
  relatedSymbol: z.string().optional(),
});

// 单只股票知识图谱与互联网/OpenD资讯节点
// 真正的金融语义知识图谱三元组数据结构 (Entity-Relation-Entity Triple Graph)
export interface KnowledgeGraphEntityNode {
  id: string;                                           // 实体 ID (如 "AAPL", "TSMC", "FED_RATE")
  name: string;                                         // 实体显示名 (如 "苹果公司", "台积电", "美联储利率")
  type: string;                                         // 实体类型
  marketSymbol?: string | null;                         // 若为美股则带股票代码
  description?: string;                                 // 实体描述
}

export interface KnowledgeGraphRelationEdge {
  source: string;                                       // 源实体 ID (E1)
  target: string;                                       // 目标实体 ID (E2)
  relation: string;                                     // 关系谓词 (如 "晶圆代工依赖", "同业芯片竞争", "云端算力采购")
  impact: string;                                       // 传导影响方向
}

export interface StockKnowledgeGraphItem {
  symbol: string;
  companyName: string;
  positionCategory: string;
  industrySector: string;
  nodes: KnowledgeGraphEntityNode[];                    // 多实体节点集
  edges: KnowledgeGraphRelationEdge[];                  // 实体间关系边集
  newsCatalysts: string[];
  actionAdvice: string;
  guidanceText: string;
}

export const StockKnowledgeGraphItemSchema = z.object({
  symbol: z.string(),
  companyName: z.string(),
  positionCategory: z.string(),
  industrySector: z.string(),
  nodes: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    marketSymbol: z.string().nullable().optional(),
    description: z.string().optional(),
  })),
  edges: z.array(z.object({
    source: z.string(),
    target: z.string(),
    relation: z.string(),
    impact: z.string(),
  })),
  newsCatalysts: z.array(z.string()).describe("互联网新闻与OpenD API资讯快讯"),
  actionAdvice: z.string(),
  guidanceText: z.string().describe("增减仓或新建仓的具体策略研判"),
});

// AI 调仓推演结构化输出 Schema
export const DailyAllocationOutputSchema = z.object({
  marketOverview: z.string().describe("隔夜美股宏观大盘与核心催化剂总结"),
  existingPositionGuidance: z.string().optional().describe("指南一：已有仓位增减诊断与调优策略"),
  newPositionGuidance: z.string().optional().describe("指南二：新仓位建立与自选风口挖潜策略"),
  retrospectiveGuidance: z.string().optional().describe("指南三：昨日指南与真实成交对比复盘及沉淀优化法则 — 必须包含具体 P&L 归因数字"),
  actions: z.array(StrategyActionItemSchema).describe("每日操盘买卖调仓指令建议列表 (仅供参考，非自动下单)，每条必须包含 targetPrice, stopLossPrice, projectedPnL"),
  riskAlerts: z.array(StrategyRiskAlertSchema).describe("集中度与止损风险提示"),
  knowledgeGraph: z.array(StockKnowledgeGraphItemSchema).optional().describe("基于各股票的知识图谱与新闻资讯关联"),
  institutionalReport: z.string().describe("专业机构投研视角报告 (包含财务因子、技术支点、宏观演绎)"),
  narrativeReport: z.string().describe("爽感战报降维解读 (将多空博弈、突破、渡劫等用极低认知负荷的叙事呼现)"),
});

export type DailyAllocationOutput = z.infer<typeof DailyAllocationOutputSchema>;

// =========================================================
// P&L KPI 计算结果接口
// =========================================================

/** 每名持仓的实时盈亏 */
export interface PositionPnLItem {
  symbol: string;
  companyName?: string;
  shares: number;
  costBasis: number;         // 成本价
  currentPrice: number;      // 实时现价
  marketValue: number;       // 持仓市值
  pnl: number;               // 浮盈 = (currentPrice - costBasis) * shares
  pnlPct: number;            // 盈亏百分比
  costValue: number;         // 成本总价值 = costBasis * shares
  concentrationPct: number;  // 占总资产比例
}

/** 组合当前汇总盈亏 */
export interface TotalPnLSummary {
  totalMarketValue: number;   // 总市值
  totalCostBasis: number;     // 总成本
  totalPnL: number;           // 总浮盈
  totalPnLPct: number;        // 总盈亏百分比
  cashBalance: number;        // 闲置现金
  netAssets: number;          // 净资产 = totalMarketValue + cashBalance
  positions: PositionPnLItem[];
}

/** 指南预期 P&L（如果完整按指南执行，预期组合资产变化） */
export interface ProjectedPnLSummary {
  totalProjectedChange: number;   // 按指南全部执行后预期盈亏变化总量
  byAction: Array<{
    symbol: string;
    action: string;
    projectedPnL: number;
    projectedPnLPct: number;
    targetPrice?: number;
    stopLossPrice?: number;
    timeHorizon?: string;
  }>;
}

/** 持仓变化检测结果 */
export interface PositionChange {
  symbol: string;
  type: "ADDED" | "REMOVED" | "INCREASED" | "DECREASED";
  oldShares?: number;
  newShares?: number;
  sharesDelta?: number;
  currentPrice?: number;   // OpenD 实时价
  estimatedTradeValue?: number; // 估算成交金额
}

export interface DriftResult {
  hasChanges: boolean;
  changes: PositionChange[];
  cashDelta: number;
  summary: string;  // 人类可读的变化摘要
}

/** 复盘实现 P&L 归因 */
export interface RetroPnLResult {
  strategyId: string;
  strategyDate: string;
  accuracyScore: number;        // 0-100 分，指南质量得分
  executionMatchRate: number;   // 跨单率 0.0-1.0
  followedActions: Array<{
    symbol: string;
    action: string;
    guidePrice: number;
    executedAt?: number;  // 实际成交均价（通过持仓变化推断）
    realizedPnL: number;  // 实现盈亏
    vsGuidePnL: number;   // vs 指南预期 P&L 的差异
  }>;
  missedActions: Array<{
    symbol: string;
    action: string;
    guidePrice: number;
    currentPrice: number;
    opportunityCost: number;  // 错过的潜在收益 (负数=就要交在自己手里)
  }>;
  avoidedLoss: number;         // 避免损失合计 ($)
  totalRealizedPnL: number;    // 已实现 P&L ($)
  distilledDisciplines: string[]; // 本次复盘提炼的纪律
}

// 实时推演进度中间状态阶段定义 (SSE / Progressive Ticker)
export interface StrategyProgressStage {
  step: number;               // 1..6
  totalSteps: number;         // 6
  stageId:
    | "OPEND_CONNECT"
    | "QUOTES_FETCH"
    | "NEWS_SEARCH"
    | "CONTEXT_ASSEMBLE"
    | "AI_DEDUCTION"
    | "GUARDRAIL_CALIBRATE"
    | "FINISHED";
  title: string;              // 阶段标题 (如 "连接 OpenD 盘口守护进程")
  detail: string;             // 阶段实时明细日志
  progressPercent: number;    // 0..100
  timestamp: string;          // ISO 时间戳
}
