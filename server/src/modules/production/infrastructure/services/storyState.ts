import { InvalidProductionRequestError, type StagePort, type StoryStatePort } from "../../application";

export function createStoryStatePort(deps: { read: StoryStatePort["read"]; reconciliation: Pick<StagePort, "execute"> }): StoryStatePort {
  return { read: deps.read, async reconcile(run) {
    if (run.activeStage !== "reconcile" || !run.activeRequestKey || !run.artifacts.activeDescriptor) {
      throw new InvalidProductionRequestError("Story-state reconciliation requires the saved stage claim and descriptor");
    }
    return deps.reconciliation.execute(run, { ...run.artifacts.activeDescriptor, requestKey: run.activeRequestKey });
  } };
}
