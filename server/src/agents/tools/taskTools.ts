import { z } from "zod";
import { prisma } from "../../db/prisma";
import { taskCenterService } from "../../services/task/TaskCenterService";
import { buildTaskRecoveryHint, normalizeFailureSummary } from "../../services/task/taskSupport";
import { AgentToolError, type AgentToolName } from "../types";
import type { AgentToolDefinition } from "./toolTypes";

const taskKindSchema = z.enum(["book_analysis", "novel_pipeline", "image_generation", "agent_run"]);
const taskStatusSchema = z.enum(["queued", "running", "waiting_approval", "succeeded", "failed", "cancelled"]);

const listTasksInput = z.object({
  kind: taskKindSchema.optional(),
  status: taskStatusSchema.optional(),
  keyword: z.string().trim().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const taskSummarySchema = z.object({
  id: z.string(),
  kind: taskKindSchema,
  title: z.string(),
  status: taskStatusSchema,
  progress: z.number(),
  currentStage: z.string().nullable(),
  ownerLabel: z.string(),
  failureSummary: z.string().nullable(),
  recoveryHint: z.string().nullable(),
});

const listTasksOutput = z.object({
  items: z.array(taskSummarySchema),
  summary: z.string(),
});

const taskIdentityInput = z.object({
  kind: taskKindSchema,
  id: z.string().trim().min(1),
});

const getTaskDetailOutput = z.object({
  id: z.string(),
  kind: taskKindSchema,
  title: z.string(),
  status: taskStatusSchema,
  currentStage: z.string().nullable(),
  ownerLabel: z.string(),
  sourceRoute: z.string(),
  failureSummary: z.string().nullable(),
  failureDetails: z.string().nullable(),
  recoveryHint: z.string().nullable(),
  summary: z.string(),
});

const getTaskFailureReasonOutput = z.object({
  kind: taskKindSchema,
  id: z.string(),
  status: taskStatusSchema,
  failureSummary: z.string(),
  failureDetails: z.string().nullable(),
  recoveryHint: z.string(),
  summary: z.string(),
});

const getRunFailureReasonInput = z.object({
  runId: z.string().trim().min(1),
});

const getRunFailureReasonOutput = z.object({
  runId: z.string(),
  status: taskStatusSchema,
  failureSummary: z.string(),
  failureDetails: z.string().nullable(),
  recoveryHint: z.string(),
  lastFailedStep: z.string().nullable(),
  summary: z.string(),
});

const taskMutationOutput = z.object({
  kind: taskKindSchema,
  id: z.string(),
  status: taskStatusSchema,
  summary: z.string(),
});

const explainGenerationBlockerInput = z.object({
  novelId: z.string().trim().min(1),
  chapterOrder: z.number().int().min(1).optional(),
  runId: z.string().trim().optional(),
});

const explainGenerationBlockerOutput = z.object({
  novelId: z.string(),
  chapterOrder: z.number().int().nullable(),
  blockerType: z.enum(["pipeline_failed", "pipeline_running", "pipeline_waiting", "agent_run", "none"]),
  status: z.string().nullable(),
  failureSummary: z.string(),
  failureDetails: z.string().nullable(),
  recoveryHint: z.string(),
  summary: z.string(),
});

export const taskToolDefinitions: Partial<
  Record<AgentToolName, AgentToolDefinition<Record<string, unknown>, Record<string, unknown>>>
> = {
  list_tasks: {
    name: "list_tasks",
    title: "列出系统任务",
    description: "读取任务中心的统一任务列表、状态和恢复提示。",
    category: "read",
    riskLevel: "low",
    domainAgent: "Coordinator",
    resourceScopes: ["task", "agent_run", "generation_job"],
    parserHints: {
      intent: "query_task_status",
      aliases: ["任务列表", "系统任务", "tasks"],
      phrases: ["列出当前系统任务状态", "系统现在有哪些任务", "查看任务中心状态"],
      requiresNovelContext: false,
      whenToUse: "用户在查询任务中心、系统任务状态或任务列表。",
      whenNotToUse: "用户是在追问某本小说的生产进度，这更接近 query_novel_production_status。",
    },
    inputSchema: listTasksInput,
    outputSchema: listTasksOutput,
    execute: async (_context, rawInput) => {
      const input = listTasksInput.parse(rawInput);
      const data = await taskCenterService.listTasks(input);
      return listTasksOutput.parse({
        items: data.items.map((item) => ({
          id: item.id,
          kind: item.kind,
          title: item.title,
          status: item.status,
          progress: item.progress,
          currentStage: item.currentStage ?? null,
          ownerLabel: item.ownerLabel,
          failureSummary: item.failureSummary ?? item.lastError ?? null,
          recoveryHint: item.recoveryHint ?? null,
        })),
        summary: `已读取 ${data.items.length} 个系统任务。`,
      });
    },
  },
  get_task_detail: {
    name: "get_task_detail",
    title: "读取任务详情",
    description: "读取统一任务详情、来源页面和失败诊断。",
    category: "read",
    riskLevel: "low",
    domainAgent: "Coordinator",
    resourceScopes: ["task", "agent_run", "generation_job"],
    inputSchema: taskIdentityInput,
    outputSchema: getTaskDetailOutput,
    execute: async (_context, rawInput) => {
      const input = taskIdentityInput.parse(rawInput);
      const detail = await taskCenterService.getTaskDetail(input.kind, input.id);
      if (!detail) {
        throw new AgentToolError("NOT_FOUND", "Task not found.");
      }
      const failureSummary = detail.failureSummary ?? detail.lastError ?? null;
      return getTaskDetailOutput.parse({
        id: detail.id,
        kind: detail.kind,
        title: detail.title,
        status: detail.status,
        currentStage: detail.currentStage ?? null,
        ownerLabel: detail.ownerLabel,
        sourceRoute: detail.sourceRoute,
        failureSummary,
        failureDetails: detail.failureDetails ?? detail.lastError ?? null,
        recoveryHint: detail.recoveryHint ?? buildTaskRecoveryHint(detail.kind, detail.status),
        summary: `已读取任务 ${detail.title}。`,
      });
    },
  },
  get_task_failure_reason: {
    name: "get_task_failure_reason",
    title: "解释任务失败原因",
    description: "解释统一任务的失败、排队、阻塞或等待审批原因。",
    category: "inspect",
    riskLevel: "low",
    domainAgent: "Coordinator",
    resourceScopes: ["task", "agent_run", "generation_job"],
    inputSchema: taskIdentityInput,
    outputSchema: getTaskFailureReasonOutput,
    execute: async (_context, rawInput) => {
      const input = taskIdentityInput.parse(rawInput);
      const detail = await taskCenterService.getTaskDetail(input.kind, input.id);
      if (!detail) {
        throw new AgentToolError("NOT_FOUND", "Task not found.");
      }
      const recoveryHint = detail.recoveryHint ?? buildTaskRecoveryHint(detail.kind, detail.status);
      const failureSummary = normalizeFailureSummary(
        detail.failureSummary ?? detail.lastError,
        detail.status === "failed"
          ? "任务失败，但没有记录明确错误。"
          : `任务当前状态为 ${detail.status}。`,
      );
      return getTaskFailureReasonOutput.parse({
        kind: detail.kind,
        id: detail.id,
        status: detail.status,
        failureSummary,
        failureDetails: detail.failureDetails ?? detail.lastError ?? null,
        recoveryHint,
        summary: failureSummary,
      });
    },
  },
  get_run_failure_reason: {
    name: "get_run_failure_reason",
    title: "解释运行失败原因",
    description: "读取 Agent run 的最后失败步骤、错误摘要和恢复建议。",
    category: "inspect",
    riskLevel: "low",
    domainAgent: "Coordinator",
    resourceScopes: ["agent_run", "task"],
    inputSchema: getRunFailureReasonInput,
    outputSchema: getRunFailureReasonOutput,
    execute: async (_context, rawInput) => {
      const input = getRunFailureReasonInput.parse(rawInput);
      const run = await prisma.agentRun.findUnique({
        where: { id: input.runId },
      });
      if (!run) {
        throw new AgentToolError("NOT_FOUND", "Agent run not found.");
      }
      const failedStep = await prisma.agentStep.findFirst({
        where: {
          runId: run.id,
          status: "failed",
        },
        orderBy: [{ seq: "desc" }],
      });
      const failureSummary = normalizeFailureSummary(
        run.error ?? failedStep?.error,
        run.status === "failed"
          ? "运行失败，但没有记录明确错误。"
          : run.status === "waiting_approval"
            ? "运行正在等待审批。"
            : `运行当前状态为 ${run.status}。`,
      );
      return getRunFailureReasonOutput.parse({
        runId: run.id,
        status: run.status,
        failureSummary,
        failureDetails: failedStep?.error ?? run.error ?? null,
        recoveryHint: buildTaskRecoveryHint("agent_run", run.status),
        lastFailedStep: failedStep ? `${failedStep.agentName}.${failedStep.stepType}` : null,
        summary: failureSummary,
      });
    },
  },
  retry_task: {
    name: "retry_task",
    title: "重试任务",
    description: "对统一任务执行重试，并返回新的状态摘要。",
    category: "run",
    riskLevel: "medium",
    domainAgent: "Coordinator",
    resourceScopes: ["task", "agent_run", "generation_job"],
    inputSchema: taskIdentityInput,
    outputSchema: taskMutationOutput,
    execute: async (_context, rawInput) => {
      const input = taskIdentityInput.parse(rawInput);
      const detail = await taskCenterService.retryTask(input.kind, input.id);
      return taskMutationOutput.parse({
        kind: detail.kind,
        id: detail.id,
        status: detail.status,
        summary: `已触发任务重试：${detail.title}。`,
      });
    },
  },
  cancel_task: {
    name: "cancel_task",
    title: "取消任务",
    description: "取消统一任务，并返回最新状态。",
    category: "run",
    riskLevel: "medium",
    domainAgent: "Coordinator",
    resourceScopes: ["task", "agent_run", "generation_job"],
    inputSchema: taskIdentityInput,
    outputSchema: taskMutationOutput,
    execute: async (_context, rawInput) => {
      const input = taskIdentityInput.parse(rawInput);
      const detail = await taskCenterService.cancelTask(input.kind, input.id);
      return taskMutationOutput.parse({
        kind: detail.kind,
        id: detail.id,
        status: detail.status,
        summary: `已取消任务：${detail.title}。`,
      });
    },
  },
  explain_generation_blocker: {
    name: "explain_generation_blocker",
    title: "解释章节生成阻塞",
    description: "读取小说章节最近一次生成记录，解释失败、排队或阻塞原因。",
    category: "inspect",
    riskLevel: "low",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "chapter", "generation_job", "task"],
    inputSchema: explainGenerationBlockerInput,
    outputSchema: explainGenerationBlockerOutput,
    execute: async (_context, rawInput) => {
      const input = explainGenerationBlockerInput.parse(rawInput);
      if (input.runId?.trim()) {
        const run = await prisma.agentRun.findUnique({
          where: { id: input.runId },
        });
        if (run && run.novelId === input.novelId && run.error?.trim()) {
          return explainGenerationBlockerOutput.parse({
            novelId: input.novelId,
            chapterOrder: input.chapterOrder ?? null,
            blockerType: "agent_run",
            status: run.status,
            failureSummary: run.error.trim(),
            failureDetails: run.error,
            recoveryHint: buildTaskRecoveryHint("agent_run", run.status),
            summary: run.error.trim(),
          });
        }
      }

      const job = await prisma.generationJob.findFirst({
        where: {
          novelId: input.novelId,
          ...(input.chapterOrder != null
            ? {
              startOrder: { lte: input.chapterOrder },
              endOrder: { gte: input.chapterOrder },
            }
            : {}),
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      });

      if (!job) {
        return explainGenerationBlockerOutput.parse({
          novelId: input.novelId,
          chapterOrder: input.chapterOrder ?? null,
          blockerType: "none",
          status: null,
          failureSummary: "当前没有找到与该章节相关的生成任务记录。",
          failureDetails: null,
          recoveryHint: "建议先确认是否已发起章节生成，或在任务中心检查是否存在对应流水线任务。",
          summary: "当前没有找到与该章节相关的生成任务记录。",
        });
      }

      const blockerType = job.status === "failed"
        ? "pipeline_failed"
        : job.status === "running"
          ? "pipeline_running"
          : job.status === "queued"
            ? "pipeline_waiting"
            : "none";
      const failureSummary = job.status === "failed"
        ? normalizeFailureSummary(job.error, "章节生成失败，但没有记录明确错误。")
        : job.status === "running"
          ? "章节生成仍在执行中。"
          : job.status === "queued"
            ? "章节生成任务仍在排队。"
            : job.status === "cancelled"
              ? "章节生成任务已取消。"
              : "最近一次章节生成任务已结束。";
      return explainGenerationBlockerOutput.parse({
        novelId: input.novelId,
        chapterOrder: input.chapterOrder ?? null,
        blockerType,
        status: job.status,
        failureSummary,
        failureDetails: job.error ?? null,
        recoveryHint: buildTaskRecoveryHint("novel_pipeline", job.status),
        summary: failureSummary,
      });
    },
  },
};
