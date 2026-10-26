import {resolveLLMClientOptions} from "../../../../llm/factory";
import {createLongChapterProfile, ProductionSnapshotConflictError, type ProductionProfile, type UnitPorts, type StagePort} from "../../../../modules/production";
import {withLlmTaskOutputBudgets, withoutLlmTaskOutputBudgets, type LlmTaskOutputBudget} from "../../../../platform/llm/execution";
import {configurationKey} from "../prompts/preflight";
import type {KernelModelPolicySources} from "./source";
import type {KernelModelPolicy} from "./types";

/** Settings have already been bound by hash. Capture usable numeric allowances without persisting credentials. */
export function captureKernelTaskOutputBudgets(policy: KernelModelPolicy, sources?: KernelModelPolicySources): Promise<LlmTaskOutputBudget[]> {
  return withoutLlmTaskOutputBudgets(async () => {
    const rows: LlmTaskOutputBudget[] = [];
    for (const target of policy.targets) {
      const current = await (sources?.resolveModel ?? resolveLLMClientOptions)(target.provider,
        {model: target.model, taskType: target.taskType, executionMode: "plain"});
      if (configurationKey(current) !== target.configurationHash || !Number.isSafeInteger(current.maxTokens) || current.maxTokens! < 1) {
        throw new ProductionSnapshotConflictError();
      }
      const fallback = policy.fallback.enabled && (target.provider !== policy.provider || target.model !== policy.model);
      rows.push({provider: target.provider, model: target.model, taskType: target.taskType,
        maxTokens: fallback ? policy.fallback.maxTokens ?? current.maxTokens! : current.maxTokens!});
    }
    return rows;
  });
}

export function createConfiguredKernelProfile(rows: readonly LlmTaskOutputBudget[]): ProductionProfile {
  const tokens = (task: string) => Math.max(...rows.filter(row => row.taskType === task).map(row => row.maxTokens));
  return {...createLongChapterProfile(), outputBudgets: {
    draft: tokens("writer"), accept: tokens("review"), repair: tokens("repair"), verify: tokens("review"),
  }};
}

/** Describe, execute and recovery use the same limits. Existing unit profiles remain authoritative on resume. */
export function withKernelTaskOutputStages(input: UnitPorts["stages"], rows: readonly LlmTaskOutputBudget[]): UnitPorts["stages"] {
  const captured = rows.map(row => ({...row})), stages: UnitPorts["stages"] = {};
  const tasks = {draft: "writer", accept: "review", verify: "review", repair: "repair"} as const;
  for (const [stage, port] of Object.entries(input)) {
    if (!port) continue;
    const scoped = <T>(run: Parameters<StagePort["describe"]>[0], operation: () => Promise<T>) => {
      const task = tasks[stage as keyof typeof tasks], limit = run.snapshots.profile.outputBudgets[stage as keyof typeof run.snapshots.profile.outputBudgets];
      return withLlmTaskOutputBudgets(captured.map(row => ({...row,
        maxTokens: task === row.taskType && limit ? Math.min(limit, row.maxTokens) : row.maxTokens})), operation);
    };
    stages[stage as keyof typeof stages] = {
      describe: run => scoped(run, () => port.describe(run)),
      execute: (run, invocation) => scoped(run, () => port.execute(run, invocation)),
      ...(port.recover ? {recover: (run: Parameters<StagePort["describe"]>[0], key: string) => scoped(run, () => port.recover!(run, key))} : {}),
    };
  }
  return stages;
}
