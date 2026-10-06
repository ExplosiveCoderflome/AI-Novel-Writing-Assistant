import {downstreamArtifactTypes, latestArtifact, VersionConflictError} from "../domain";
import type {FactsLoader} from "./factsLoader";
import type {GateResolution, PlanRegistry} from "./ports";

export class GateResolutionError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {super(message); this.name = "GateResolutionError";}
}
/** Prepares pure invalidation policy; repository commits ledger, control and command together. */
export class GateService {
  constructor(private readonly deps: {factsLoader: Pick<FactsLoader, "load">; planRegistry: PlanRegistry}) {}
  async prepare(runId: string, decision: GateResolution["decision"], expectedVersion: number): Promise<GateResolution> {
    const {contract, control, facts} = await this.deps.factsLoader.load(runId);
    if (control.version !== expectedVersion) throw new VersionConflictError(expectedVersion, control.version);
    if (control.status !== "waiting_gate" || !control.gate?.artifactTypes.length) throw new GateResolutionError("请先打开需要确认的创作阶段。");
    const plan = this.deps.planRegistry.get(contract.planVersion);
    if (!plan) throw new GateResolutionError("缺少本次运行的创作计划。");
    const artifacts = control.gate.artifactTypes.map(type => {
      const step = plan.steps.find(step => step.produces === type && step.gateable);
      const artifact = latestArtifact(facts, type, contract.scope);
      if (!step || (contract.stepIdsInScope && !contract.stepIdsInScope.includes(step.id)) || !artifact || artifact.status === "stale") throw new GateResolutionError("需要确认的资产已变化，请刷新创作页面。");
      if (decision === "regenerate" && artifact.protectedUserContent) throw new GateResolutionError("该资产包含需保留的内容，请先在资产页面查看并保存调整。");
      return {type, expectedVersion: artifact.version};
    });
    const invalidated = decision === "confirm" ? [] : [...new Set(artifacts.flatMap(artifact => downstreamArtifactTypes(plan, artifact.type)))];
    const invalidateTypes = [...new Set([...invalidated, ...(decision === "regenerate" ? artifacts.map(artifact => artifact.type) : [])])]
      .filter(type => type !== "chapter_draft" && (decision === "regenerate" || !artifacts.some(artifact => artifact.type === type)));
    return {decision, scope: contract.scope, artifacts, invalidateTypes};
  }
}
