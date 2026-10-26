import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import type { PromptAsset, PromptContextBlock, PromptExecutionOptions, PromptRunResult } from "../../../../prompting/core/promptTypes";
import { ProductionSnapshotConflictError, type PreparationSteps, type UnitRun } from "../../../../modules/production";
import type { ProductionJson } from "../../../../modules/production/common";
import { createKernelPromptPreparer } from "../prompts/preflight";
import { runKernelRequestScope } from "../execution/requestScope";

type PhysicalScope = Parameters<typeof runKernelRequestScope>[0];
export interface PreparationPromptDependencies {
  preflight: ReturnType<typeof createKernelPromptPreparer>;
  budget: PhysicalScope["budget"];
  requestLimit(run: UnitRun): number;
  fence(run: UnitRun): Promise<void>;
  invokePrompt?: typeof runStructuredPrompt;
}
const wire = (value: unknown): ProductionJson => JSON.parse(JSON.stringify(value));

/** Each native semantic/contract/planner request has a stable ordinal within its frozen parent input. */
export function createKernelPreparationPromptInvoker(deps: PreparationPromptDependencies, run: UnitRun, steps: PreparationSteps): typeof runStructuredPrompt {
  const counts = new Map<string, number>();
  const invoke = async <I, O, R = O>(request: { asset: PromptAsset<I, O, R>; promptInput: I;
    contextBlocks?: PromptContextBlock[]; options?: PromptExecutionOptions }): Promise<PromptRunResult<O>> => {
    const nativeOptions: PromptExecutionOptions = { ...request.options,
      novelId: run.progress.unit.novelId, chapterId: run.progress.unit.chapterId };
    if (nativeOptions.provider !== run.snapshots.model.provider || nativeOptions.model !== run.snapshots.model.model) throw new ProductionSnapshotConflictError();
    const actual = { ...request, options: nativeOptions };
    const prepared = await deps.preflight.prepare(actual);
    const ordinal = counts.get(request.asset.id) ?? 0;
    counts.set(request.asset.id, ordinal + 1);
    const value = await steps.model(`${request.asset.id}:${ordinal}`, { identity: prepared.description.identity,
      input: wire({ assetId: request.asset.id, assetVersion: request.asset.version, promptInput: request.promptInput,
        contextBlocks: request.contextBlocks, options: nativeOptions }), outputTokens: prepared.description.outputTokens }, async (_saved, requestKey) => {
      await deps.fence(run);
      const generated = await prepared.execute(() => runKernelRequestScope({ unit: run.progress.unit, requestKey,
        maxRequests: deps.requestLimit(run), reserveTokens: prepared.reserveTokens, budget: deps.budget,
        fence: () => deps.fence(run) }, () => (deps.invokePrompt ?? runStructuredPrompt)(actual)));
      if ((await deps.preflight.prepare(actual)).description.identity !== prepared.description.identity) throw new ProductionSnapshotConflictError();
      await deps.fence(run);
      return wire(generated);
    });
    return value as unknown as PromptRunResult<O>;
  };
  return invoke;
}
