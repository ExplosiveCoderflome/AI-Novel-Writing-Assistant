import {
  CommandService,
  FactsLoader,
  ProjectionService,
  RunExecutor,
  StepRegistry,
  createDirectorRuntime,
  DirectorWorker,
  type PlanRegistry,
} from "./application";
import { definePlan, createPlanOrchestrator, type PlanDefinition, type RunContract } from "./domain";
import {
  PrismaArtifactLedger,
  PrismaCommandRepository,
  PrismaEventLog,
  PrismaQualityDebtRepository,
  PrismaRunRepository,
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

export function createDirectorNextServices(): DirectorNextServices {
  const runRepository = new PrismaRunRepository();
  const artifactLedger = new PrismaArtifactLedger();
  const qualityDebtRepository = new PrismaQualityDebtRepository();
  const eventLog = new PrismaEventLog();
  const commandRepository = new PrismaCommandRepository();
  const runtime = createDirectorRuntime();
  const factsLoader = new FactsLoader({ runRepository, artifactLedger, qualityDebtRepository, eventLog });
  const projectionService = new ProjectionService({ factsLoader, planRegistry });
  const commandService = new CommandService({ runRepository, commandRepository, runtime, contractFactory });
  const stepRegistry = new StepRegistry();
  const executor = new RunExecutor({
    factsLoader,
    planRegistry,
    orchestrator: createPlanOrchestrator(),
    runRepository,
    artifactLedger,
    qualityDebtRepository,
    eventLog,
    stepRegistry,
  });
  const worker = new DirectorWorker({
    runRepository,
    executor,
    runtime,
    eventLog,
    recoveryPolicy: { maxAttempts: () => 1 },
  });
  return { http: { commandService, projectionService, runRepository, eventLog }, worker };
}

let singleton: DirectorNextServices | null = null;

export function getDirectorNextServices(): DirectorNextServices {
  singleton ??= createDirectorNextServices();
  return singleton;
}
