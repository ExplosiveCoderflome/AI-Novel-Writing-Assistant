import { cloneProductionData } from "../common";
import { applyStageResult, InvalidUnitTransitionError, selectCandidate } from "../domain";
import type { StageReply, UnitRun, UnitRunUpdate } from "./ports";
import { hashProductionContent } from "./requestIdentity";

export function selectionReply(run: UnitRun): StageReply {
  const { original, candidate } = run.progress;
  if (!original?.verdict || !candidate?.verdict) throw new InvalidUnitTransitionError("Selection requires both verdicts");
  return { result: { stage: "select", selection: selectCandidate(original.verdict, candidate.verdict) } };
}
export function stageResultUpdate(run: UnitRun, reply: StageReply): UnitRunUpdate {
  if (reply.result.stage !== run.activeStage || !run.activeRequestKey) throw new InvalidUnitTransitionError("Stage claim mismatch");
  const result = reply.result;
  const artifacts = cloneProductionData({ ...run.artifacts, ...reply.artifacts });
  if (reply.artifacts?.stageData) artifacts.stageData = { ...run.artifacts.stageData, ...reply.artifacts.stageData };
  const hash = (content: string | undefined): string | null => content === undefined || !content.trim() ? null : hashProductionContent(content);
  if (result.stage === "draft" && hash(artifacts.original) !== result.contentHash) {
    throw new InvalidUnitTransitionError("Draft artifact does not match its content hash");
  }
  if (result.stage === "repair" && result.outcome === "candidate" && hash(artifacts.candidate) !== result.contentHash) {
    throw new InvalidUnitTransitionError("Candidate artifact does not match its content hash");
  }
  // Later stages may add context/results, but can never silently replace a saved manuscript.
  if (run.artifacts.original !== undefined && artifacts.original !== run.artifacts.original) throw new InvalidUnitTransitionError("Original artifact is immutable");
  if (run.artifacts.candidate !== undefined && artifacts.candidate !== run.artifacts.candidate) throw new InvalidUnitTransitionError("Candidate artifact is immutable");
  if (reply.chapterWrite && (result.stage !== "commit" || hash(reply.chapterWrite.content) !== run.progress.selectedContentHash)) {
    throw new InvalidUnitTransitionError("Chapter write must match the selected manuscript");
  }
  const progress = applyStageResult(run.progress, result);
  artifacts.receipts = { ...artifacts.receipts, [result.stage]: { requestKey: run.activeRequestKey, result } };
  delete artifacts.activeDescriptor;
  delete artifacts.deferredDescriptor;
  return { progress, artifacts, activeStage: null, activeRequestKey: null };
}
