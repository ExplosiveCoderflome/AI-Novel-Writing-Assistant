import type { Prisma } from "@prisma/client";
import type { UnitRun } from "../../application";
import type { ProductionJson } from "../../common";
import type { ChapterStageServices, PreparedChapter } from "../stages";
import type { PrismaPreparationCheckpointStore } from "./checkpointStore";

export interface PreparedPreparationRequest {
  identity: string;
  input: ProductionJson;
  outputTokens: number;
}
export interface PreparationSteps {
  /** Read a successful commit receipt without claiming or replaying its business operation. */
  committed(key: string): Promise<ProductionJson | undefined>;
  /** Read-only source preparation; saved before the request can be claimed. */
  read(key: string, load: () => Promise<ProductionJson>): Promise<ProductionJson>;
  model(key: string, request: PreparedPreparationRequest,
    invoke: (saved: PreparedPreparationRequest, requestKey: string) => Promise<ProductionJson>): Promise<ProductionJson>;
  /** All business writes and the result receipt share the caller-owned transaction. */
  commit(key: string, write: (tx: Prisma.TransactionClient) => Promise<ProductionJson>): Promise<ProductionJson>;
}
export interface KernelPreparationStageDependencies {
  purpose: ChapterStageServices["purpose"];
  checkpoints: PrismaPreparationCheckpointStore;
  executionToken(run: UnitRun): string;
  readBaseline: ChapterStageServices["readBaseline"];
  readInput(run: UnitRun): Promise<ProductionJson>;
  execute(run: UnitRun, input: ProductionJson, steps: PreparationSteps): Promise<Omit<PreparedChapter, "baseline">>;
  fence(run: UnitRun): Promise<void>;
}
export class PreparationRequestUnresolvedError extends Error {
  constructor() { super("Preparation request is not resolved"); this.name = "PreparationRequestUnresolvedError"; }
}
