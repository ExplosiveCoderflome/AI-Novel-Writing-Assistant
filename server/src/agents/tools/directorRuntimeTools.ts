import type {
  DirectorManualEditImpact,
  DirectorNextAction,
  DirectorPolicyMode,
  DirectorRuntimeProjection,
  DirectorWorkspaceAnalysis,
} from "@ai-novel/shared/types/directorRuntime";
import type { NovelDirectorService } from "../../services/novel/director/NovelDirectorService";
import type { NovelWorkflowService } from "../../services/novel/workflow/NovelWorkflowService";
import { AgentToolError, type AgentToolName, type ToolExecutionContext } from "../types";
import type { AgentToolDefinition } from "./toolTypes";
import {
  analyzeDirectorWorkspaceInputSchema,
  analyzeDirectorWorkspaceOutputSchema,
  evaluateManualEditImpactInputSchema,
  evaluateManualEditImpactOutputSchema,
  explainDirectorNextActionInputSchema,
  explainDirectorNextActionOutputSchema,
  getDirectorRunStatusInputSchema,
  getDirectorRunStatusOutputSchema,
  runDirectorRuntimeInputSchema,
  runDirectorRuntimeOutputSchema,
  switchDirectorPolicyInputSchema,
  switchDirectorPolicyOutputSchema,
} from "./directorRuntimeToolSchemas";

let serviceCache: {
  novelDirectorService: NovelDirectorService;
  workflowService: NovelWorkflowService;
} | null = null;

async function getServices() {
  if (serviceCache) {
    return serviceCache;
  }
  const [
    { NovelDirectorService },
    { NovelWorkflowService },
  ] = await Promise.all([
    import("../../services/novel/director/NovelDirectorService"),
    import("../../services/novel/workflow/NovelWorkflowService"),
  ]);
  serviceCache = {
    novelDirectorService: new NovelDirectorService(),
    workflowService: new NovelWorkflowService(),
  };
  return serviceCache;
}

interface ResolvedDirectorRuntimeScope {
  taskId: string;
  novelId: string;
}

function trimText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function resolveNovelId(context: ToolExecutionContext, input: {
  novelId?: string;
}): string | null {
  return trimText(input.novelId) ?? trimText(context.novelId);
}

async function resolveDirectorRuntimeScope(
  context: ToolExecutionContext,
  input: {
    novelId?: string;
    taskId?: string;
  },
): Promise<ResolvedDirectorRuntimeScope> {
  const { workflowService } = await getServices();
  const taskId = trimText(input.taskId);
  if (taskId) {
    const task = await workflowService.getTaskByIdWithoutHealing(taskId);
    if (!task) {
      throw new AgentToolError("NOT_FOUND", "没有找到绑定的自动导演任务。");
    }
    const novelId = trimText(input.novelId) ?? trimText(task.novelId) ?? trimText(context.novelId);
    if (!novelId) {
      throw new AgentToolError("INVALID_INPUT", "自动导演任务没有绑定小说，无法读取运行时。");
    }
    return { taskId: task.id, novelId };
  }

  const novelId = resolveNovelId(context, input);
  if (!novelId) {
    throw new AgentToolError("INVALID_INPUT", "需要绑定小说或传入自动导演任务 ID。");
  }

  const activeTask = await workflowService.findActiveTaskByNovelAndLane(novelId, "auto_director");
  const task = activeTask ?? await workflowService.findLatestVisibleTaskByNovelId(novelId, "auto_director");
  if (!task) {
    throw new AgentToolError("NOT_FOUND", "当前小说还没有可读取的自动导演任务。");
  }
  return {
    taskId: task.id,
    novelId: trimText(task.novelId) ?? novelId,
  };
}

function toNextAction(action: DirectorNextAction | null | undefined) {
  if (!action) {
    return null;
  }
  return {
    action: action.action,
    reason: action.reason,
    affectedScope: action.affectedScope ?? null,
    riskLevel: action.riskLevel,
  };
}

