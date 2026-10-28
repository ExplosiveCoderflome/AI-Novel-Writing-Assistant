import type { StageResult, UnitAction, UnitProgress } from "./types";
import { selectCandidate } from "./candidateSelection";

export class InvalidUnitTransitionError extends Error {
  constructor(message: string) { super(message); this.name = "InvalidUnitTransitionError"; }
}
const requireState = (condition: unknown, message: string): void => {
  if (!condition) throw new InvalidUnitTransitionError(message);
};
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter(key => left[key] !== undefined).sort();
  const other = Object.keys(right).filter(key => right[key] !== undefined).sort();
  return keys.length === other.length && keys.every((key,index) => key === other[index] && equal(left[key],right[key]));
}
function selectedHash(progress: UnitProgress): string | undefined {
  return progress.selected ? progress[progress.selected]?.contentHash : undefined;
}
function assertSelection(progress: UnitProgress): void {
  requireState(progress.selected && progress.selectedContentHash
    && selectedHash(progress) === progress.selectedContentHash, "Final selection is missing or stale.");
}
export function applyUnitAction(progress: UnitProgress, action: UnitAction): UnitProgress {
  if (action.kind === "record_quality_pause" || action.kind === "acknowledge_quality_pause") {
    assertSelection(progress);
    requireState(progress.completed.includes("commit") && !progress.userEditedSinceStart
      && action.contentHash === progress.committedContentHash && action.contentHash === progress.selectedContentHash,
    "Quality recovery requires the unchanged saved manuscript.");
    if (action.kind === "acknowledge_quality_pause") {
      requireState(progress.qualityPause?.contentHash === action.contentHash, "Only an existing manual quality pause can be acknowledged.");
      return {...progress,qualityPause:{...progress.qualityPause!,acknowledged:true}};
    }
    if (progress.qualityPause) {
      requireState(progress.qualityPause.contentHash === action.contentHash && progress.qualityPause.reason === action.reason, "Conflicting quality pause.");
      return progress;
    }
    return {...progress,qualityPause:{contentHash:action.contentHash,reason:action.reason,acknowledged:false}};
  }
  if (action.kind === "select_final") {
    requireState(progress.completed.includes("prepare") && !progress.userEditedSinceStart, "Selection cannot precede preparation or override edits.");
    requireState(action.selected === "original" && !progress.candidate, "Candidates require verified selection stage.");
    requireState(action.contentHash && progress.original?.contentHash === action.contentHash, "Selection content identity differs.");
    if (progress.selected) {
      requireState(progress.selected === action.selected && progress.selectedContentHash === action.contentHash
        && progress.selectionReasonCode === action.reasonCode, "Conflicting selection.");
      return progress;
    }
    return {...progress,selected:action.selected,selectedContentHash:action.contentHash,selectionReasonCode:action.reasonCode};
  }
  if (action.kind === "record_debt") {
    assertSelection(progress);
    requireState(!progress.completed.includes("commit"), "Cannot change committed debt.");
    if (progress.debtRecorded) {
      requireState(equal(progress.debts,action.debts), "Conflicting debt record.");
      return progress;
    }
    return {...progress,debts:action.debts.map(debt => ({...debt})),debtRecorded:true};
  }
  throw new InvalidUnitTransitionError("Action is not a persistable domain transition.");
}
export function applyStageResult(progress: UnitProgress, result: StageResult): UnitProgress {
  const completed = progress.completed;
  const has = (stage: StageResult["stage"]) => completed.includes(stage);
  if (has(result.stage)) {
    const saved = progress.stageResults?.[result.stage];
    const equivalent = saved ? equal(saved,result)
      : result.stage === "prepare" || (result.stage === "accept" && equal(progress.original?.verdict,result.verdict))
      || (result.stage === "commit" && progress.committedContentHash === result.contentHash);
    requireState(equivalent, "Conflicting replay of completed stage.");
    return progress;
  }
  let change: Partial<UnitProgress> = {};
  if (result.stage !== "prepare") requireState(has("prepare"), "Preparation must finish first.");
  if (has("commit")) requireState(result.stage === "reconcile", "Committed prose cannot reenter generation.");
  switch (result.stage) {
    case "prepare": break;
    case "draft":
      requireState(!progress.original && !has("accept"), "Draft cannot overwrite existing prose.");
      if (result.contentHash) change.original = {contentHash:result.contentHash};
      break;
    case "accept":
      requireState(progress.original?.contentHash === result.verdict.contentHash, "Original assessment identity differs.");
      change.original = {...progress.original!,verdict:result.verdict};
      break;
    case "repair":
      requireState(has("accept") && progress.original && !progress.selected, "Repair needs accepted original and undecided selection.");
      requireState(progress.repairAttemptsUsed <= 1, "Invalid repair count.");
      change = {repairAttemptsUsed:1,repairOutcome:result.outcome};
      if (result.outcome === "candidate") {
        requireState(result.contentHash && result.contentHash !== progress.original?.contentHash, "Candidate must contain changed prose.");
        change.candidate = {contentHash:result.contentHash};
      } else if (result.failureCode !== undefined) change.repairFailureCode = result.failureCode;
      break;
    case "verify":
      requireState(has("repair") && progress.candidate?.contentHash === result.verdict.contentHash, "Candidate assessment identity differs.");
      change.candidate = {...progress.candidate!,verdict:result.verdict};
      break;
    case "select": {
      requireState(has("verify") && progress.candidate && !progress.selected, "Select needs verified candidate.");
      requireState(progress.original?.verdict && progress.candidate?.verdict, "Selection needs both assessments.");
      requireState(equal(selectCandidate(progress.original!.verdict!, progress.candidate!.verdict!), result.selection),
        "Selection result conflicts with verified candidate safety.");
      const selected = progress[result.selection.selected];
      requireState(selected?.contentHash === result.selection.contentHash, "Selected content identity differs.");
      change = {selected:result.selection.selected,selectedContentHash:result.selection.contentHash,selectionReasonCode:result.selection.reasonCode};
      break;
    }
    case "commit":
      requireState(!progress.userEditedSinceStart, "User edited prose.");
      assertSelection(progress);
      requireState(!progress.candidate || has("select"), "Candidate selection is incomplete.");
      requireState(progress.selectedContentHash === result.contentHash, "Committed content identity differs.");
      change.committedContentHash = result.contentHash;
      break;
    case "reconcile":
      requireState(has("commit"), "Reconciliation needs committed prose.");
      change.reconcileStatus = result.status;
      break;
  }
  const finished = result.stage !== "reconcile" || result.status === "completed" || result.status === "degraded";
  return {...progress,...change,completed:finished ? [...completed,result.stage] : [...completed],
    stageResults:{...progress.stageResults,[result.stage]:result}};
}
