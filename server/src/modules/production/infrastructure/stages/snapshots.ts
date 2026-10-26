import { InvalidProductionRequestError, type UnitRun } from "../../application";
import type { ProductionJson } from "../../common";
import type { PreparedChapter } from "./contracts";
import type { ChapterAcceptanceAssessmentResult } from "../../../../services/novel/runtime/ChapterAcceptanceAssessmentService";

/** DTO serialization converts service Date values to wire dates and omits optional undefined fields. */
export const stageWireData = (value: unknown): ProductionJson => JSON.parse(JSON.stringify(value)) as ProductionJson;
export function preparedChapter(run: UnitRun): PreparedChapter {
  const value = run.artifacts.prepared as unknown as PreparedChapter;
  if (!value?.baseline?.updatedAt || !value.contextPackage || !value.novelTitle || !value.chapterTitle) {
    throw new InvalidProductionRequestError("Prepared chapter snapshot is missing");
  }
  return value;
}
export function savedAssessment(run: UnitRun, stage: "accept" | "verify"): ChapterAcceptanceAssessmentResult {
  const value = run.artifacts.stageData?.[stage] as unknown as ChapterAcceptanceAssessmentResult;
  if (!value?.assessment) throw new InvalidProductionRequestError("Saved acceptance assessment is missing");
  return value;
}
