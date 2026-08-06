-- Migration: stock_pnl_memory_governance
-- Add P&L KPI and memory governance fields to StockDailyStrategy

ALTER TABLE "StockDailyStrategy" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'FRESH';
ALTER TABLE "StockDailyStrategy" ADD COLUMN "positionDriftJson" TEXT;
ALTER TABLE "StockDailyStrategy" ADD COLUMN "previousStrategyId" TEXT;
ALTER TABLE "StockDailyStrategy" ADD COLUMN "projectedPnLJson" TEXT;
ALTER TABLE "StockDailyStrategy" ADD COLUMN "retroPnLJson" TEXT;
ALTER TABLE "StockDailyStrategy" ADD COLUMN "retroPnLScore" REAL;
ALTER TABLE "StockDailyStrategy" ADD COLUMN "compressedSummary" TEXT;
ALTER TABLE "StockDailyStrategy" ADD COLUMN "isArchived" INTEGER NOT NULL DEFAULT 0;

-- Create new index
CREATE INDEX IF NOT EXISTS "StockDailyStrategy_portfolioId_isArchived_idx" ON "StockDailyStrategy"("portfolioId", "isArchived");

-- Create StockPortfolioSnapshot table
CREATE TABLE IF NOT EXISTS "StockPortfolioSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "portfolioId" TEXT NOT NULL,
  "strategyId" TEXT,
  "snapshotDate" TEXT NOT NULL,
  "positionsJson" TEXT NOT NULL,
  "cashBalance" REAL NOT NULL,
  "totalMarketValue" REAL NOT NULL DEFAULT 0,
  "totalCostBasis" REAL NOT NULL DEFAULT 0,
  "totalPnL" REAL NOT NULL DEFAULT 0,
  "sourceType" TEXT NOT NULL DEFAULT 'OPEND',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "StockPortfolioSnapshot_portfolioId_snapshotDate_idx" ON "StockPortfolioSnapshot"("portfolioId", "snapshotDate");
CREATE INDEX IF NOT EXISTS "StockPortfolioSnapshot_portfolioId_strategyId_idx" ON "StockPortfolioSnapshot"("portfolioId", "strategyId");

-- Create StockTradingDiscipline table (Cold Memory)
CREATE TABLE IF NOT EXISTS "StockTradingDiscipline" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "portfolioId" TEXT NOT NULL,
  "disciplineText" TEXT NOT NULL,
  "relatedSymbol" TEXT,
  "pnlEvidence" REAL NOT NULL DEFAULT 0,
  "reinforceCount" INTEGER NOT NULL DEFAULT 1,
  "confidence" REAL NOT NULL DEFAULT 0.5,
  "lastReinforced" TEXT NOT NULL,
  "isPinned" INTEGER NOT NULL DEFAULT 0,
  "isDeprecated" INTEGER NOT NULL DEFAULT 0,
  "sourceStrategyId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "StockTradingDiscipline_portfolioId_relatedSymbol_idx" ON "StockTradingDiscipline"("portfolioId", "relatedSymbol");
CREATE INDEX IF NOT EXISTS "StockTradingDiscipline_portfolioId_isDeprecated_idx" ON "StockTradingDiscipline"("portfolioId", "isDeprecated");
