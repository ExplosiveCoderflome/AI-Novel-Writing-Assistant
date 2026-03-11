import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { ReplayRequest } from "@ai-novel/shared/types/agent";
import { z } from "zod";
import { agentRuntime } from "../agents";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";

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
    const data = await agentRuntime.getRunDetail(id);
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
