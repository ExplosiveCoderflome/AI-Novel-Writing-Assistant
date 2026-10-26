import { cloneProductionData, ProductionBudgetNotDispatchedError, type ProductionJson } from "../../common";
import { hashProductionContent, InvalidProductionRequestError,
  type StageDescriptor, type StagePort, type StageReply, type UnitRun } from "../../application";
import type { ArtifactContext, ArtifactReconciliationPorts, PreparedArtifactExtraction } from "../storyState/consumerPorts";
import { reconcileArtifacts } from "../storyState/reconciliation";

export class UnknownArtifactRequestError extends Error {
  constructor() { super("Artifact request outcome is unknown"); this.name = "UnknownArtifactRequestError"; }
}
export function createReconcileStage(input: { ports: ArtifactReconciliationPorts; executionToken(run: UnitRun): string }): StagePort {
  function context(run: UnitRun, requestKey: string): ArtifactContext {
    const content = run.progress.selected === "candidate" ? run.artifacts.candidate : run.artifacts.original;
    if (!content || hashProductionContent(content) !== run.progress.committedContentHash) throw new InvalidProductionRequestError("Committed manuscript artifact is missing");
    return { run, content, contentHash: run.progress.committedContentHash!, requestKey, executionToken: input.executionToken(run) };
  }
  async function execute(run: UnitRun, invocation: StageDescriptor & { requestKey: string }, recoverOnly = false): Promise<StageReply> {
    const expected = invocation.input as unknown as { preparedExtraction?: PreparedArtifactExtraction } | undefined;
    const preparedExtraction = expected?.preparedExtraction;
    if (!preparedExtraction?.inputFingerprint || invocation.inputFingerprint !== preparedExtraction.inputFingerprint) {
      throw new InvalidProductionRequestError("Reconciliation prepared input is missing or inconsistent");
    }
    const ports: ArtifactReconciliationPorts = { ...input.ports, extraction: { ...input.ports.extraction,
      prepare: async () => cloneProductionData(preparedExtraction) } };
    const result = await reconcileArtifacts(context(run, invocation.requestKey), ports, { recoverOnly });
    if (result.status === "unknown") throw new UnknownArtifactRequestError();
    // Earlier subrequests already have durable receipts; the denied subrequest was explicitly released before dispatch.
    if (result.status === "budget_exhausted") throw new ProductionBudgetNotDispatchedError();
    return { result: { stage: "reconcile", status: result.status }, artifacts: {
      stageData: { reconcile: { preparedExtraction: preparedExtraction as unknown as ProductionJson } },
      ...(result.results === undefined ? {} : { reconciliation: result.results }) } };
  }
  return {
    describe: async run => {
      const saved = run.artifacts.stageData?.reconcile as unknown as { preparedExtraction?: PreparedArtifactExtraction } | undefined;
      const prepared = saved?.preparedExtraction ?? await input.ports.extraction.prepare(context(run, "describe_only"));
      return { callsModel: false, inputFingerprint: prepared.inputFingerprint, promptVersion: "artifact_reconcile@1",
        configVersion: run.snapshots.model.configVersion, input: { preparedExtraction: prepared as unknown as ProductionJson } };
    },
    execute,
    recover: async (run, requestKey) => {
      const descriptor = run.artifacts.activeDescriptor;
      if (!descriptor) throw new InvalidProductionRequestError("Reconciliation claim has no input description");
      try { return await execute(run, { ...descriptor, requestKey }, true); }
      catch (error) { if (error instanceof UnknownArtifactRequestError) return undefined; throw error; }
    },
  };
}
