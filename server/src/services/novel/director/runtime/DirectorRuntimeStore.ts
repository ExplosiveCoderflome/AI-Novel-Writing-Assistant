import { randomUUID } from "node:crypto";
import type {
  DirectorArtifactRef,
  DirectorEvent,
  DirectorEventType,
  DirectorPolicyDecision,
  DirectorPolicyMode,
  DirectorRuntimePolicySnapshot,
  DirectorRuntimeSnapshot,
  DirectorStepRun,
  DirectorWorkspaceAnalysis,
} from "@ai-novel/shared/types/directorRuntime";
import { prisma } from "../../../../db/prisma";
import { withSqliteRetry } from "../../../../db/sqliteRetry";
import { parseSeedPayload } from "../../workflow/novelWorkflow.shared";
import type { DirectorWorkflowSeedPayload } from "../novelDirectorHelpers";
import { buildDefaultDirectorPolicy, buildEmptyDirectorRuntimeSnapshot } from "./directorRuntimeDefaults";

const MAX_RUNTIME_EVENTS = 120;
const MAX_RUNTIME_STEPS = 120;
const MAX_RUNTIME_ARTIFACTS = 160;

function stringifySeedPayload(payload: DirectorWorkflowSeedPayload): string {
  return JSON.stringify(payload);
}

function normalizeRuntimeSnapshot(input: {
  taskId: string;
  novelId?: string | null;
  seedPayload: DirectorWorkflowSeedPayload;
  entrypoint?: string | null;
  policyMode?: DirectorPolicyMode;
}): DirectorRuntimeSnapshot {
  const existing = input.seedPayload.directorRuntime;
  if (existing?.schemaVersion === 1 && existing.runId) {
    return {
      ...existing,
      runId: existing.runId || input.taskId,
      novelId: existing.novelId ?? input.novelId ?? input.seedPayload.novelId ?? null,
      policy: existing.policy ?? buildDefaultDirectorPolicy(input.policyMode),
      steps: Array.isArray(existing.steps) ? existing.steps : [],
      events: Array.isArray(existing.events) ? existing.events : [],
      artifacts: Array.isArray(existing.artifacts) ? existing.artifacts : [],
      updatedAt: existing.updatedAt ?? new Date().toISOString(),
    };
  }
  return buildEmptyDirectorRuntimeSnapshot({
    runId: input.taskId,
    novelId: input.novelId ?? input.seedPayload.novelId ?? null,
    entrypoint: input.entrypoint ?? null,
    policyMode: input.policyMode,
  });
}

function trimRuntimeSnapshot(snapshot: DirectorRuntimeSnapshot): DirectorRuntimeSnapshot {
  return {
    ...snapshot,
    steps: snapshot.steps.slice(-MAX_RUNTIME_STEPS),
    events: snapshot.events.slice(-MAX_RUNTIME_EVENTS),
    artifacts: snapshot.artifacts.slice(-MAX_RUNTIME_ARTIFACTS),
  };
}

function mergeArtifacts(existing: DirectorArtifactRef[], next: DirectorArtifactRef[]): DirectorArtifactRef[] {
  const byKey = new Map<string, DirectorArtifactRef>();
  for (const artifact of existing) {
    byKey.set(`${artifact.artifactType}:${artifact.targetType}:${artifact.targetId ?? ""}:${artifact.contentRef.table}:${artifact.contentRef.id}`, artifact);
  }
  for (const artifact of next) {
    byKey.set(`${artifact.artifactType}:${artifact.targetType}:${artifact.targetId ?? ""}:${artifact.contentRef.table}:${artifact.contentRef.id}`, artifact);
  }
  return [...byKey.values()];
}

function upsertStep(steps: DirectorStepRun[], next: DirectorStepRun): DirectorStepRun[] {
  const index = steps.findIndex((step) => step.idempotencyKey === next.idempotencyKey);
  if (index < 0) {
    return [...steps, next];
  }
  const merged = [...steps];
  merged[index] = {
    ...merged[index],
    ...next,
    producedArtifacts: next.producedArtifacts ?? merged[index].producedArtifacts,
  };
  return merged;
}

function compactPolicyPatch(
  patch: Partial<Omit<DirectorRuntimePolicySnapshot, "mode" | "updatedAt">> | undefined,
): Partial<Omit<DirectorRuntimePolicySnapshot, "mode" | "updatedAt">> {
  if (!patch) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<Omit<DirectorRuntimePolicySnapshot, "mode" | "updatedAt">>;
}

