import { decideNext } from "./decideNext";
import { defineProfile } from "./profile";
import { applyStageResult, applyUnitAction, InvalidUnitTransitionError } from "./unitMachine";
import type { IssuePolicySnapshot, ProductionProfile, StageResult, UnitAction, UnitProgress } from "./types";

export interface DecisionReplayFixture {
  profile: ProductionProfile;
  policy: IssuePolicySnapshot;
  progress: UnitProgress;
  results: ReadonlyArray<StageResult>;
}
/** Replays supplied structured results; it performs no generation or persistence. */
export function replayDecisions(fixture: DecisionReplayFixture): UnitAction[] {
  const profile = defineProfile(fixture.profile);
  let progress = fixture.progress;
  let cursor = 0;
  const actions: UnitAction[] = [];
  for (let step = 0; step < 128; step++) {
    const action = decideNext({profile,policy:fixture.policy,unit:progress});
    actions.push(action);
    if (action.kind === "run_stage") {
      const result = fixture.results[cursor++];
      if (!result || result.stage !== action.stage) throw new InvalidUnitTransitionError("Replay result does not match requested stage.");
      progress = applyStageResult(progress,result);
    } else if (action.kind === "select_final" || action.kind === "record_debt") {
      progress = applyUnitAction(progress,action);
    } else {
      if (cursor !== fixture.results.length) throw new InvalidUnitTransitionError("Replay contains unused results.");
      return actions;
    }
  }
  throw new InvalidUnitTransitionError("Replay did not reach a terminal decision.");
}
