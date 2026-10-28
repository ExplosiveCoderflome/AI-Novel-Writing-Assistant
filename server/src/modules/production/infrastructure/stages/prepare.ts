import { ProtectedProductionContentError, ProductionVersionConflictError } from "../../common";
import type { StagePort } from "../../application";
import type { ChapterStageServices } from "./contracts";
import { executeScoped } from "./execution";
import { stageWireData } from "./snapshots";

export function createPrepareStage(services: ChapterStageServices): StagePort {
  return {
    describe: run => services.describe("prepare", run, stageWireData({ unit: run.progress.unit, snapshots: run.snapshots })),
    execute: (run, invocation) => executeScoped(services, run, invocation, async () => {
      const baseline = await services.readBaseline(run.progress.unit);
      if (services.purpose === "automatic" && baseline.protectedUserContent) throw new ProtectedProductionContentError();
      const prepared = await services.prepare(run);
      const current = await services.readBaseline(run.progress.unit);
      if (current.content !== baseline.content) throw new ProductionVersionConflictError();
      if (services.purpose === "automatic" && current.protectedUserContent) throw new ProtectedProductionContentError();
      return { result: { stage: "prepare" }, artifacts: { prepared: stageWireData({ ...prepared, baseline: current }) } };
    }),
  };
}