function buildArtifactSummary(analysis: DirectorWorkspaceAnalysis) {
  const inventory = analysis.inventory;
  return {
    total: inventory.artifacts.length,
    missingArtifactTypes: inventory.missingArtifactTypes,
    staleArtifactCount: inventory.staleArtifacts.length,
    protectedUserContentCount: inventory.protectedUserContentArtifacts.length,
    needsRepairCount: inventory.needsRepairArtifacts.length,
  };
}

function buildWorkspaceOutput(input: {
  taskId: string | null;
  analysis: DirectorWorkspaceAnalysis;
}) {
  const interpretation = input.analysis.interpretation;
  const nextAction = input.analysis.recommendation ?? interpretation?.recommendedAction ?? null;
  return {
    novelId: input.analysis.novelId,
    taskId: input.taskId,
    productionStage: interpretation?.productionStage ?? null,
    summary: interpretation?.summary
      ?? nextAction?.reason
      ?? "已完成当前小说的自动导演工作区分析。",
    confidence: input.analysis.confidence,
    nextAction: toNextAction(nextAction),
    artifactSummary: buildArtifactSummary(input.analysis),
  };
}

function buildProjectionSummary(projection: DirectorRuntimeProjection): string {
  if (projection.requiresUserAction && projection.blockedReason) {
    return projection.blockedReason;
  }
  return projection.headline
    ?? projection.detail
    ?? projection.lastEventSummary
    ?? "已读取自动导演运行状态。";
}

async function loadRuntimeProjection(scope: ResolvedDirectorRuntimeScope): Promise<DirectorRuntimeProjection> {
  const { novelDirectorService } = await getServices();
  const snapshot = await novelDirectorService.getRuntimeSnapshot(scope.taskId);
  const projection = novelDirectorService.buildRuntimeProjection(snapshot);
  if (!projection) {
    throw new AgentToolError("NOT_FOUND", "当前自动导演任务还没有运行时快照。");
  }
  return projection;
}

function buildStatusOutput(scope: ResolvedDirectorRuntimeScope, projection: DirectorRuntimeProjection) {
  return {
    taskId: scope.taskId,
    novelId: projection.novelId ?? scope.novelId ?? null,
    status: projection.status,
    currentNodeKey: projection.currentNodeKey ?? null,
    currentLabel: projection.currentLabel ?? null,
    headline: projection.headline ?? null,
    detail: projection.detail ?? null,
    nextActionLabel: projection.nextActionLabel ?? null,
    scopeSummary: projection.scopeSummary ?? null,
    progressSummary: projection.progressSummary ?? null,
    requiresUserAction: projection.requiresUserAction,
    blockedReason: projection.blockedReason ?? null,
    policyMode: projection.policyMode,
    recentEvents: projection.recentEvents.map((event) => ({
      type: event.type,
      summary: event.summary,
      nodeKey: event.nodeKey ?? null,
      severity: event.severity ?? null,
      occurredAt: event.occurredAt,
    })),
    summary: buildProjectionSummary(projection),
  };
}

function getLlmOptions(context: ToolExecutionContext) {
  return {
    provider: context.provider as any,
    model: context.model,
    temperature: context.temperature,
  };
}

async function analyzeWorkspaceForTool(
  context: ToolExecutionContext,
  input: {
    novelId?: string;
    taskId?: string;
    includeAiInterpretation?: boolean;
  },
) {
  const { novelDirectorService } = await getServices();
  const scope = await resolveDirectorRuntimeScope(context, input);
  const analysis = await novelDirectorService.analyzeRuntimeWorkspace(scope.novelId, {
    workflowTaskId: scope.taskId,
    includeAiInterpretation: input.includeAiInterpretation ?? true,
    llm: getLlmOptions(context),
  });
  return { scope, analysis };
}

