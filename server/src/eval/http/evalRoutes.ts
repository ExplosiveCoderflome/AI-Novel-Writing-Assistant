import { Router, Request, Response } from "express";
import { prisma } from "../../db/prisma";
import { discoverAllModels } from "../services/modelDiscoveryService";
import { runEvaluationTask } from "../services/evalRunnerService";
import { applySmartModelRouting } from "../services/autoRoutingService";

export const evalRouter = Router();

// 1. 发现可用模型列表与硬件 Spec 探测
evalRouter.get("/models/discover", async (_req: Request, res: Response) => {
  try {
    const data = await discoverAllModels();
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || err });
  }
});

// 2. 查询基准测试集库
evalRouter.get("/benchmarks", async (req: Request, res: Response) => {
  try {
    const capability = typeof req.query.capability === "string" ? req.query.capability.trim() : undefined;
    const where: any = {};
    if (capability) {
      where.capability = capability;
    }
    const datasets = await prisma.modelEvalBenchmarkDataset.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return res.json({ success: true, data: datasets });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || err });
  }
});

// 3. 新增自定义基准测试用例
evalRouter.post("/benchmarks", async (req: Request, res: Response) => {
  try {
    const { capability, category, title, description, promptText, expectedOutput } = req.body || {};
    if (!title || !promptText || !capability) {
      return res.status(400).json({ success: false, error: "请提供模态类别(capability)、标题(title)与测试 Prompt(promptText)" });
    }

    const testCase = await prisma.modelEvalBenchmarkDataset.create({
      data: {
        capability: String(capability),
        category: category ? String(category) : "custom",
        title: String(title),
        description: description ? String(description) : null,
        promptText: String(promptText),
        expectedOutput: expectedOutput ? String(expectedOutput) : null,
        isBuiltin: false,
      },
    });

    return res.json({ success: true, data: testCase });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || err });
  }
});

// 4. 发起模型评估跑分任务
evalRouter.post("/run", async (req: Request, res: Response) => {
  try {
    const { taskName, capability, modelConfigs } = req.body || {};
    if (!capability || !Array.isArray(modelConfigs) || modelConfigs.length === 0) {
      return res.status(400).json({ success: false, error: "请提供评估模态类别与参评模型配置清单" });
    }

    const result = await runEvaluationTask({
      taskName: taskName ? String(taskName) : `基准评估-${capability}-${new Date().toLocaleTimeString("zh-CN")}`,
      capability: String(capability),
      modelConfigs,
    });

    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || err });
  }
});

// 5. 获取指定评估任务结果与仪表盘明细
evalRouter.get("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const idStr = String(req.params.id);
    const task = await prisma.modelEvalTask.findUnique({
      where: { id: idStr },
      include: { results: true },
    });

    if (!task) {
      return res.status(404).json({ success: false, error: "找不到指定的评估任务" });
    }

    return res.json({ success: true, data: task });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || err });
  }
});

// 6. 一键应用智能模型路由更新至系统设置
evalRouter.post("/apply-auto-routes", async (req: Request, res: Response) => {
  try {
    const targetProvider = typeof req.body?.targetProvider === "string" ? req.body.targetProvider : undefined;
    const targetModel = typeof req.body?.targetModel === "string" ? req.body.targetModel : undefined;
    const result = await applySmartModelRouting({ targetProvider, targetModel });
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || err });
  }
});
