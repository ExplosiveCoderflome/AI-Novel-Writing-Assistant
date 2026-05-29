import {
  inspectWorkflowStepFacts,
  isExecutableWorkflowStepModule,
  type StepExecutionContext,
  type WorkflowStepModule,
  type WorkflowStepReadiness,
} from "./WorkflowStepModule";
import type { DirectorStepFactInspection } from "@ai-novel/shared/types/directorRuntime";
import { directorWorkflowStepModuleRegistry } from "./directorWorkflowStepRegistry";

export class StepNotReadyError extends Error {
  constructor(
    readonly stepId: string,
    readonly readiness: WorkflowStepReadiness,
  ) {
    super(readiness.blockers[0]?.reason ?? `Step ${stepId} is not ready.`);
    this.name = "StepNotReadyError";
  }
}

export class StepBlockedError extends Error {
  constructor(
    readonly stepId: string,
    readonly reason: string,
  ) {
    super(reason);
    this.name = "StepBlockedError";
  }
}

function getExecutableStep(stepId: string): WorkflowStepModule<unknown, unknown> {
  const module = directorWorkflowStepModuleRegistry.get(stepId);
  if (!isExecutableWorkflowStepModule(module)) {
    throw new Error(`Step ${stepId} is not executable.`);
  }
  return module;
}

export class StepModuleRunner {
  async runStep<O = unknown>(
    stepId: string,
    context: StepExecutionContext,
  ): Promise<O> {
    const module = getExecutableStep(stepId);
    const readiness = await module.inspectReadiness(context);
    if (!readiness.ready) {
      throw new StepNotReadyError(stepId, readiness);
    }

    const input = await module.buildInput(context);
    const preconditions = module.validatePreconditions
      ? await module.validatePreconditions(input, context)
      : { status: "ready" as const };
    if (preconditions.status === "blocked") {
      throw new StepBlockedError(stepId, preconditions.reason);
    }
    if (preconditions.status === "needs_approval") {
      throw new StepBlockedError(stepId, preconditions.reason);
    }

    const output = await module.execute(input, context);
    const validation = module.validateOutput
      ? await module.validateOutput(output, context)
      : { valid: true };
    if (!validation.valid) {
      throw new Error(validation.reason || `${stepId} produced an invalid output.`);
    }
    if (module.commit) {
      await module.commit(output, context);
    }
    return output as O;
  }

  async inspectStep(
    stepId: string,
    context: StepExecutionContext,
  ): Promise<DirectorStepFactInspection> {
    const module = getExecutableStep(stepId);
    return inspectWorkflowStepFacts(module, context);
  }
}

export const stepModuleRunner = new StepModuleRunner();
