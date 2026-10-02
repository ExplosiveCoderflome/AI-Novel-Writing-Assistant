import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { DirectorRunNotFoundError, type CommandService, type DirectorCommand, type EventLog, type ProjectionService, type RunRepository } from "../application";

export interface DirectorNextHttpDeps {
  commandService: Pick<CommandService, "execute">;
  projectionService: Pick<ProjectionService, "get">;
  runRepository: Pick<RunRepository, "findActiveRunIdByNovel" | "listRunIds">;
  eventLog: Pick<EventLog, "list">;
}

const nonEmpty = z.string().trim().min(1);
const expectedVersion = z.number().int().nonnegative();

const commandBodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("open_run"),
    novelId: nonEmpty,
    driver: z.enum(["auto", "assisted"]),
    stepIdsInScope: z.array(nonEmpty).nullable(),
    launchInput: z.object({
      storyInput: nonEmpty,
      estimatedChapterCount: z.number().int().positive(),
      temperature: z.number().min(0).max(2).optional(),
      worldMode: z.enum(["generate", "reuse", "skip"]),
      targetVolumeId: nonEmpty.nullable().optional(),
      targetMode: z.enum(["opening", "selected_volume"]).optional(),
      provider: nonEmpty.optional(),
      model: nonEmpty.optional(),
      executionRange: z.object({from: z.number().int().positive(), to: z.number().int().positive()})
        .refine(range => range.to >= range.from).optional(),
      issuePolicyMode: z.enum(["completion_first", "quality_first"]).optional(),
    }).optional(),
    idempotencyKey: nonEmpty,
  }),
  z.object({
    type: z.literal("resolve_gate"),
    runId: nonEmpty,
    decision: z.enum(["confirm", "confirm_after_edit", "regenerate"]),
    expectedVersion,
    idempotencyKey: nonEmpty,
  }),
  z.object({ type: z.literal("resume"), runId: nonEmpty, expectedVersion, idempotencyKey: nonEmpty }),
  z.object({
    type: z.literal("handoff"),
    runId: nonEmpty,
    toDriver: z.enum(["auto", "assisted"]),
    expectedVersion,
    idempotencyKey: nonEmpty,
  }),
  z.object({ type: z.literal("cancel"), runId: nonEmpty, expectedVersion, idempotencyKey: nonEmpty }),
]);

const querySchema = z.object({
  needsAttention: z.preprocess(
    (value) => (value === "true" ? true : value === "false" ? false : value),
    z.boolean().optional(),
  ),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

function sendValidationError(res: Response, error: z.ZodError): void {
  void error;
  res.status(400).json({ success: false, error: "请求参数校验失败。", message: "请检查请求参数后重试。" });
}

function sendKnownError(res: Response, error: unknown): boolean {
  if (error instanceof DirectorRunNotFoundError) {
    res.status(404).json({ success: false, error: "找不到对应的创作记录。" });
    return true;
  }
  if (error && typeof error === "object" && "statusCode" in error) {
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === "number" && Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 500) {
      res.status(statusCode).json({ success: false, error: error instanceof Error ? error.message : "请求无法处理。" });
      return true;
    }
  }
  return false;
}

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void handler(req, res, next).catch(next);
  };
}

export function createDirectorNextRouter(deps: DirectorNextHttpDeps): Router {
  const router = Router();

  router.post("/commands", asyncRoute(async (req, res) => {
    const parsed = commandBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }
    try {
      const result = await deps.commandService.execute(parsed.data as DirectorCommand);
      res.status(202).json({
        success: true,
        data: { runId: result.runId, controlVersion: result.controlVersion },
        message: "创作命令已接收。",
      });
    } catch (error) {
      if (!sendKnownError(res, error)) throw error;
    }
  }));

  router.get("/novels/:novelId/current", asyncRoute(async (req, res) => {
    const novelId = nonEmpty.safeParse(req.params.novelId);
    if (!novelId.success) {
      sendValidationError(res, novelId.error);
      return;
    }
    const activeRunId = await deps.runRepository.findActiveRunIdByNovel(novelId.data);
    const runId = activeRunId ?? (await deps.runRepository.listRunIds({ novelId: novelId.data, limit: 1 }))[0];
    if (!runId) {
      res.status(404).json({ success: false, error: "这本小说没有创作记录。" });
      return;
    }
    try {
      const data = await deps.projectionService.get(runId);
      res.json({ success: true, data, message: "当前创作已加载。" });
    } catch (error) {
      if (!sendKnownError(res, error)) throw error;
    }
  }));

  router.get("/runs/:runId", asyncRoute(async (req, res) => {
    const runId = nonEmpty.safeParse(req.params.runId);
    if (!runId.success) {
      sendValidationError(res, runId.error);
      return;
    }
    try {
      const [data, timeline] = await Promise.all([
        deps.projectionService.get(runId.data),
        deps.eventLog.list(runId.data),
      ]);
      res.json({ success: true, data: { ...data, timeline }, message: "创作记录已加载。" });
    } catch (error) {
      if (!sendKnownError(res, error)) throw error;
    }
  }));

  router.get("/runs", asyncRoute(async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }
    const runIds = await deps.runRepository.listRunIds(parsed.data);
    const data = await Promise.all(runIds.map((runId) => deps.projectionService.get(runId)));
    res.json({ success: true, data, message: "创作记录已加载。" });
  }));

  router.get("/records", asyncRoute(async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) { sendValidationError(res, parsed.error); return; }
    const runIds = await deps.runRepository.listRunIds(parsed.data);
    const labels = { queued: "等待开始", running: "推进中", waiting_gate: "等待确认", paused: "暂停中", completed: "已完成", failed: "中断", cancelled: "已取消" };
    const data = await Promise.all(runIds.map(async (runId) => {
      const view = await deps.projectionService.get(runId);
      return {
        runId, novelId: view.novelId, statusLabel: labels[view.mode], headline: view.headline,
        detail: view.detail, progressLabel: `${view.progress.done}/${view.progress.total} 个阶段完成`,
        sourceRoute: view.sourceRoute, directorRoute: `/lab/director/${encodeURIComponent(view.novelId)}`,
      };
    }));
    res.json({ success: true, data });
  }));

  return router;
}
