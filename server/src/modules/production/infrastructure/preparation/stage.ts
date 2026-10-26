import { canonicalProductionJson, cloneProductionData, ProtectedProductionContentError, ProductionVersionConflictError, type ProductionJson } from "../../common";
import { hashProductionContent, InvalidProductionRequestError, type StageDescriptor, type StagePort, type StageReply, type UnitRun } from "../../application";
import type { ChapterBaseline } from "../stages";
import { createPreparationSteps } from "./steps";
import { PreparationRequestUnresolvedError, type KernelPreparationStageDependencies } from "./types";

type SavedInput = { baseline: ChapterBaseline; source: ProductionJson };
const fingerprint = (input: unknown) => hashProductionContent(canonicalProductionJson(input));

/** Each internal native model request owns its own saved descriptor, budget scope and immutable result. */
export function createKernelPreparationStage(deps: KernelPreparationStageDependencies): StagePort {
  async function execute(run: UnitRun, invocation: StageDescriptor & { requestKey: string }, recoverOnly = false): Promise<StageReply> {
    const saved = invocation.input as unknown as SavedInput;
    if (!saved?.baseline || saved.source === undefined || fingerprint(saved) !== invocation.inputFingerprint
      || run.activeStage !== "prepare" || run.activeRequestKey !== invocation.requestKey) {
      throw new InvalidProductionRequestError("Preparation claim differs from its saved input");
    }
    await deps.fence(run);
    const current = await deps.readBaseline(run.progress.unit);
    if (current.content !== saved.baseline.content) throw new ProductionVersionConflictError();
    if (deps.purpose === "automatic" && current.protectedUserContent) throw new ProtectedProductionContentError();
    const { steps, finalIdentity } = createPreparationSteps(deps, run, saved.baseline, invocation.requestKey, invocation.inputFingerprint, recoverOnly);
    const completed = await deps.checkpoints.claim(finalIdentity, { existingOnly: true });
    if (completed.status === "cached") return cloneProductionData(completed.value) as unknown as StageReply;
    const prepared = await deps.execute(run, cloneProductionData(saved.source), steps);
    await deps.fence(run);
    const baseline = await deps.readBaseline(run.progress.unit);
    if (baseline.content !== saved.baseline.content) throw new ProductionVersionConflictError();
    if (deps.purpose === "automatic" && baseline.protectedUserContent) throw new ProtectedProductionContentError();
    const reply: StageReply = { result: { stage: "prepare" }, artifacts: { prepared: cloneProductionData({ ...prepared, baseline }) as unknown as ProductionJson } };
    return await steps.read("stage_result", async () => cloneProductionData(reply) as unknown as ProductionJson) as unknown as StageReply;
  }
  return {
    async describe(run) {
      await deps.fence(run);
      const baseline = await deps.readBaseline(run.progress.unit);
      if (deps.purpose === "automatic" && baseline.protectedUserContent) throw new ProtectedProductionContentError();
      const input = cloneProductionData({ baseline, source: await deps.readInput(run) });
      await deps.fence(run);
      return { callsModel: false, input: input as unknown as ProductionJson, inputFingerprint: fingerprint(input),
        promptVersion: "kernel_preparation@1", configVersion: run.snapshots.model.configVersion };
    },
    execute,
    async recover(run, requestKey) {
      const descriptor = run.artifacts.activeDescriptor;
      if (!descriptor) throw new InvalidProductionRequestError("Preparation claim has no saved input");
      try { return await execute(run, { ...descriptor, requestKey }, true); }
      catch (error) { if (error instanceof PreparationRequestUnresolvedError) return undefined; throw error; }
    },
  };
}