export class DirectorRuntimeStore {
  async getSnapshot(taskId: string): Promise<DirectorRuntimeSnapshot | null> {
    const row = await prisma.novelWorkflowTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        novelId: true,
        seedPayloadJson: true,
      },
    });
    if (!row) {
      return null;
    }
    const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(row.seedPayloadJson) ?? {};
    return normalizeRuntimeSnapshot({
      taskId: row.id,
      novelId: row.novelId,
      seedPayload,
    });
  }

  async mutateSnapshot(
    taskId: string,
    mutator: (snapshot: DirectorRuntimeSnapshot, seedPayload: DirectorWorkflowSeedPayload) => DirectorRuntimeSnapshot,
  ): Promise<DirectorRuntimeSnapshot | null> {
    const row = await prisma.novelWorkflowTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        novelId: true,
        seedPayloadJson: true,
      },
    });
    if (!row) {
      return null;
    }
    const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(row.seedPayloadJson) ?? {};
    const current = normalizeRuntimeSnapshot({
      taskId: row.id,
      novelId: row.novelId,
      seedPayload,
    });
    const nextRuntime = trimRuntimeSnapshot({
      ...mutator(current, seedPayload),
      updatedAt: new Date().toISOString(),
    });
    const nextPayload: DirectorWorkflowSeedPayload = {
      ...seedPayload,
      directorRuntime: nextRuntime,
    };
    await withSqliteRetry(
      () => prisma.novelWorkflowTask.update({
        where: { id: taskId },
        data: {
          seedPayloadJson: stringifySeedPayload(nextPayload),
        },
      }),
      { label: "directorRuntime.seedPayload.update" },
    );
    return nextRuntime;
  }

  async initializeRun(input: {
    taskId: string;
    novelId?: string | null;
    entrypoint: string;
    policyMode?: DirectorPolicyMode;
    summary?: string;
  }): Promise<DirectorRuntimeSnapshot | null> {
    return this.mutateSnapshot(input.taskId, (snapshot) => {
      const now = new Date().toISOString();
      const next = {
        ...snapshot,
        novelId: snapshot.novelId ?? input.novelId ?? null,
        entrypoint: snapshot.entrypoint ?? input.entrypoint,
        policy: snapshot.policy ?? buildDefaultDirectorPolicy(input.policyMode),
      };
      const hasStarted = next.events.some((event) => event.type === "run_started");
      return {
        ...next,
        events: hasStarted
          ? next.events
          : [
            ...next.events,
            this.buildEvent({
              type: "run_started",
              taskId: input.taskId,
              novelId: input.novelId ?? next.novelId ?? null,
              summary: input.summary ?? "自动导演运行已进入统一运行时。",
              occurredAt: now,
            }),
          ],
      };
    });
  }

  async recordStepStarted(input: {
    taskId: string;
    novelId?: string | null;
    nodeKey: string;
    label: string;
    targetType?: DirectorStepRun["targetType"];
    targetId?: string | null;
  }): Promise<void> {
    const idempotencyKey = this.buildStepIdempotencyKey(input);
    const now = new Date().toISOString();
    await this.mutateSnapshot(input.taskId, (snapshot) => ({
      ...snapshot,
      novelId: snapshot.novelId ?? input.novelId ?? null,
      steps: upsertStep(snapshot.steps, {
        idempotencyKey,
        nodeKey: input.nodeKey,
        label: input.label,
        status: "running",
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        startedAt: now,
      }),
      events: [
        ...snapshot.events,
        this.buildEvent({
          type: "node_started",
          taskId: input.taskId,
          novelId: input.novelId ?? snapshot.novelId ?? null,
          nodeKey: input.nodeKey,
          summary: input.label,
          occurredAt: now,
        }),
      ],
    }));
  }

  async recordStepCompleted(input: {
    taskId: string;
    novelId?: string | null;
    nodeKey: string;
    label: string;
    targetType?: DirectorStepRun["targetType"];
    targetId?: string | null;
    producedArtifacts?: DirectorArtifactRef[];
  }): Promise<void> {
    const idempotencyKey = this.buildStepIdempotencyKey(input);
    const now = new Date().toISOString();
    await this.mutateSnapshot(input.taskId, (snapshot) => ({
      ...snapshot,
      novelId: snapshot.novelId ?? input.novelId ?? null,
      steps: upsertStep(snapshot.steps, {
        idempotencyKey,
        nodeKey: input.nodeKey,
        label: input.label,
        status: "succeeded",
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        startedAt: snapshot.steps.find((step) => step.idempotencyKey === idempotencyKey)?.startedAt ?? now,
        finishedAt: now,
        producedArtifacts: input.producedArtifacts,
      }),
      artifacts: mergeArtifacts(snapshot.artifacts, input.producedArtifacts ?? []),
      events: [
        ...snapshot.events,
        this.buildEvent({
          type: "node_completed",
          taskId: input.taskId,
          novelId: input.novelId ?? snapshot.novelId ?? null,
          nodeKey: input.nodeKey,
          summary: `${input.label}完成。`,
          occurredAt: now,
        }),
      ],
    }));
  }

  async recordStepFailed(input: {
    taskId: string;
    novelId?: string | null;
    nodeKey: string;
    label: string;
    targetType?: DirectorStepRun["targetType"];
    targetId?: string | null;
    error: string;
  }): Promise<void> {
    const idempotencyKey = this.buildStepIdempotencyKey(input);
    const now = new Date().toISOString();
    await this.mutateSnapshot(input.taskId, (snapshot) => ({
      ...snapshot,
      steps: upsertStep(snapshot.steps, {
        idempotencyKey,
        nodeKey: input.nodeKey,
        label: input.label,
        status: "failed",
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        startedAt: snapshot.steps.find((step) => step.idempotencyKey === idempotencyKey)?.startedAt ?? now,
        finishedAt: now,
        error: input.error,
      }),
      events: [
        ...snapshot.events,
        this.buildEvent({
          type: "node_failed",
          taskId: input.taskId,
          novelId: input.novelId ?? snapshot.novelId ?? null,
          nodeKey: input.nodeKey,
          summary: `${input.label}失败：${input.error}`,
          occurredAt: now,
          severity: "medium",
        }),
      ],
    }));
  }

  async recordNodeGate(input: {
    taskId: string;
    novelId?: string | null;
    nodeKey: string;
    label: string;
    targetType?: DirectorStepRun["targetType"];
    targetId?: string | null;
    status: Extract<DirectorStepRun["status"], "waiting_approval" | "blocked_scope">;
    decision: DirectorPolicyDecision;
  }): Promise<void> {
    const idempotencyKey = this.buildStepIdempotencyKey(input);
    const now = new Date().toISOString();
    await this.mutateSnapshot(input.taskId, (snapshot) => ({
      ...snapshot,
      novelId: snapshot.novelId ?? input.novelId ?? null,
      steps: upsertStep(snapshot.steps, {
        idempotencyKey,
        nodeKey: input.nodeKey,
        label: input.label,
        status: input.status,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        startedAt: snapshot.steps.find((step) => step.idempotencyKey === idempotencyKey)?.startedAt ?? now,
        finishedAt: now,
        policyDecision: input.decision,
      }),
      events: [
        ...snapshot.events,
        this.buildEvent({
          type: "approval_required",
          taskId: input.taskId,
          novelId: input.novelId ?? snapshot.novelId ?? null,
          nodeKey: input.nodeKey,
          summary: input.decision.reason,
          occurredAt: now,
          affectedScope: input.decision.affectedArtifacts.join(",") || null,
          severity: input.status === "blocked_scope" ? "high" : "medium",
          metadata: {
            policyDecision: input.decision,
            nodeLabel: input.label,
          },
        }),
      ],
    }));
  }

  async recordWorkspaceAnalysis(input: {
    taskId: string;
    analysis: DirectorWorkspaceAnalysis;
  }): Promise<void> {
    await this.mutateSnapshot(input.taskId, (snapshot) => ({
      ...snapshot,
      novelId: snapshot.novelId ?? input.analysis.novelId,
      lastWorkspaceAnalysis: input.analysis,
      artifacts: mergeArtifacts(snapshot.artifacts, input.analysis.inventory.artifacts),
      events: [
        ...snapshot.events,
        this.buildEvent({
          type: "workspace_analyzed",
          taskId: input.taskId,
          novelId: input.analysis.novelId,
          summary: input.analysis.interpretation?.summary ?? "工作区分析已完成。",
          occurredAt: input.analysis.generatedAt,
        }),
      ],
    }));
  }

  async updatePolicy(input: {
    taskId: string;
    mode: DirectorPolicyMode;
    patch?: Partial<Omit<DirectorRuntimePolicySnapshot, "mode" | "updatedAt">>;
  }): Promise<DirectorRuntimeSnapshot | null> {
    return this.mutateSnapshot(input.taskId, (snapshot) => {
      const policy: DirectorRuntimePolicySnapshot = {
        ...snapshot.policy,
        ...compactPolicyPatch(input.patch),
        mode: input.mode,
        maxAutoRepairAttempts: 1,
        updatedAt: new Date().toISOString(),
      };
      return {
        ...snapshot,
        policy,
        events: [
          ...snapshot.events,
          this.buildEvent({
            type: "policy_changed",
            taskId: input.taskId,
            novelId: snapshot.novelId,
            summary: `自动导演控制策略已切换为 ${input.mode}。`,
            occurredAt: policy.updatedAt,
          }),
        ],
      };
    });
  }

  buildStepIdempotencyKey(input: {
    taskId: string;
    nodeKey: string;
    targetType?: DirectorStepRun["targetType"];
    targetId?: string | null;
  }): string {
    return `${input.taskId}:${input.nodeKey}:${input.targetType ?? "global"}:${input.targetId ?? "global"}`;
  }

  buildEvent(input: {
    type: DirectorEventType;
    taskId?: string | null;
    novelId?: string | null;
    nodeKey?: string | null;
    artifactId?: string | null;
    artifactType?: DirectorEvent["artifactType"];
    summary: string;
    affectedScope?: string | null;
    severity?: DirectorEvent["severity"];
    occurredAt?: string;
    metadata?: Record<string, unknown>;
  }): DirectorEvent {
    return {
      eventId: `${input.taskId ?? "runtime"}:${input.type}:${randomUUID()}`,
      type: input.type,
      taskId: input.taskId ?? null,
      novelId: input.novelId ?? null,
      nodeKey: input.nodeKey ?? null,
      artifactId: input.artifactId ?? null,
      artifactType: input.artifactType ?? null,
      summary: input.summary,
      affectedScope: input.affectedScope ?? null,
      severity: input.severity ?? null,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      metadata: input.metadata,
    };
  }
}
