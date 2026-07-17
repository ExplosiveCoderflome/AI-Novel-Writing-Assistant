import type {
  DirectorArtifactRef,
  DirectorArtifactType,
  DirectorEvent,
  DirectorRuntimeSnapshot,
} from "@ai-novel/shared/types/directorRuntime";
import { prisma } from "../../../../db/prisma";
import { withSqliteRetry } from "../../../../db/sqliteRetry";
import { normalizeDirectorArtifactRef } from "./DirectorArtifactLedger";

export interface DirectorRuntimePersistenceDelta {
  steps: DirectorRuntimeSnapshot["steps"];
  events: DirectorRuntimeSnapshot["events"];
  artifacts: DirectorArtifactRef[];
  workspaceAnalysisChanged: boolean;
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

function dateFromIso(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && (error as { code?: unknown }).code === "P2002";
}

function isPrismaForeignKeyConstraintError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && (error as { code?: unknown }).code === "P2003";
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function artifactTypeLabel(type: DirectorArtifactType): string {
  const labels: Record<DirectorArtifactType, string> = {
    book_contract: "书级创作约定",
    story_macro: "故事宏观规划",
    character_cast: "角色阵容",
    volume_strategy: "分卷策略",
    volume_beat_sheet: "卷节奏板",
    volume_chapter_list: "卷拆章列表",
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

export function buildDirectorRuntimePersistenceDelta(
  current: DirectorRuntimeSnapshot | null,
  next: DirectorRuntimeSnapshot,
): DirectorRuntimePersistenceDelta {
  const currentSteps = new Map((current?.steps ?? []).map((step) => [step.idempotencyKey, step]));
  const currentEvents = new Map((current?.events ?? []).map((event) => [event.eventId, event]));
  const currentArtifacts = new Map((current?.artifacts ?? []).map((artifact) => [artifact.id, artifact]));

  return {
    steps: next.steps.filter((step) => !sameJson(currentSteps.get(step.idempotencyKey), step)),
    events: next.events.filter((event) => !sameJson(currentEvents.get(event.eventId), event)),
    artifacts: next.artifacts.filter((artifact) => !sameJson(currentArtifacts.get(artifact.id), artifact)),
    workspaceAnalysisChanged: !sameJson(current?.lastWorkspaceAnalysis, next.lastWorkspaceAnalysis),
  };
}

export async function persistDirectorRuntimeSnapshot(input: {
  taskId: string;
  novelId?: string | null;
  snapshot: DirectorRuntimeSnapshot;
  delta: DirectorRuntimePersistenceDelta;
}): Promise<void> {
  const { snapshot, delta } = input;
  const novelId = snapshot.novelId ?? input.novelId ?? null;
  const runUpdate: {
    novelId: string | null;
    entrypoint: string | null;
    policyJson: string;
    lastWorkspaceAnalysisJson?: string | null;
  } = {
    novelId,
    entrypoint: snapshot.entrypoint ?? null,
    policyJson: stringifyJson(snapshot.policy),
  };
  if (delta.workspaceAnalysisChanged) {
    runUpdate.lastWorkspaceAnalysisJson = snapshot.lastWorkspaceAnalysis
      ? stringifyJson(snapshot.lastWorkspaceAnalysis)
      : null;
  }

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
        update: runUpdate,
      });

      for (const step of delta.steps) {
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

      for (const event of delta.events) {
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

      const snapshotArtifactIds = new Set(snapshot.artifacts.map((artifact) => artifact.id));
      const normalizedArtifacts = delta.artifacts.map((artifact) => normalizeDirectorArtifactRef({
        ...artifact,
        runId: artifact.runId ?? snapshot.runId,
      }));
      for (const normalized of normalizedArtifacts) {
        const create = {
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
        };
        const update = {
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
        };
        try {
          await prisma.directorArtifact.upsert({
            where: { id: normalized.id },
            create,
            update,
          });
        } catch (error) {
          if (!isPrismaUniqueConstraintError(error)) {
            throw error;
          }
          await prisma.directorArtifact.update({
            where: { id: normalized.id },
            data: update,
          });
        }
      }

      const referencedArtifactIds = Array.from(new Set(
        normalizedArtifacts.flatMap((artifact) => (
          artifact.dependsOn ?? []
        ).map((dependency) => dependency.artifactId))
          .filter((artifactId) => snapshotArtifactIds.has(artifactId)),
      ));
      const existingReferencedArtifactIds = referencedArtifactIds.length > 0
        ? new Set((await prisma.directorArtifact.findMany({
          where: { id: { in: referencedArtifactIds } },
          select: { id: true },
        })).map((artifact) => artifact.id))
        : new Set<string>();
      const persistedArtifactIds = new Set([
        ...normalizedArtifacts.map((artifact) => artifact.id),
        ...existingReferencedArtifactIds,
      ]);

      for (const normalized of normalizedArtifacts) {
        const dependencyMap = new Map<string, NonNullable<typeof normalized.dependsOn>[number]>();
        for (const dependency of normalized.dependsOn ?? []) {
          if (!persistedArtifactIds.has(dependency.artifactId)) {
            continue;
          }
          dependencyMap.set(dependency.artifactId, dependency);
        }
        const dependencies = [...dependencyMap.values()];
        if (dependencies.length > 0) {
          await prisma.directorArtifactDependency.deleteMany({
            where: {
              artifactId: normalized.id,
              dependsOnArtifactId: {
                notIn: dependencies.map((dependency) => dependency.artifactId),
              },
            },
          });
        } else {
          await prisma.directorArtifactDependency.deleteMany({
            where: { artifactId: normalized.id },
          });
        }
        for (const dependency of dependencies) {
          const where = {
            artifactId_dependsOnArtifactId: {
              artifactId: normalized.id,
              dependsOnArtifactId: dependency.artifactId,
            },
          };
          const data = {
            dependsOnVersion: dependency.version ?? null,
          };
          try {
            await prisma.directorArtifactDependency.upsert({
              where,
              create: {
                artifactId: normalized.id,
                dependsOnArtifactId: dependency.artifactId,
                ...data,
              },
              update: data,
            });
          } catch (error) {
            if (isPrismaForeignKeyConstraintError(error)) {
              continue;
            }
            if (!isPrismaUniqueConstraintError(error)) {
              throw error;
            }
            await prisma.directorArtifactDependency.update({
              where,
              data,
            });
          }
        }
      }
    },
    { label: "directorRuntime.persistent.deltaUpsert" },
  );
}

export function buildArtifactIndexedEvents(input: {
  taskId: string;
  novelId?: string | null;
  nodeKey?: string | null;
  artifacts: DirectorArtifactRef[];
  occurredAt: string;
  stale?: boolean;
}): DirectorEvent[] {
  return input.artifacts.map((artifact) => ({
    eventId: `${input.taskId ?? "runtime"}:${input.stale ? "artifact_stale" : "artifact_indexed"}:${artifact.id}`,
    type: "artifact_indexed",
    taskId: input.taskId ?? null,
    novelId: input.novelId ?? artifact.novelId,
    nodeKey: input.nodeKey ?? null,
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
