import { Router, Request, Response } from "express";
import crypto from "crypto";
import { openDaemonManager } from "../services/openDaemonManager";
import { moomooAdapter } from "../adapters/moomooAdapter";
import { dailyStrategyDirector } from "../services/dailyStrategyDirector";
import { prisma } from "../../../db/prisma";

export const stockRouter = Router();

// 1. 查询 MooMoo OpenD 状态 (若未连通则自动拉起)
stockRouter.get("/opend/status", async (_req: Request, res: Response) => {
  try {
    const status = await openDaemonManager.getStatus();
    if (!status.connected) {
      // 尝试后台唤醒
      await openDaemonManager.ensureOpenDRunning();
    }
    const updatedStatus = await openDaemonManager.getStatus();
    const unlockStatus = await moomooAdapter.checkTradeUnlockedStatus();
    return res.json({
      success: true,
      data: {
        ...updatedStatus,
        unlocked: unlockStatus.unlocked,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || err });
  }
});

// 2. 获取用户美股组合持仓
stockRouter.get("/portfolio", async (_req: Request, res: Response) => {
  try {
    let portfolio = await prisma.stockPortfolio.findFirst({
      include: { positions: true },
    });

    if (!portfolio) {
      // 创建初始演示 / 同步仓位
      const openDData = await moomooAdapter.fetchPortfolioFromOpenD();
      portfolio = await prisma.stockPortfolio.create({
        data: {
          name: "MooMoo 美股主仓位",
          cashBalance: openDData.cashBalance || 3500.0,
          totalBudget: 1000.0,
          riskPreference: "BALANCED",
          positions: {
            create: openDData.positions.map((p) => ({
              symbol: p.symbol,
              companyName: p.companyName,
              shares: p.shares,
              costBasis: p.costBasis,
              marketPrice: p.marketPrice,
              notes: p.notes,
            })),
          },
        },
        include: { positions: true },
      });
    }

    return res.json({ success: true, data: portfolio });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || err });
  }
});

// 3. 手动 / API 触发 MooMoo 同步并持久化落库
stockRouter.post("/portfolio/moomoo-sync", async (_req: Request, res: Response) => {
  try {
    const openDData = await moomooAdapter.fetchPortfolioFromOpenD();
    
    let portfolio = await prisma.stockPortfolio.findFirst({
      include: { positions: true },
    });

    if (!portfolio) {
      portfolio = await prisma.stockPortfolio.create({
        data: {
          name: "MooMoo 美股主仓位",
          cashBalance: openDData.cashBalance,
          totalBudget: 1000.0,
          riskPreference: "BALANCED",
          positions: {
            create: openDData.positions.map((p) => ({
              symbol: p.symbol,
              companyName: p.companyName,
              shares: p.shares,
              costBasis: p.costBasis,
              marketPrice: p.marketPrice,
              notes: p.notes,
            })),
          },
        },
        include: { positions: true },
      });
    } else {
      const hasRealPositions = openDData.positions && openDData.positions.length > 0;

      if (hasRealPositions) {
        await prisma.stockPosition.deleteMany({
          where: { portfolioId: portfolio.id },
        });
      }

      portfolio = await prisma.stockPortfolio.update({
        where: { id: portfolio.id },
        data: {
          cashBalance: hasRealPositions ? openDData.cashBalance : portfolio.cashBalance,
          sourceType: "MOOMOO",
          ...(hasRealPositions
            ? {
                positions: {
                  create: openDData.positions.map((p) => ({
                    symbol: p.symbol,
                    companyName: p.companyName,
                    shares: p.shares,
                    costBasis: p.costBasis,
                    marketPrice: p.marketPrice,
                    notes: p.notes,
                  })),
                },
              }
            : {}),
        },
        include: { positions: true },
      });
    }

    return res.json({ success: true, data: portfolio });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || err });
  }
});

// 3.5 智能粘贴解析从 MooMoo 客户端复制的持仓与资金文本
stockRouter.post("/portfolio/parse-import", async (req: Request, res: Response) => {
  try {
    const { rawText } = req.body || {};
    if (!rawText || typeof rawText !== "string") {
      return res.status(400).json({ success: false, error: "请提供 MooMoo 粘贴文本内容" });
    }

    const parsed = moomooAdapter.parsePositionsFromCsvOrText(rawText);
    
    let portfolio = await prisma.stockPortfolio.findFirst({
      include: { positions: true },
    });

    const targetCash = parsed.detectedCash !== undefined ? parsed.detectedCash : (portfolio?.cashBalance || 3500);

    if (!portfolio) {
      portfolio = await prisma.stockPortfolio.create({
        data: {
          name: "MooMoo 美股主仓位",
          cashBalance: targetCash,
          totalBudget: 1000.0,
          riskPreference: "BALANCED",
          positions: {
            create: parsed.positions.map((p) => ({
              symbol: p.symbol,
              companyName: p.companyName || p.symbol,
              shares: p.shares,
              costBasis: p.costBasis,
              marketPrice: p.marketPrice || p.costBasis,
            })),
          },
        },
        include: { positions: true },
      });
    } else {
      await prisma.stockPosition.deleteMany({
        where: { portfolioId: portfolio.id },
      });

      portfolio = await prisma.stockPortfolio.update({
        where: { id: portfolio.id },
        data: {
          cashBalance: targetCash,
          sourceType: "PASTE_IMPORT",
          positions: {
            create: parsed.positions.map((p) => ({
              symbol: p.symbol,
              companyName: p.companyName || p.symbol,
              shares: p.shares,
              costBasis: p.costBasis,
              marketPrice: p.marketPrice || p.costBasis,
            })),
          },
        },
        include: { positions: true },
      });
    }

    return res.json({ success: true, data: portfolio, count: parsed.positions.length });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || err });
  }
});

