import type {
  ArtifactRef,
  ArtifactType,
  FactsSnapshot,
  PlanDefinition,
  StepDefinition,
} from "./types";

export class PlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanValidationError";
  }
}

export function definePlan(input: PlanDefinition): PlanDefinition {
  const stepIds = new Set<string>();
  const producers = new Map<ArtifactType, string>();
  for (const step of input.steps) {
    if (!step.id.trim()) {
      throw new PlanValidationError("step id must not be empty");
    }
    if (stepIds.has(step.id)) {
      throw new PlanValidationError(`duplicate step id: ${step.id}`);
    }
    stepIds.add(step.id);
    const existing = producers.get(step.produces);
    if (existing) {
      throw new PlanValidationError(
        `artifact type ${step.produces} is produced by both ${existing} and ${step.id}`,
      );
    }
    producers.set(step.produces, step.id);
  }

  const external = new Set(input.externalArtifacts);
  const isKnownType = (type: ArtifactType) => producers.has(type) || external.has(type);
  for (const step of input.steps) {
    for (const type of step.requires) {
      if (!isKnownType(type)) {
        throw new PlanValidationError(`step ${step.id} requires unknown artifact type ${type}`);
      }
    }
    for (const type of step.overwrites) {
      if (!isKnownType(type)) {
        throw new PlanValidationError(`step ${step.id} overwrites unknown artifact type ${type}`);
      }
    }
  }

  const stepById = new Map(input.steps.map((step) => [step.id, step]));
  const visitState = new Map<string, "visiting" | "done">();
  const visit = (step: StepDefinition): void => {
    const state = visitState.get(step.id);
    if (state === "done") {
      return;
    }
    if (state === "visiting") {
      throw new PlanValidationError(`dependency cycle detected at step ${step.id}`);
    }
    visitState.set(step.id, "visiting");
    for (const type of step.requires) {
      const producerId = producers.get(type);
      const producer = producerId ? stepById.get(producerId) : undefined;
      if (producer) {
        visit(producer);
      }
    }
    visitState.set(step.id, "done");
  };
  for (const step of input.steps) {
    visit(step);
  }

  return Object.freeze({
    version: input.version,
    externalArtifacts: Object.freeze([...input.externalArtifacts]),
    steps: Object.freeze(input.steps.map((step) => Object.freeze({
      ...step,
      requires: Object.freeze([...step.requires]),
      needs: Object.freeze([...step.needs]),
      overwrites: Object.freeze([...step.overwrites]),
    }))),
  });
}

/**
 * Returns every transitive downstream type in plan order. The domain caller is
 * responsible for applying scope and protected-content guards to concrete refs.
 */
export function downstreamArtifactTypes(
  plan: PlanDefinition,
  changedType: ArtifactType,
): ArtifactType[] {
  const affected = new Set<ArtifactType>();
  const queue: ArtifactType[] = [changedType];
  while (queue.length > 0) {
    const current = queue.shift() as ArtifactType;
    for (const step of plan.steps) {
      if (step.requires.includes(current) && !affected.has(step.produces)) {
        affected.add(step.produces);
        queue.push(step.produces);
      }
    }
  }
  affected.delete(changedType);
  return plan.steps.map((step) => step.produces).filter((type) => affected.has(type));
}

export function latestArtifact(
  facts: FactsSnapshot,
  type: ArtifactType,
  scope: string,
): ArtifactRef | undefined {
  let latest: ArtifactRef | undefined;
  for (const artifact of facts.artifacts) {
    if (
      artifact.type === type
      && artifact.scope === scope
      && (!latest || artifact.version > latest.version)
    ) {
      latest = artifact;
    }
  }
  return latest;
}

export function isArtifactSatisfied(
  facts: FactsSnapshot,
  type: ArtifactType,
  scope: string,
  requireConfirmed: boolean,
): boolean {
  const artifact = latestArtifact(facts, type, scope);
  if (!artifact || artifact.status === "stale") {
    return false;
  }
  if (requireConfirmed) {
    return artifact.status === "confirmed" || artifact.status === "user_edited";
  }
  return true;
}

function stepsInScope(
  plan: PlanDefinition,
  stepIdsInScope: readonly string[] | null | undefined,
): StepDefinition[] {
  if (!stepIdsInScope) {
    return [...plan.steps];
  }
  const allowed = new Set(stepIdsInScope);
  return plan.steps.filter((step) => allowed.has(step.id));
}

export interface ReadyStepsOptions {
  scope: string;
  requireConfirmed: boolean;
  stepIdsInScope?: readonly string[] | null;
}

export function remainingSteps(
  plan: PlanDefinition,
  facts: FactsSnapshot,
  scope: string,
  stepIdsInScope?: readonly string[] | null,
): StepDefinition[] {
  return stepsInScope(plan, stepIdsInScope).filter(
    (step) => !isArtifactSatisfied(facts, step.produces, scope, false),
  );
}

export function readySteps(
  plan: PlanDefinition,
  facts: FactsSnapshot,
  options: ReadyStepsOptions,
): StepDefinition[] {
  return remainingSteps(plan, facts, options.scope, options.stepIdsInScope).filter((step) =>
    step.requires.every((type) => isArtifactSatisfied(facts, type, options.scope, options.requireConfirmed)),
  );
}

