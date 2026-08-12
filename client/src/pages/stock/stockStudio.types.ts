export interface ActionItem {
  action: "BUY" | "SELL" | "HOLD" | "TRIM";
  symbol: string;
  companyName?: string;
  suggestedShares: number;
  estimatedPrice: number;
  estimatedAmount: number;
  rationale: string;
  urgency: "HIGH" | "MEDIUM" | "LOW";
  // P&L KPI
  targetPrice?: number;
  stopLossPrice?: number;
  riskRewardRatio?: number;
  takeProfitPct?: number;
  stopLossPct?: number;
  projectedPnL?: number;
  projectedPnLPct?: number;
  timeHorizon?: string;
}

export interface PositionPnLItem {
  symbol: string;
  companyName?: string;
  shares: number;
  costBasis: number;
  currentPrice: number;
  marketValue: number;
  pnl: number;
  pnlPct: number;
  costValue: number;
  concentrationPct: number;
}

export interface TotalPnLState {
  totalMarketValue: number;
  totalCostBasis: number;
  totalPnL: number;
  totalPnLPct: number;
  cashBalance: number;
  netAssets: number;
  positions: PositionPnLItem[];
}

export interface RetroPnLState {
  accuracyScore: number;
  executionMatchRate: number;
  avoidedLoss: number;
  totalRealizedPnL: number;
  strategyDate: string;
}

export interface ProjectedPnLState {
  totalProjectedChange: number;
  byAction: Array<{
    symbol: string;
    action: string;
    projectedPnL: number;
    projectedPnLPct: number;
    targetPrice?: number;
    stopLossPrice?: number;
  }>;
}

export interface RiskAlert {
  level: "WARNING" | "CRITICAL" | "INFO";
  title: string;
  description: string;
  relatedSymbol?: string;
}

export interface KnowledgeGraphEntityNode {
  id: string;
  name: string;
  type: "ROOT_STOCK" | "SUPPLIER" | "CLIENT" | "COMPETITOR" | "MACRO" | "CONCEPT";
  marketSymbol?: string;
  impactScore?: number;
  description?: string;
}

export interface KnowledgeGraphRelationEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  weight?: number;
  description?: string;
}

export interface KnowledgeGraphTopology {
  nodes: KnowledgeGraphEntityNode[];
  edges: KnowledgeGraphRelationEdge[];
}