function normalizePolicyPatch(input: {
  mayOverwriteUserContent?: boolean;
  allowExpensiveReview?: boolean;
  modelTier?: "cheap_fast" | "balanced" | "high_quality";
}) {
  return {
    mayOverwriteUserContent: input.mayOverwriteUserContent,
    allowExpensiveReview: input.allowExpensiveReview,
    modelTier: input.modelTier,
  };
}

function buildManualImpactOutput(input: {
  taskId: string | null;
  impact: DirectorManualEditImpact;
}) {
  return {
    novelId: input.impact.novelId,
    taskId: input.taskId,
    impactLevel: input.impact.impactLevel,
    summary: input.impact.summary,
    safeToContinue: input.impact.safeToContinue,
    requiresApproval: input.impact.requiresApproval,
    affectedArtifactIds: input.impact.affectedArtifactIds,
    changedChapters: input.impact.changedChapters.map((chapter) => ({
      chapterId: chapter.chapterId,
      title: chapter.title,
      order: chapter.order,
    })),
    minimalRepairPath: input.impact.minimalRepairPath.map((step) => ({
      action: step.action,
      label: step.label,
      reason: step.reason,
      affectedScope: step.affectedScope ?? null,
      requiresApproval: step.requiresApproval,
    })),
    riskNotes: input.impact.riskNotes,
  };
}

async function runDirectorWithMode(
  context: ToolExecutionContext,
  input: {
    novelId?: string;
    taskId?: string;
    dryRun?: boolean;
  },
  mode: DirectorPolicyMode,
) {
  const { novelDirectorService } = await getServices();
  const scope = await resolveDirectorRuntimeScope(context, input);
  if (context.dryRun || input.dryRun) {
    return {
      taskId: scope.taskId,
      novelId: scope.novelId,
      mode,
      status: "preview_only" as const,
      summary: mode === "run_until_gate"
        ? "将通过自动导演运行时推进到下一个检查点，执行前会保留策略和审批边界。"
        : "将通过自动导演运行时推进下一步，执行前会保留策略和审批边界。",
    };
  }
  await novelDirectorService.updateRuntimePolicy(scope.taskId, { mode });
  await novelDirectorService.continueTask(scope.taskId, {});
  return {
    taskId: scope.taskId,
    novelId: scope.novelId,
    mode,
    status: "accepted" as const,
    summary: mode === "run_until_gate"
      ? "已请求自动导演推进到下一个检查点。"
      : "已请求自动导演继续推进下一步。",
  };
}

export const directorRuntimeToolDefinitions: Partial<
  Record<AgentToolName, AgentToolDefinition<Record<string, unknown>, Record<string, unknown>>>
