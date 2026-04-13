import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { AgentRunDetail, ReplayRequest } from "@ai-novel/shared/types/agent";
import type { TaskStatus } from "@ai-novel/shared/types/task";
import { z } from "zod";
import { agentRuntime } from "../agents";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { buildTaskRecoveryHint, normalizeFailureSummary } from "../services/task/taskSupport";

const router = Router();

const listQuerySchema = z.object({
  status: z.enum(["queued", "running", "waiting_approval", "succeeded", "failed", "cancelled"]).optional(),
  novelId: z.string().trim().optional(),
  sessionId: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const runIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const approvalParamsSchema = z.object({
  id: z.string().trim().min(1),
  approvalId: z.string().trim().min(1),
});

const approvalBodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(2000).optional(),
});

const replayBodySchema = z.object({
  fromStepId: z.string().trim().min(1),
  mode: z.enum(["continue", "dry_run"]).optional(),
  note: z.string().trim().max(2000).optional(),
});

function enrichRunDetail(detail: AgentRunDetail): AgentRunDetail {
  const failedStep = [...detail.steps].reverse().find((step) => step.status === "failed");
  const failureSummary = detail.run.status === "failed"
    ? normalizeFailureSummary(detail.run.error ?? failedStep?.error, "运行失败，但没有记录明确错误。")
    : detail.run.status === "waiting_approval"
      ? "当前运行在等待审批。"
      : detail.run.error ?? null;
  return {
    ...detail,
    diagnostics: {
      failureCode: failedStep?.errorCode ?? null,
      failureSummary,
      failureDetails: failedStep?.error ?? detail.run.error ?? null,
      recoveryHint: buildTaskRecoveryHint("agent_run", detail.run.status as TaskStatus),
    },
    sourceResource: detail.run.novelId
      ? {
        type: "novel",
        id: detail.run.novelId,
        label: `小说 ${detail.run.novelId}`,
        route: `/novels/${detail.run.novelId}/edit`,
      }
      : {
        type: "agent_run",
        id: detail.run.id,
        label: "全局运行",
        route: `/creative-hub?runId=${detail.run.id}`,
      },
    targetResources: detail.run.chapterId
      ? [{
        type: "chapter",
        id: detail.run.chapterId,
        label: detail.run.currentStep ?? "章节目标",
        route: detail.run.novelId ? `/novels/${detail.run.novelId}/edit` : `/creative-hub?runId=${detail.run.id}`,
      }]
      : [],
  };
}

router.use(authMiddleware);

router.get("/", validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const data = await agentRuntime.listRuns({
      status: query.status,
      novelId: query.novelId,
      sessionId: query.sessionId,
      limit: query.limit,
    });
    res.status(200).json({
      success: true,
      data,
      message: "Agent runs loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", validate({ params: runIdParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof runIdParamsSchema>;
    const raw = await agentRuntime.getRunDetail(id);
    const data = raw ? enrichRunDetail(raw) : null;
    if (!data) {
      res.status(404).json({
        success: false,
        error: "Agent run not found.",
      } satisfies ApiResponse<null>);
      return;
    }
    res.status(200).json({
      success: true,
      data,
      message: "Agent run loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:id/approvals/:approvalId",
  validate({ params: approvalParamsSchema, body: approvalBodySchema }),
  async (req, res, next) => {
    try {
      const { id, approvalId } = req.params as z.infer<typeof approvalParamsSchema>;
      const body = req.body as z.infer<typeof approvalBodySchema>;
      const data = await agentRuntime.resolveApproval({
        runId: id,
        approvalId,
        action: body.action,
        note: body.note,
      });
      res.status(200).json({
        success: true,
        data,
        message: body.action === "approve" ? "Approval accepted." : "Approval rejected.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/replay",
  validate({ params: runIdParamsSchema, body: replayBodySchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof runIdParamsSchema>;
      const body = req.body as z.infer<typeof replayBodySchema>;
      const data = await agentRuntime.replayFromStep(id, body as ReplayRequest);
      res.status(200).json({
        success: true,
        data,
        message: "Replay started.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
