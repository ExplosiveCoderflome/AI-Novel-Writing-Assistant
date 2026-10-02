import type { FactsSnapshot, RunContract, RunControl, StepDefinition, StopSignal } from "../domain";

export interface StepContext {
  runId: string;
  contract: RunContract;
  control: RunControl;
  facts: FactsSnapshot;
  step: StepDefinition;
}

export interface StepResult {
  artifact?: {
    scope: string;
    status: "draft" | "confirmed" | "user_edited";
    protectedUserContent: boolean;
    contentRef: string;
    contentHash: string | null;
  };
  debt?: { chapterOrder: number; code: string; action: string };
  debts?: readonly { chapterOrder: number; code: string; action: string }[];
  stopSignal?: StopSignal;
  tokensUsed?: number;
}

export type StepHandler = (context: StepContext) => Promise<StepResult>;

export class MissingStepImplementationError extends Error {
  constructor(readonly stepId: string) {
    super(`director step implementation not found: ${stepId}`);
    this.name = "MissingStepImplementationError";
  }
}

export class StepRegistry {
  private readonly handlers = new Map<string, StepHandler>();

  register(stepId: string, handler: StepHandler): void {
    if (this.handlers.has(stepId)) {
      throw new Error(`director step implementation already registered: ${stepId}`);
    }
    this.handlers.set(stepId, handler);
  }

  get(stepId: string): StepHandler {
    const handler = this.handlers.get(stepId);
    if (!handler) throw new MissingStepImplementationError(stepId);
    return handler;
  }
}
