import { randomUUID } from "node:crypto";
import type {
  DirectorArtifactRef,
  DirectorArtifactType,
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
import {
  normalizeDirectorArtifactRef,
  reconcileDirectorArtifactLedger,
} from "./DirectorArtifactLedger";
import { buildDefaultDirectorPolicy, buildEmptyDirectorRuntimeSnapshot } from "./directorRuntimeDefaults";

const MAX_RUNTIME_EVENTS = 120;
const MAX_RUNTIME_STEPS = 120;
const MAX_RUNTIME_ARTIFACTS = 160;

function stringifySeedPayload(payload: DirectorWorkflowSeedPayload): string {
  return JSON.stringify(payload);
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value?.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseNullableJson<T>(value: string | null | undefined): T | null {
  if (!value?.trim()) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function dateFromIso(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoFromDate(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
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
      artifacts: Array.isArray(existing.artifacts)
        ? existing.artifacts.map((artifact) => normalizeDirectorArtifactRef(artifact))
        : [],
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

function artifactTypeLabel(type: DirectorArtifactType): string {
  const labels: Record<DirectorArtifactType, string> = {
    book_contract: "书级创作约定",
    story_macro: "故事宏观规划",
    character_cast: "角色阵容",
    volume_strategy: "分卷策略",
    chapter_task_sheet: "章节任务单",
    chapter_draft: "章节正文",
    audit_report: "审校报告",
    repair_ticket: "修复任务",
    reader_promise: "读者承诺",
    character_governance_state: "角色治理状态",
    world_skeleton: "世界框架",
    source_knowledge_pack: "续写资料包",
    chapter_retention_contract: "章节留存约定",
    continuity_state: "连续性状态",
    rolling_window_review: "近期章节复盘",
  };
  return labels[type];
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
    const persisted = await this.getPersistentSnapshot(taskId);
    if (persisted) {
      return persisted;
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
    await this.persistSnapshot({
      taskId,
      novelId: row.novelId,
      snapshot: nextRuntime,
    });
    return nextRuntime;
  }

  async getPersistentSnapshot(taskId: string): Promise<DirectorRuntimeSnapshot | null> {
    const run = await prisma.directorRun.findUnique({
      where: { taskId },
      include: {
        steps: {
          orderBy: [{ updatedAt: "desc" }, { startedAt: "desc" }],
          take: MAX_RUNTIME_STEPS,
        },
        events: {
          orderBy: { occurredAt: "desc" },
          take: MAX_RUNTIME_EVENTS,
        },
        artifacts: {
          include: {
            dependencies: true,
          },
          orderBy: { updatedAt: "desc" },
          take: MAX_RUNTIME_ARTIFACTS,
        },
      },
    });
    if (!run) {
      return null;
    }
    return {
      schemaVersion: 1,
      runId: run.id,
      novelId: run.novelId,
      entrypoint: run.entrypoint,
      policy: parseJson<DirectorRuntimePolicySnapshot>(
        run.policyJson,
        buildDefaultDirectorPolicy(),
      ),
      steps: [...run.steps].reverse().map((step) => ({
        idempotencyKey: step.idempotencyKey,
        nodeKey: step.nodeKey,
        label: step.label,
        status: step.status as DirectorStepRun["status"],
        targetType: step.targetType as DirectorStepRun["targetType"],
        targetId: step.targetId,
        startedAt: step.startedAt.toISOString(),
        finishedAt: step.finishedAt?.toISOString() ?? null,
        error: step.error,
        producedArtifacts: parseNullableJson<DirectorArtifactRef[]>(step.producedArtifactsJson) ?? undefined,
        policyDecision: parseNullableJson<DirectorPolicyDecision>(step.policyDecisionJson),
      })),
      events: [...run.events].reverse().map((event) => ({
        eventId: event.id,
        type: event.type as DirectorEventType,
        taskId: event.taskId,
        novelId: event.novelId,
        nodeKey: event.nodeKey,
        artifactId: event.artifactId,
        artifactType: event.artifactType as DirectorEvent["artifactType"],
        summary: event.summary,
        affectedScope: event.affectedScope,
        severity: event.severity as DirectorEvent["severity"],
        occurredAt: event.occurredAt.toISOString(),
        metadata: parseNullableJson<Record<string, unknown>>(event.metadataJson) ?? undefined,
      })),
      artifacts: [...run.artifacts].reverse().map((artifact) => normalizeDirectorArtifactRef({
        id: artifact.id,
        novelId: artifact.novelId,
        runId: artifact.runId,
        artifactType: artifact.artifactType as DirectorArtifactRef["artifactType"],
        targetType: artifact.targetType as DirectorArtifactRef["targetType"],
        targetId: artifact.targetId,
        version: artifact.version,
        status: artifact.status as DirectorArtifactRef["status"],
        source: artifact.source as DirectorArtifactRef["source"],
        contentRef: {
          table: artifact.contentTable,
          id: artifact.contentId,
        },
        contentHash: artifact.contentHash,
        schemaVersion: artifact.schemaVersion,
        promptAssetKey: artifact.promptAssetKey,
        promptVersion: artifact.promptVersion,
        modelRoute: artifact.modelRoute,
        sourceStepRunId: artifact.sourceStepRunId,
        protectedUserContent: artifact.protectedUserContent,
        dependsOn: artifact.dependencies.map((dependency) => ({
          artifactId: dependency.dependsOnArtifactId,
          version: dependency.dependsOnVersion,
        })),
        updatedAt: artifact.artifactUpdatedAt?.toISOString() ?? artifact.updatedAt.toISOString(),
      })),
      lastWorkspaceAnalysis: parseNullableJson<DirectorWorkspaceAnalysis>(run.lastWorkspaceAnalysisJson) ?? undefined,
      updatedAt: run.updatedAt.toISOString(),
    };
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

  async recordRunResumed(input: {
    taskId: string;
    novelId?: string | null;
    summary?: string;
    reason?: string | null;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.mutateSnapshot(input.taskId, (snapshot) => ({
      ...snapshot,
      novelId: snapshot.novelId ?? input.novelId ?? null,
      events: [
        ...snapshot.events,
        this.buildEvent({
          type: "run_resumed",
          taskId: input.taskId,
          novelId: input.novelId ?? snapshot.novelId ?? null,
          summary: input.summary ?? "自动导演已按当前资产继续运行。",
          occurredAt: now,
          severity: "low",
          metadata: {
            reason: input.reason ?? null,
          },
        }),
      ],
    }));
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
    await this.mutateSnapshot(input.taskId, (snapshot) => {
      const existingStep = snapshot.steps.find((step) => step.idempotencyKey === idempotencyKey);
      const eventType: DirectorEventType = existingStep?.status === "running"
        ? "node_heartbeat"
        : "node_started";
      return {
        ...snapshot,
        novelId: snapshot.novelId ?? input.novelId ?? null,
        steps: upsertStep(snapshot.steps, {
          idempotencyKey,
          nodeKey: input.nodeKey,
          label: input.label,
          status: "running",
          targetType: input.targetType ?? null,
          targetId: input.targetId ?? null,
          startedAt: existingStep?.startedAt ?? now,
        }),
        events: [
          ...snapshot.events,
          this.buildEvent({
            type: eventType,
            taskId: input.taskId,
            novelId: input.novelId ?? snapshot.novelId ?? null,
            nodeKey: input.nodeKey,
            summary: input.label,
            affectedScope: `${input.targetType ?? "global"}:${input.targetId ?? input.novelId ?? "global"}`,
            severity: eventType === "node_heartbeat" ? "low" : null,
            occurredAt: now,
            metadata: {
              targetType: input.targetType ?? null,
              targetId: input.targetId ?? null,
            },
          }),
        ],
      };
    });
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
    await this.mutateSnapshot(input.taskId, (snapshot) => {
      const artifacts = reconcileDirectorArtifactLedger(
        snapshot.artifacts,
        input.producedArtifacts ?? [],
        {
          runId: snapshot.runId,
          sourceStepRunId: idempotencyKey,
        },
      );
      return {
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
        artifacts: artifacts.artifacts,
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
          ...this.buildArtifactIndexedEvents({
            taskId: input.taskId,
            novelId: input.novelId ?? snapshot.novelId ?? null,
            nodeKey: input.nodeKey,
            artifacts: artifacts.indexedArtifacts,
            occurredAt: now,
          }),
          ...this.buildArtifactIndexedEvents({
            taskId: input.taskId,
            novelId: input.novelId ?? snapshot.novelId ?? null,
            nodeKey: input.nodeKey,
            artifacts: artifacts.staleArtifacts,
            occurredAt: now,
            stale: true,
          }),
        ],
      };
    });
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
    await this.mutateSnapshot(input.taskId, (snapshot) => {
      const artifacts = reconcileDirectorArtifactLedger(
        snapshot.artifacts,
        input.analysis.inventory.artifacts,
        { runId: snapshot.runId },
      );
      return {
        ...snapshot,
        novelId: snapshot.novelId ?? input.analysis.novelId,
        lastWorkspaceAnalysis: {
          ...input.analysis,
          inventory: {
            ...input.analysis.inventory,
            artifacts: artifacts.artifacts,
          },
        },
        artifacts: artifacts.artifacts,
        events: [
          ...snapshot.events,
          this.buildEvent({
            type: "workspace_analyzed",
            taskId: input.taskId,
            novelId: input.analysis.novelId,
            summary: input.analysis.interpretation?.summary ?? "工作区分析已完成。",
            occurredAt: input.analysis.generatedAt,
          }),
          ...this.buildArtifactIndexedEvents({
            taskId: input.taskId,
            novelId: input.analysis.novelId,
            artifacts: artifacts.indexedArtifacts,
            occurredAt: input.analysis.generatedAt,
          }),
          ...this.buildArtifactIndexedEvents({
            taskId: input.taskId,
            novelId: input.analysis.novelId,
            artifacts: artifacts.staleArtifacts,
            occurredAt: input.analysis.generatedAt,
            stale: true,
          }),
        ],
      };
    });
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

  private async persistSnapshot(input: {
    taskId: string;
    novelId?: string | null;
    snapshot: DirectorRuntimeSnapshot;
  }): Promise<void> {
    const snapshot = trimRuntimeSnapshot(input.snapshot);
    const novelId = snapshot.novelId ?? input.novelId ?? null;
    await withSqliteRetry(
      async () => {
        await prisma.directorRun.upsert({
          where: { taskId: input.taskId },
          create: {
            id: snapshot.runId,
            taskId: input.taskId,
            novelId,
            entrypoint: snapshot.entrypoint ?? null,
            policyJson: stringifyJson(snapshot.policy),
            lastWorkspaceAnalysisJson: snapshot.lastWorkspaceAnalysis
              ? stringifyJson(snapshot.lastWorkspaceAnalysis)
              : null,
          },
          update: {
            novelId,
            entrypoint: snapshot.entrypoint ?? null,
            policyJson: stringifyJson(snapshot.policy),
            lastWorkspaceAnalysisJson: snapshot.lastWorkspaceAnalysis
              ? stringifyJson(snapshot.lastWorkspaceAnalysis)
              : null,
          },
        });

        for (const step of snapshot.steps) {
          await prisma.directorStepRun.upsert({
            where: { idempotencyKey: step.idempotencyKey },
            create: {
              runId: snapshot.runId,
              taskId: input.taskId,
              novelId,
              idempotencyKey: step.idempotencyKey,
              nodeKey: step.nodeKey,
              label: step.label,
              status: step.status,
              targetType: step.targetType ?? null,
              targetId: step.targetId ?? null,
              startedAt: dateFromIso(step.startedAt) ?? new Date(),
              finishedAt: dateFromIso(step.finishedAt),
              error: step.error ?? null,
              producedArtifactsJson: step.producedArtifacts
                ? stringifyJson(step.producedArtifacts)
                : null,
              policyDecisionJson: step.policyDecision
                ? stringifyJson(step.policyDecision)
                : null,
            },
            update: {
              runId: snapshot.runId,
              novelId,
              nodeKey: step.nodeKey,
              label: step.label,
              status: step.status,
              targetType: step.targetType ?? null,
              targetId: step.targetId ?? null,
              startedAt: dateFromIso(step.startedAt) ?? new Date(),
              finishedAt: dateFromIso(step.finishedAt),
              error: step.error ?? null,
              producedArtifactsJson: step.producedArtifacts
                ? stringifyJson(step.producedArtifacts)
                : null,
              policyDecisionJson: step.policyDecision
                ? stringifyJson(step.policyDecision)
                : null,
            },
          });
        }

        for (const event of snapshot.events) {
          await prisma.directorEvent.upsert({
            where: { id: event.eventId },
            create: {
              id: event.eventId,
              runId: snapshot.runId,
              taskId: input.taskId,
              novelId: event.novelId ?? novelId,
              type: event.type,
              nodeKey: event.nodeKey ?? null,
              artifactId: event.artifactId ?? null,
              artifactType: event.artifactType ?? null,
              summary: event.summary,
              affectedScope: event.affectedScope ?? null,
              severity: event.severity ?? null,
              metadataJson: event.metadata ? stringifyJson(event.metadata) : null,
              occurredAt: dateFromIso(event.occurredAt) ?? new Date(),
            },
            update: {
              runId: snapshot.runId,
              novelId: event.novelId ?? novelId,
              type: event.type,
              nodeKey: event.nodeKey ?? null,
              artifactId: event.artifactId ?? null,
              artifactType: event.artifactType ?? null,
              summary: event.summary,
              affectedScope: event.affectedScope ?? null,
              severity: event.severity ?? null,
              metadataJson: event.metadata ? stringifyJson(event.metadata) : null,
              occurredAt: dateFromIso(event.occurredAt) ?? new Date(),
            },
          });
        }

        const artifactIds = new Set(snapshot.artifacts.map((artifact) => artifact.id));
        for (const artifact of snapshot.artifacts) {
          const normalized = normalizeDirectorArtifactRef({
            ...artifact,
            runId: artifact.runId ?? snapshot.runId,
          });
          await prisma.directorArtifact.upsert({
            where: { id: normalized.id },
            create: {
              id: normalized.id,
              runId: normalized.runId ?? snapshot.runId,
              novelId: normalized.novelId,
              taskId: input.taskId,
              artifactType: normalized.artifactType,
              targetType: normalized.targetType,
              targetId: normalized.targetId ?? null,
              version: normalized.version,
              status: normalized.status,
              source: normalized.source,
              contentTable: normalized.contentRef.table,
              contentId: normalized.contentRef.id,
              contentHash: normalized.contentHash ?? null,
              schemaVersion: normalized.schemaVersion,
              promptAssetKey: normalized.promptAssetKey ?? null,
              promptVersion: normalized.promptVersion ?? null,
              modelRoute: normalized.modelRoute ?? null,
              sourceStepRunId: normalized.sourceStepRunId ?? null,
              protectedUserContent: normalized.protectedUserContent ?? null,
              artifactUpdatedAt: dateFromIso(normalized.updatedAt),
            },
            update: {
              runId: normalized.runId ?? snapshot.runId,
              taskId: input.taskId,
              version: normalized.version,
              status: normalized.status,
              source: normalized.source,
              contentHash: normalized.contentHash ?? null,
              schemaVersion: normalized.schemaVersion,
              promptAssetKey: normalized.promptAssetKey ?? null,
              promptVersion: normalized.promptVersion ?? null,
              modelRoute: normalized.modelRoute ?? null,
              sourceStepRunId: normalized.sourceStepRunId ?? null,
              protectedUserContent: normalized.protectedUserContent ?? null,
              artifactUpdatedAt: dateFromIso(normalized.updatedAt),
            },
          });
        }

        for (const artifact of snapshot.artifacts) {
          const normalized = normalizeDirectorArtifactRef(artifact);
          await prisma.directorArtifactDependency.deleteMany({
            where: { artifactId: normalized.id },
          });
          const dependencyMap = new Map<string, NonNullable<typeof normalized.dependsOn>[number]>();
          for (const dependency of normalized.dependsOn ?? []) {
            if (!artifactIds.has(dependency.artifactId)) {
              continue;
            }
            dependencyMap.set(dependency.artifactId, dependency);
          }
          const dependencies = [...dependencyMap.values()];
          for (const dependency of dependencies) {
            await prisma.directorArtifactDependency.upsert({
              where: {
                artifactId_dependsOnArtifactId: {
                  artifactId: normalized.id,
                  dependsOnArtifactId: dependency.artifactId,
                },
              },
              create: {
                artifactId: normalized.id,
                dependsOnArtifactId: dependency.artifactId,
                dependsOnVersion: dependency.version ?? null,
              },
              update: {
                dependsOnVersion: dependency.version ?? null,
              },
            });
          }
        }
      },
      { label: "directorRuntime.persistent.upsert" },
    );
  }

  private buildArtifactIndexedEvents(input: {
    taskId: string;
    novelId?: string | null;
    nodeKey?: string | null;
    artifacts: DirectorArtifactRef[];
    occurredAt: string;
    stale?: boolean;
  }): DirectorEvent[] {
    return input.artifacts.map((artifact) => this.buildEvent({
      type: "artifact_indexed",
      taskId: input.taskId,
      novelId: input.novelId ?? artifact.novelId,
      nodeKey: input.nodeKey,
      artifactId: artifact.id,
      artifactType: artifact.artifactType,
      summary: input.stale
        ? `${artifactTypeLabel(artifact.artifactType)}需要重新确认。`
        : `${artifactTypeLabel(artifact.artifactType)}已纳入自动导演记录。`,
      affectedScope: `${artifact.targetType}:${artifact.targetId ?? artifact.novelId}`,
      severity: input.stale ? "medium" : "low",
      occurredAt: input.occurredAt,
      metadata: {
        targetType: artifact.targetType,
        targetId: artifact.targetId ?? null,
        version: artifact.version,
        status: artifact.status,
        source: artifact.source,
        sourceStepRunId: artifact.sourceStepRunId ?? null,
      },
    }));
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
