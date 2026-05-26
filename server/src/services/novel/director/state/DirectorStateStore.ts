import type { DirectorArtifactRef } from "@ai-novel/shared/types/directorRuntime";
import { DirectorStateReader, type DirectorCanonicalState } from "./DirectorStateReader";
import { DirectorStateCommitter } from "./DirectorStateCommitter";

export class DirectorStateStore {
  private readonly reader: DirectorStateReader;
  private readonly committer: DirectorStateCommitter;

  constructor(input: {
    reader?: DirectorStateReader;
    committer?: DirectorStateCommitter;
  } = {}) {
    this.reader = input.reader ?? new DirectorStateReader();
    this.committer = input.committer ?? new DirectorStateCommitter();
  }

  readTaskState(taskId: string): Promise<DirectorCanonicalState | null> {
    return this.reader.readByTaskId(taskId);
  }

  recordPipelineDispatch(input: {
    taskId: string;
    novelId?: string | null;
    runtimeId?: string | null;
    commandType: string;
    summary: string;
  }): Promise<void> {
    return this.committer.recordPipelineDispatch(input);
  }

  markRuntimeWaitingGate(input: {
    runtimeId?: string | null;
    taskId: string;
    novelId?: string | null;
    message: string;
  }): Promise<void> {
    return this.committer.markRuntimeWaitingGate(input);
  }

  recordArtifactsIndexed(input: {
    taskId: string;
    novelId?: string | null;
    runtimeId?: string | null;
    nodeKey: string;
    artifacts: DirectorArtifactRef[];
  }): Promise<void> {
    return this.committer.recordArtifactsIndexed(input);
  }

  recordRecoveryHint(input: {
    taskId: string;
    novelId?: string | null;
    runtimeId?: string | null;
    nodeKey: string;
    reason: string;
    resumeFrom?: string | null;
  }): Promise<void> {
    return this.committer.recordRecoveryHint(input);
  }
}
