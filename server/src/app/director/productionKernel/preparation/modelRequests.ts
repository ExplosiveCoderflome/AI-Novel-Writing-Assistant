import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import type { PromptAsset, PromptContextBlock, PromptExecutionOptions, PromptRunResult } from "../../../../prompting/core/promptTypes";
import { hashProductionContent, ProductionSnapshotConflictError, type PreparationSteps, type UnitRun } from "../../../../modules/production";
import { canonicalProductionJson } from "../../../../modules/production/common";
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

/**
 * Round-varying inputs are part of the request, not of its frozen identity: the
 * same asset ordinal can legitimately carry different guidance on a resumed
 * evaluation (the continuity review may assess differently between executions),
 * and the previous-chapter context block is rebuilt from live chapter state on
 * each invocation, so its rendered shape can drift between attempts even when
 * the chapter itself did not change (the stored request keeps the shape built
 * at first invocation, a rebuild may carry the reduced shape the prompt
 * pipeline produces). Keying only on asset+ordinal would alias those distinct
 * requests onto one saved snapshot and either false-conflict or replay a stale
 * cached result. The round digest keeps identical requests on the same key
 * (cache reuse still works) while giving each distinct round its own key.
 * Everything else (asset version, provider/model, base prompt) still goes
 * through the strict snapshot comparison in steps.model.
 */
function feedbackDigest(request: { promptInput: unknown; contextBlocks?: PromptContextBlock[] }): string {
  const promptInput = (request.promptInput ?? {}) as { guidance?: unknown };
  const guidance = typeof promptInput.guidance === "string" ? promptInput.guidance : null;
  const guidanceBlocks = (request.contextBlocks ?? [])
    .filter((block) => block?.id === "guidance")
    .map((block) => block.content ?? "");
  const previousChapterBlock = (request.contextBlocks ?? [])
    .filter((block) => block?.id === "previous_chapter_result")
    .map((block) => block.content ?? "");
  return hashProductionContent(canonicalProductionJson({ guidance, guidanceBlocks, previousChapterBlock })).slice(0, 12);
}

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
    const value = await steps.model(`${request.asset.id}:${ordinal}:${feedbackDigest(request)}`, { identity: prepared.description.identity,
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
