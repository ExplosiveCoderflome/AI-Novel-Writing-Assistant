import type {PreparationSteps, UnitRun} from "../../../../modules/production";
import type {InvocationUsageRecord} from "../../../../platform/llm/usage";
import type {RagTargetDescription} from "../../../../services/rag/execution";
import type {createKernelChapterBudget} from "../execution/chapterBudget";

export interface KernelRagConfiguration {
  version: 1;
  enabled: boolean;
  targets: RagTargetDescription[];
  windows: {provider: string; model: string; contextWindow: number}[];
  retrievalIdentity: string;
}
export interface KernelRagContextDependencies {
  run: UnitRun;
  runId: string;
  steps: PreparationSteps;
  configuration: KernelRagConfiguration;
  readConfiguration(): Promise<KernelRagConfiguration>;
  readSources(query: string, options: unknown): Promise<string>;
  assertIndex(): Promise<void>;
  fence(): Promise<void>;
  budget: Pick<ReturnType<typeof createKernelChapterBudget>, "reserve" | "observe" | "releaseUndispatched">;
  recordUsage(record: InvocationUsageRecord): Promise<void>;
}
