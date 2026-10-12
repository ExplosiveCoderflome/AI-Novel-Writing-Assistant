import {
  CommandService,
  FactsLoader,
  ProjectionService,
  RunExecutor,
  StepRegistry,
  createDirectorRuntime,
  automaticRecoveryBudget,
  DirectorWorker,
  type PlanRegistry,
  type CommandServiceDeps,
  GateService,
  type ProjectionServiceDeps,
} from "./application";
import { definePlan, createPlanOrchestrator, createGateOrchestrator, type PlanDefinition, type RunContract } from "./domain";
import {
  PrismaArtifactLedger,
  PrismaCommandRepository,
  PrismaEventLog,
  PrismaQualityDebtRepository,
  PrismaRunRepository,
  type ArtifactEditReader,
  type BusinessResume,
  type RunOpenBoundary,
} from "./infrastructure";
import type { DirectorNextHttpDeps } from "./http";

const defaultPlan: PlanDefinition = definePlan({
  version: "director-next-v1",
  externalArtifacts: ["novel_seed"],
  steps: [
    { id: "story_macro", label: "故事宏观规划", requires: ["novel_seed"], produces: "story_macro", needs: ["structured_output"], gateable: true, overwrites: [] },
    { id: "character_cast", label: "角色阵容", requires: ["story_macro"], produces: "character_cast", needs: ["structured_output"], gateable: true, overwrites: [] },
    { id: "volume_strategy", label: "卷战略", requires: ["story_macro", "character_cast"], produces: "volume_strategy", needs: [], gateable: true, overwrites: [] },
    { id: "chapter_list", label: "章节列表", requires: ["volume_strategy"], produces: "chapter_list", needs: [], gateable: true, overwrites: [] },
  ],
});

const planRegistry: PlanRegistry = {
  get: (version) => (version === defaultPlan.version ? defaultPlan : null),
};

function contractFactory(input: {
  runId: string;
  novelId: string;
  driver: RunContract["driver"];
  stepIdsInScope: string[] | null;
  launchInput?: RunContract["launchInput"];
}): RunContract {
  return {
    runId: input.runId,
    novelId: input.novelId,
    driver: input.driver,
    planVersion: defaultPlan.version,
    scope: "book",
    stepIdsInScope: input.stepIdsInScope ? [...input.stepIdsInScope] : null,
    chapterRange: input.launchInput?.executionRange ?? null,
    issuePolicy: { mode: input.launchInput?.issuePolicyMode ?? "completion_first", version: "director-next-default" },
    modelConfig: { route: input.launchInput?.provider ?? "default", model: input.launchInput?.model ?? "default", version: "director-next-default" },
    tokenBudget: null,
    rejectionBudget: 3,
    ...(input.launchInput ? {launchInput: input.launchInput} : {}),
  };
}

export interface DirectorNextServices {
  http: DirectorNextHttpDeps;
  worker: DirectorWorker;
}

export interface DirectorNextServiceOptions {
  executionBoundary?: {
    beforeOpen: RunOpenBoundary;
    assertRun: (runId: string) => Promise<void>;
    canRun: (runId: string) => Promise<boolean>;
  };
  plan?: PlanDefinition;
  stepRegistry?: StepRegistry;
  contractFactory?: CommandServiceDeps["contractFactory"];
  prepareOpen?: CommandServiceDeps["prepareOpen"];
  readEditedArtifact?: ArtifactEditReader;
  resumeBusiness?: BusinessResume;
  cancelBusiness?: BusinessResume;
  artifactTypes?: ProjectionServiceDeps["artifactTypes"];
  resolveArtifactTypes?: ProjectionServiceDeps["resolveArtifactTypes"];
  readProductionProjection?: ProjectionServiceDeps["readProductionProjection"];
  sourceRoute?: ProjectionServiceDeps["sourceRoute"];
}

export function createDirectorNextServices(options: DirectorNextServiceOptions = {}): DirectorNextServices {
  const runRepository = new PrismaRunRepository(undefined, options.executionBoundary?.beforeOpen);
  const artifactLedger = new PrismaArtifactLedger();
  const qualityDebtRepository = new PrismaQualityDebtRepository();
  const eventLog = new PrismaEventLog();
  const commandRepository = new PrismaCommandRepository(undefined, {readEditedArtifact: options.readEditedArtifact, resumeBusiness: options.resumeBusiness, cancelBusiness: options.cancelBusiness});
  const runtime = createDirectorRuntime();
  const factsLoader = new FactsLoader({ runRepository, artifactLedger, qualityDebtRepository, eventLog });
  const configuredPlans: PlanRegistry = {get: version => options.plan?.version === version ? options.plan : planRegistry.get(version)};
  const projectionService = new ProjectionService({ factsLoader, planRegistry: configuredPlans, artifactTypes: options.artifactTypes,
    resolveArtifactTypes: options.resolveArtifactTypes, readProductionProjection: options.readProductionProjection, sourceRoute: options.sourceRoute });
  const gateService = new GateService({factsLoader, planRegistry: configuredPlans});
  const commandService = new CommandService({ runRepository, commandRepository, runtime, contractFactory: options.contractFactory ?? contractFactory, prepareOpen: options.prepareOpen, gateService });
  const stepRegistry = options.stepRegistry ?? new StepRegistry();
  const executor = new RunExecutor({
    factsLoader,
    planRegistry: configuredPlans,
    orchestrator: createPlanOrchestrator(),
    assistedOrchestrator: createGateOrchestrator(),
    runRepository,
    artifactLedger,
    qualityDebtRepository,
    eventLog,
    stepRegistry,
  });
  const worker = new DirectorWorker({
    runRepository,
    executor: options.executionBoundary ? {runOnce: async runId => {
      await options.executionBoundary!.assertRun(runId);
      return executor.runOnce(runId);
    }} : executor,
    canExecute: options.executionBoundary?.canRun,
    runtime,
    eventLog,
    recoveryPolicy: { maxAttempts: automaticRecoveryBudget },
  });
  return { http: { commandService, projectionService, runRepository, eventLog }, worker };
}

let singleton: DirectorNextServices | null = null;

export function getDirectorNextServices(): DirectorNextServices {
  singleton ??= createDirectorNextServices();
  return singleton;
}