// 3.6 获取实时美股与标的公开行情 (无敏感权限，开放查询)
stockRouter.get("/market-quotes", async (_req: Request, res: Response) => {
  try {
    const quotes = await moomooAdapter.fetchMarketQuotes();
    return res.json({ success: true, data: quotes });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || err });
  }
});

// 3.65 从 OpenD 实时拉取用户的 MooMoo 自选关注股票列表 (无须交易密码)
stockRouter.get("/watchlist", async (_req: Request, res: Response) => {
  try {
    const list = await moomooAdapter.fetchWatchlistFromOpenD();
    return res.json({ success: true, data: list });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || err });
  }
});

// 3.7 解锁 MooMoo 交易密码获得持仓与资金调取权限
stockRouter.post("/unlock-trade", async (req: Request, res: Response) => {
  try {
    const { password } = req.body || {};
    if (!password) {
      return res.status(400).json({ success: false, error: "请提供交易密码" });
    }

    // 转化为 32 位小写 MD5
    const pwdMD5 = crypto.createHash("md5").update(password).digest("hex");
    const unlockRes = await moomooAdapter.unlockTrade(pwdMD5);

    if (unlockRes.success) {
      // 解锁成功后自动同步并返回最新持仓
      const openDData = await moomooAdapter.fetchPortfolioFromOpenD();
      let portfolio = await prisma.stockPortfolio.findFirst({
        include: { positions: true },
      });

      if (portfolio && openDData.positions.length > 0) {
        await prisma.stockPosition.deleteMany({
          where: { portfolioId: portfolio.id },
        });

        portfolio = await prisma.stockPortfolio.update({
          where: { id: portfolio.id },
          data: {
            cashBalance: openDData.cashBalance,
            sourceType: "MOOMOO_UNLOCKED",
            positions: {
              create: openDData.positions.map((p) => ({
                symbol: p.symbol,
                companyName: p.companyName,
                shares: p.shares,
                costBasis: p.costBasis,
                marketPrice: p.marketPrice,
              })),
            },
          },
          include: { positions: true },
        });
      }

      return res.json({ success: true, message: unlockRes.message, data: portfolio });
    } else {
      return res.status(400).json({ success: false, error: unlockRes.message });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || err });
  }
});
stockRouter.post("/daily-strategy/generate", async (req: Request, res: Response) => {
  try {
    const { portfolioId, customBudget } = req.body || {};
    let targetPortfolioId = portfolioId;

    if (!targetPortfolioId) {
      const first = await prisma.stockPortfolio.findFirst();
      if (first) {
        targetPortfolioId = first.id;
      } else {
        // 先初始化
        const openDData = await moomooAdapter.fetchPortfolioFromOpenD();
        const created = await prisma.stockPortfolio.create({
          data: {
            name: "MooMoo 美股主仓位",
            cashBalance: openDData.cashBalance || 3500.0,
            totalBudget: customBudget || 1000.0,
            riskPreference: "BALANCED",
            positions: {
              create: openDData.positions.map((p) => ({
                symbol: p.symbol,
                companyName: p.companyName,
                shares: p.shares,
                costBasis: p.costBasis,
                marketPrice: p.marketPrice,
                notes: p.notes,
              })),
            },
          },
        });
        targetPortfolioId = created.id;
      }
    }

    const result = await dailyStrategyDirector.generateDailyStrategy(
      targetPortfolioId,
      customBudget ? Number(customBudget) : undefined
    );

    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || err });
  }
});

// 5. 更新用户自定义持仓与资金
stockRouter.post("/portfolio/update", async (req: Request, res: Response) => {
  try {
    const { cashBalance, positions } = req.body || {};
    let portfolio = await prisma.stockPortfolio.findFirst({
      include: { positions: true },
    });

    if (!portfolio) {
      portfolio = await prisma.stockPortfolio.create({
        data: {
          name: "MooMoo 美股主仓位",
          cashBalance: Number(cashBalance) || 0,
          totalBudget: 1000.0,
          riskPreference: "BALANCED",
          positions: {
            create: (positions || []).map((p: any) => ({
              symbol: p.symbol?.toUpperCase(),
              companyName: p.companyName || p.symbol,
              shares: Number(p.shares) || 0,
              costBasis: Number(p.costBasis) || 0,
              marketPrice: Number(p.marketPrice || p.costBasis) || 0,
            })),
          },
        },
        include: { positions: true },
      });
    } else {
      await prisma.stockPosition.deleteMany({
        where: { portfolioId: portfolio.id },
      });

      portfolio = await prisma.stockPortfolio.update({
        where: { id: portfolio.id },
        data: {
          cashBalance: Number(cashBalance) || 0,
          positions: {
            create: (positions || []).map((p: any) => ({
              symbol: p.symbol?.toUpperCase(),
              companyName: p.companyName || p.symbol,
              shares: Number(p.shares) || 0,
              costBasis: Number(p.costBasis) || 0,
              marketPrice: Number(p.marketPrice || p.costBasis) || 0,
            })),
          },
        },
        include: { positions: true },
      });
    }

    return res.json({ success: true, data: portfolio });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || err });
  }
});
stockRouter.get("/daily-strategy/latest", async (_req: Request, res: Response) => {
  try {
    const latest = await prisma.stockDailyStrategy.findFirst({
      orderBy: { createdAt: "desc" },
    });

    if (!latest) {
      return res.json({ success: true, data: null });
    }

    return res.json({
      success: true,
      data: {
        ...latest,
        actions: JSON.parse(latest.actionsJson || "[]"),
        riskAlerts: JSON.parse(latest.riskAlertsJson || "[]"),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || err });
  }
});
