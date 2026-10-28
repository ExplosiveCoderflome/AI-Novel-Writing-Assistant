import type { UnitPorts } from "../../application";
import type { ChapterStageServices } from "./contracts";
import { createPrepareStage } from "./prepare";
import { createDraftStage } from "./draft";
import { createAcceptStage } from "./accept";
import { createRepairStage } from "./repair";
import { createVerifyStage } from "./verify";
import { createCommitStage } from "./commit";

export function createChapterStagePorts(services: ChapterStageServices, finalization: Pick<UnitPorts["stages"], "reconcile">): UnitPorts["stages"] {
  return { prepare: createPrepareStage(services), draft: createDraftStage(services), accept: createAcceptStage(services),
    repair: createRepairStage(services), verify: createVerifyStage(services), commit: createCommitStage(services), ...finalization };
}
export type { ChapterStageServices, ChapterBaseline, PreparedChapter, PreparedStageCall } from "./contracts";
export { projectAcceptance } from "./acceptanceProjection";
export { createReconcileStage, UnknownArtifactRequestError } from "./reconcile";
