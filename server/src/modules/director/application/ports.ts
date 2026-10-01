import type {
  ArtifactRef,
  ArtifactStatus,
  ArtifactType,
  QualityDebtRef,
  RunContract,
  RunControl,
  PlanDefinition,
} from "../domain";
import type { RunEvent } from "../domain/control";

export interface PlanRegistry {
  get(version: string): PlanDefinition | null;
}

export type DirectorCommandType = "open_run" | "resolve_gate" | "resume" | "handoff" | "cancel";

export interface DirectorCommandRecord {
  id: string;
  idempotencyKey: string;
  runId: string;
  type: DirectorCommandType;
  payload: unknown;
  result: unknown;
}

export interface CommandExecutionInput {
  id: string;
  idempotencyKey: string;
  type: DirectorCommandType;
  payload: unknown;
}

export interface CommandTransitionInput extends CommandExecutionInput {
  runId: string;
  event: RunEvent;
  expectedVersion: number;
}

export interface CommandOpenRunInput extends CommandExecutionInput {
  runId: string;
  contract: RunContract;
}

export interface CommandHandoffInput extends CommandExecutionInput {
  oldRunId: string;
  oldExpectedVersion: number;
  newRunId: string;
  newContract: RunContract;
}

export interface CommandRepository {
  find(idempotencyKey: string): Promise<DirectorCommandRecord | null>;
  openRun(input: CommandOpenRunInput): Promise<{ runId: string; control: RunControl; commandId: string; replayed: boolean }>;
  transition(input: CommandTransitionInput): Promise<{ runId: string; control: RunControl; commandId: string; replayed: boolean }>;
  handoff(input: CommandHandoffInput): Promise<{ runId: string; control: RunControl; commandId: string; replayed: boolean }>;
}

export interface DirectorRuntime {
  nextId(): string;
}

export interface DirectorWorkerRuntime extends DirectorRuntime {
  workerId(): string;
  now(): Date;
  leaseExpiresAt(now: Date): Date;
  enabled(): boolean;
}

export interface RunRepository {
  open(contract: RunContract): Promise<RunControl>;
  getContract(runId: string): Promise<RunContract | null>;
  getControl(runId: string): Promise<RunControl | null>;
  findActiveRunIdByNovel(novelId: string): Promise<string | null>;
  transition(runId: string, event: RunEvent, expectedVersion: number): Promise<RunControl>;
  acquireLease(runId: string, owner: string, leaseExpiresAt: Date, now: Date): Promise<boolean>;
  heartbeat(runId: string, owner: string, leaseExpiresAt: Date, now: Date): Promise<boolean>;
  listLeaseCandidates(now: Date, limit: number): Promise<string[]>;
  listExpiredLeases(now: Date): Promise<string[]>;
}

export interface ArtifactLedger {
  listByNovel(novelId: string): Promise<ArtifactRef[]>;
  record(input: {
    novelId: string;
    type: ArtifactType;
    scope: string;
    status: ArtifactStatus;
    protectedUserContent: boolean;
    contentRef: string;
    contentHash: string | null;
    producedByRunId: string;
  }): Promise<ArtifactRef>;
  markStale(novelId: string, types: readonly ArtifactType[]): Promise<number>;
}

export interface QualityDebtRepository {
  record(input: {
    novelId: string;
    runId: string;
    chapterOrder: number;
    code: string;
    action: string;
  }): Promise<void>;
  listByNovel(novelId: string): Promise<QualityDebtRef[]>;
}

export interface EventLog {
  append(input: {
    runId: string;
    type: string;
    payload: unknown;
    promptVersion?: string;
    model?: string;
  }): Promise<void>;
  list(runId: string): Promise<Array<{
    seq: number;
    type: string;
    payload: unknown;
    createdAt: Date;
  }>>;
}
