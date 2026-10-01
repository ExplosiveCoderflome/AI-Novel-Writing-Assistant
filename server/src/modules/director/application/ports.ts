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

export interface RunRepository {
  open(contract: RunContract): Promise<RunControl>;
  getContract(runId: string): Promise<RunContract | null>;
  getControl(runId: string): Promise<RunControl | null>;
  findActiveRunIdByNovel(novelId: string): Promise<string | null>;
  transition(runId: string, event: RunEvent, expectedVersion: number): Promise<RunControl>;
  acquireLease(runId: string, owner: string, leaseExpiresAt: Date, now: Date): Promise<boolean>;
  heartbeat(runId: string, owner: string, leaseExpiresAt: Date, now: Date): Promise<boolean>;
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
