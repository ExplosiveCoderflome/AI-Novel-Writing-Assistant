import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { authMiddleware } from "../middleware/auth";
import { diagnosticCleanupService } from "../services/diagnosticCleanupService";
import type { DiagnosticCleanupResult } from "../services/diagnosticCleanupService";

const router = Router();

router.use(authMiddleware);

router.post("/cleanup-diagnostics", async (_req, res, next) => {
  try {
    const result = await diagnosticCleanupService.runCleanup();
    const response: ApiResponse<DiagnosticCleanupResult> = {
      success: true,
      data: result,
      message: `清理完成：删除 ${result.deletedDiagnostics} 条诊断记录，${result.deletedExecutionLogs} 条执行日志。`,
    };
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