> = {
  analyze_director_workspace: {
    name: "analyze_director_workspace",
    title: "分析自动导演工作区",
    description: "通过自动导演运行时分析当前小说资产、缺失内容、风险和推荐动作。",
    category: "inspect",
    riskLevel: "low",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "task"],
    parserHints: {
      intent: "analyze_director_workspace",
      aliases: ["导演工作区分析", "自动导演分析", "分析当前小说资产"],
      phrases: ["分析这本书现在缺什么", "让自动导演检查当前工作区", "当前小说资产是否完整"],
      requiresNovelContext: true,
      whenToUse: "用户要求自动导演分析当前小说资产、缺失项、风险或可继续性。",
    },
    inputSchema: analyzeDirectorWorkspaceInputSchema,
    outputSchema: analyzeDirectorWorkspaceOutputSchema,
    execute: async (context, rawInput) => {
      const input = analyzeDirectorWorkspaceInputSchema.parse(rawInput);
      const { scope, analysis } = await analyzeWorkspaceForTool(context, input);
      return analyzeDirectorWorkspaceOutputSchema.parse(buildWorkspaceOutput({
        taskId: scope.taskId,
        analysis,
      }));
    },
  },
  get_director_run_status: {
    name: "get_director_run_status",
    title: "读取自动导演状态",
    description: "读取自动导演运行时快照投影，说明当前节点、等待原因和最近事件。",
    category: "inspect",
    riskLevel: "low",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "task"],
    parserHints: {
      intent: "query_director_status",
      aliases: ["自动导演状态", "导演进度", "director runtime"],
      phrases: ["自动导演到哪了", "导演任务现在什么状态", "当前导演节点是什么"],
      requiresNovelContext: true,
      whenToUse: "用户询问自动导演运行状态、当前节点、等待确认或最近事件。",
    },
    inputSchema: getDirectorRunStatusInputSchema,
    outputSchema: getDirectorRunStatusOutputSchema,
    execute: async (context, rawInput) => {
      const input = getDirectorRunStatusInputSchema.parse(rawInput);
      const scope = await resolveDirectorRuntimeScope(context, input);
      const projection = await loadRuntimeProjection(scope);
      return getDirectorRunStatusOutputSchema.parse(buildStatusOutput(scope, projection));
    },
  },
  explain_director_next_action: {
    name: "explain_director_next_action",
    title: "解释自动导演下一步",
    description: "结合运行时状态和工作区分析，说明当前小说下一步应该怎么推进。",
    category: "inspect",
    riskLevel: "low",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "task"],
    parserHints: {
      intent: "explain_director_next_action",
      aliases: ["下一步建议", "导演建议", "现在该做什么"],
      phrases: ["这本书现在该做什么", "下一步怎么推进", "自动导演建议下一步是什么"],
      requiresNovelContext: true,
      whenToUse: "用户希望创作中枢解释当前小说的下一步、风险和推荐动作。",
    },
    inputSchema: explainDirectorNextActionInputSchema,
    outputSchema: explainDirectorNextActionOutputSchema,
    execute: async (context, rawInput) => {
      const input = explainDirectorNextActionInputSchema.parse(rawInput);
      const { scope, analysis } = await analyzeWorkspaceForTool(context, input);
      const projection = await loadRuntimeProjection(scope);
      const nextAction = analysis.recommendation ?? analysis.interpretation?.recommendedAction ?? null;
      const reason = nextAction?.reason
        ?? projection.nextActionLabel
        ?? projection.detail
        ?? "当前自动导演会根据运行时状态继续推荐下一步。";
      return explainDirectorNextActionOutputSchema.parse({
        novelId: scope.novelId,
        taskId: scope.taskId,
        runtimeStatus: projection.status,
        currentStep: projection.currentLabel ?? projection.currentNodeKey ?? null,
        recommendedAction: toNextAction(nextAction),
        nextActionLabel: projection.nextActionLabel ?? null,
        requiresUserAction: projection.requiresUserAction,
        blockedReason: projection.blockedReason ?? null,
        reason,
        summary: projection.requiresUserAction && projection.blockedReason
          ? projection.blockedReason
          : reason,
      });
    },
  },
  run_director_next_step: {
    name: "run_director_next_step",
    title: "继续自动导演下一步",
    description: "通过自动导演运行时请求继续推进下一步。",
    category: "run",
    riskLevel: "high",
    approvalRequired: true,
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "task"],
    parserHints: {
      intent: "run_director_next_step",
      aliases: ["继续导演", "推进下一步", "run next step"],
      phrases: ["继续自动导演下一步", "让导演继续推进一步", "执行导演下一步"],
      requiresNovelContext: true,
      whenToUse: "用户明确要求自动导演继续执行下一步。",
    },
    inputSchema: runDirectorRuntimeInputSchema,
    outputSchema: runDirectorRuntimeOutputSchema,
    execute: async (context, rawInput) => {
      const input = runDirectorRuntimeInputSchema.parse(rawInput);
      return runDirectorRuntimeOutputSchema.parse(await runDirectorWithMode(context, input, "run_next_step"));
    },
  },
  run_director_until_gate: {
    name: "run_director_until_gate",
    title: "自动推进到检查点",
    description: "通过自动导演运行时请求持续推进到下一个检查点或确认点。",
    category: "run",
    riskLevel: "high",
    approvalRequired: true,
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "task"],
    parserHints: {
      intent: "run_director_until_gate",
      aliases: ["推进到检查点", "run until gate", "推进到确认点"],
      phrases: ["继续自动导演到检查点", "推进到需要我确认的地方", "让导演运行到下一个关口"],
      requiresNovelContext: true,
      whenToUse: "用户明确要求自动导演连续推进，直到检查点、确认点或阻塞点。",
    },
    inputSchema: runDirectorRuntimeInputSchema,
    outputSchema: runDirectorRuntimeOutputSchema,
    execute: async (context, rawInput) => {
      const input = runDirectorRuntimeInputSchema.parse(rawInput);
      return runDirectorRuntimeOutputSchema.parse(await runDirectorWithMode(context, input, "run_until_gate"));
    },
  },
  switch_director_policy: {
    name: "switch_director_policy",
    title: "切换自动导演推进方式",
    description: "切换自动导演运行时策略，例如只给建议、推进下一步、推进到检查点或安全范围自动推进。",
    category: "run",
    riskLevel: "medium",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "task"],
    parserHints: {
      intent: "switch_director_policy",
      aliases: ["切换导演策略", "切换推进方式", "自动化强度"],
      phrases: ["把自动导演切到只给建议", "改成推进到检查点", "允许安全范围自动推进"],
      requiresNovelContext: true,
      whenToUse: "用户明确要求调整自动导演策略或自动化推进强度。",
    },
    inputSchema: switchDirectorPolicyInputSchema,
    outputSchema: switchDirectorPolicyOutputSchema,
    execute: async (context, rawInput) => {
      const input = switchDirectorPolicyInputSchema.parse(rawInput);
      const scope = await resolveDirectorRuntimeScope(context, input);
      if (context.dryRun || input.dryRun) {
        return switchDirectorPolicyOutputSchema.parse({
          taskId: scope.taskId,
          novelId: scope.novelId,
          mode: input.mode,
          status: "preview_only",
          summary: `将把自动导演推进方式切换为 ${input.mode}。`,
        });
      }
      const { novelDirectorService } = await getServices();
      await novelDirectorService.updateRuntimePolicy(scope.taskId, {
        mode: input.mode,
        patch: normalizePolicyPatch(input),
      });
      return switchDirectorPolicyOutputSchema.parse({
        taskId: scope.taskId,
        novelId: scope.novelId,
        mode: input.mode,
        status: "updated",
        summary: `已把自动导演推进方式切换为 ${input.mode}。`,
      });
    },
  },
  evaluate_manual_edit_impact: {
    name: "evaluate_manual_edit_impact",
    title: "评估手动改文影响",
    description: "通过自动导演运行时评估用户手动修改正文后的影响范围和最小修复路径。",
    category: "inspect",
    riskLevel: "low",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "chapter", "task"],
    parserHints: {
      intent: "evaluate_manual_edit_impact",
      aliases: ["改文影响", "手动编辑影响", "manual edit impact"],
      phrases: ["我改了第三章看看影响什么", "我改了主角动机后续要不要重算", "删除伏笔会影响哪些章节"],
      requiresNovelContext: true,
      whenToUse: "用户手动修改正文、动机、伏笔或设定后，希望判断影响范围和修复路径。",
    },
    inputSchema: evaluateManualEditImpactInputSchema,
    outputSchema: evaluateManualEditImpactOutputSchema,
    execute: async (context, rawInput) => {
      const input = evaluateManualEditImpactInputSchema.parse(rawInput);
      const scope = await resolveDirectorRuntimeScope(context, input);
      const { novelDirectorService } = await getServices();
      const impact = await novelDirectorService.evaluateManualEditImpact(scope.novelId, {
        workflowTaskId: scope.taskId,
        chapterId: input.chapterId,
        includeAiInterpretation: input.includeAiInterpretation ?? true,
        llm: getLlmOptions(context),
      });
      return evaluateManualEditImpactOutputSchema.parse(buildManualImpactOutput({
        taskId: scope.taskId,
        impact,
      }));
    },
  },
};
