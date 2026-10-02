import { project, type ArtifactType, type ArtifactTypeInfo, type DashboardView } from "../domain";
import type { FactsLoader } from "./factsLoader";
import type { PlanRegistry } from "./ports";

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
  sourceRoute?: (novelId: string) => string;
}

export class ProjectionService {
  constructor(private readonly deps: ProjectionServiceDeps) {}

  async get(runId: string): Promise<DashboardView> {
    const { contract, control, facts } = await this.deps.factsLoader.load(runId);
    const plan = this.deps.planRegistry.get(contract.planVersion);
    if (!plan) {
      throw new UnknownPlanVersionError(contract.planVersion);
    }
    return project({
      contract,
      control,
      plan,
      facts,
      artifactTypes: Object.fromEntries(Object.entries(this.deps.artifactTypes ?? {}).map(([type,info]) => [type,{...info,reviewRoute: info.reviewRoute || `/novels/${encodeURIComponent(contract.novelId)}/edit`}])),
      sourceRoute: this.deps.sourceRoute?.(contract.novelId) ?? `/novels/${encodeURIComponent(contract.novelId)}/edit`,
    });
  }
}
