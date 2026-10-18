import { project, type ArtifactType, type ArtifactTypeInfo, type DashboardView, type RunContract, type RunControl, type ProductionProjection } from "../domain";
import type { FactsLoader } from "./factsLoader";
import type { PlanRegistry } from "./ports";
import type {DirectorWorkerHealth} from "./worker";
import type {RunRepository} from "./ports";
import {projectQueuedRun} from "./scheduling";

export class UnknownPlanVersionError extends Error {
  constructor(readonly version: string) {
    super(`director next plan version not found: ${version}`);
    this.name = "UnknownPlanVersionError";
  }
}

export interface ProjectionServiceDeps {
  factsLoader: Pick<FactsLoader, "load">;
  planRegistry: PlanRegistry;
  artifactTypes?: Readonly<Record<ArtifactType, ArtifactTypeInfo>>;
  /** Read-only business adapter resolves saved asset identities before pure projection. */
  resolveArtifactTypes?: (input: {contract: RunContract; control: RunControl}) => Promise<Readonly<Record<ArtifactType, ArtifactTypeInfo>>>;
  readProductionProjection?: (input: {contract: RunContract; control: RunControl}) => Promise<ProductionProjection>;
  sourceRoute?: (novelId: string) => string;
  readScheduling?: RunRepository["getSchedulingState"];
  readWorkerHealth?: () => DirectorWorkerHealth;
  now?: () => Date;
}

export class ProjectionService {
  constructor(private readonly deps: ProjectionServiceDeps) {}

  async get(runId: string): Promise<DashboardView> {
    const { contract, control, facts, executionFailure, actionRejection } = await this.deps.factsLoader.load(runId);
    const plan = this.deps.planRegistry.get(contract.planVersion);
    if (!plan) {
      throw new UnknownPlanVersionError(contract.planVersion);
    }
    const sourceRoute=this.deps.sourceRoute?.(contract.novelId) ?? `/lab/director/${encodeURIComponent(contract.novelId)}`;
    const artifactTypes = this.deps.resolveArtifactTypes
      ? await this.deps.resolveArtifactTypes({contract, control}) : this.deps.artifactTypes ?? {};
    const view = project({
      contract,
      control,
      plan,
      facts,
      executionFailure,
      actionRejection,
      artifactTypes: Object.fromEntries(Object.entries(artifactTypes).map(([type,info]) => [type,{
        ...info,
        reviewRoute: info.reviewRoute.replace(":novelId", encodeURIComponent(contract.novelId))
          || sourceRoute,
      }])),
      sourceRoute,
      production: await this.deps.readProductionProjection?.({contract, control}),
    });
    if (view.mode !== "queued" || !this.deps.readScheduling || !this.deps.readWorkerHealth) return view;
    const scheduling = await this.deps.readScheduling(runId);
    return scheduling ? projectQueuedRun(view, scheduling, this.deps.readWorkerHealth(), this.deps.now?.() ?? new Date()) : view;
  }
}
