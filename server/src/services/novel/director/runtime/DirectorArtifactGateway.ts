import { prisma } from "../../../../db/prisma";
import type {
  DirectorArtifactRef,
  DirectorArtifactSource,
  DirectorArtifactStatus,
  DirectorArtifactTargetType,
  DirectorArtifactType,
} from "@ai-novel/shared/types/directorRuntime";
import {
  buildDirectorArtifactRef,
  stableDirectorContentHash,
} from "./DirectorArtifactLedger";

export const P0_DIRECTOR_ARTIFACT_TYPES = [
  "book_contract",
  "story_macro",
  "character_governance_state",
  "volume_strategy",
  "volume_beat_sheet",
  "volume_chapter_list",
  "chapter_task_sheet",
  "chapter_draft",
  "audit_report",
  "repair_ticket",
  "continuity_state",
] as const satisfies readonly DirectorArtifactType[];

export interface DirectorArtifactWriteInput {
  novelId: string;
  taskId?: string | null;
  runId?: string | null;
  artifactType: DirectorArtifactType;
  targetType: DirectorArtifactTargetType;
  targetId?: string | null;
  contentTable: string;
  contentId: string;
  contentText?: string | null;
  status?: DirectorArtifactStatus;
  source?: DirectorArtifactSource;
  protectedUserContent?: boolean | null;
  sourceStepRunId?: string | null;
  dependsOn?: Array<{ artifactId: string; version?: number | null }>;
}

export class ArtifactReader {
  async listActiveForNovel(novelId: string): Promise<DirectorArtifactRef[]> {
    const rows = await prisma.directorArtifact.findMany({
      where: { novelId, status: { in: ["active", "stale"] } },
      include: { dependencies: true },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    }).catch(() => []);
    return rows.map((row) => ({
      id: row.id,
      novelId: row.novelId,
      runId: row.runId,
      artifactType: row.artifactType as DirectorArtifactType,
      targetType: row.targetType as DirectorArtifactTargetType,
      targetId: row.targetId,
      version: row.version,
      status: row.status as DirectorArtifactStatus,
      source: row.source as DirectorArtifactSource,
      contentRef: { table: row.contentTable, id: row.contentId },
      contentHash: row.contentHash,
      schemaVersion: row.schemaVersion,
      promptAssetKey: row.promptAssetKey,
      promptVersion: row.promptVersion,
      modelRoute: row.modelRoute,
      sourceStepRunId: row.sourceStepRunId,
      protectedUserContent: row.protectedUserContent,
      dependsOn: row.dependencies.map((dependency) => ({
        artifactId: dependency.dependsOnArtifactId,
        version: dependency.dependsOnVersion,
      })),
      updatedAt: row.artifactUpdatedAt?.toISOString() ?? row.updatedAt.toISOString(),
    }));
  }
}

export class ArtifactWriter {
  async upsert(input: DirectorArtifactWriteInput): Promise<DirectorArtifactRef> {
    const ref = buildDirectorArtifactRef({
      novelId: input.novelId,
      type: input.artifactType,
      targetType: input.targetType,
      targetId: input.targetId,
      table: input.contentTable,
      id: input.contentId,
      status: input.status ?? "active",
      source: input.source ?? "ai_generated",
      contentHash: stableDirectorContentHash(input.contentText) ?? undefined,
      protectedUserContent: input.protectedUserContent,
      sourceStepRunId: input.sourceStepRunId,
      dependsOn: input.dependsOn,
      updatedAt: new Date(),
    });
    await prisma.directorArtifact.upsert({
      where: { id: ref.id },
      create: {
        id: ref.id,
        runId: input.runId,
        novelId: input.novelId,
        taskId: input.taskId,
        artifactType: ref.artifactType,
        targetType: ref.targetType,
        targetId: ref.targetId,
        version: ref.version,
        status: ref.status,
        source: ref.source,
        contentTable: ref.contentRef.table,
        contentId: ref.contentRef.id,
        contentHash: ref.contentHash,
        schemaVersion: ref.schemaVersion,
        sourceStepRunId: ref.sourceStepRunId,
        protectedUserContent: ref.protectedUserContent,
        artifactUpdatedAt: new Date(),
      },
      update: {
        runId: input.runId,
        taskId: input.taskId,
        status: ref.status,
        source: ref.source,
        contentHash: ref.contentHash,
        sourceStepRunId: ref.sourceStepRunId,
        protectedUserContent: ref.protectedUserContent,
        artifactUpdatedAt: new Date(),
      },
    });
    return ref;
  }

  async markUserEdited(input: Omit<DirectorArtifactWriteInput, "source" | "protectedUserContent" | "status">): Promise<DirectorArtifactRef> {
    const existing = await prisma.directorArtifact.findUnique({
      where: {
        id: buildDirectorArtifactRef({
          novelId: input.novelId,
          type: input.artifactType,
          targetType: input.targetType,
          targetId: input.targetId,
          table: input.contentTable,
          id: input.contentId,
        }).id,
      },
      select: { version: true },
    }).catch(() => null);
    const ref = buildDirectorArtifactRef({
      novelId: input.novelId,
      type: input.artifactType,
      targetType: input.targetType,
      targetId: input.targetId,
      table: input.contentTable,
      id: input.contentId,
      status: "active",
      source: "user_edited",
      contentHash: stableDirectorContentHash(input.contentText) ?? undefined,
      protectedUserContent: true,
      updatedAt: new Date(),
    });
    const nextVersion = (existing?.version ?? 0) + 1;
    await prisma.directorArtifact.upsert({
      where: { id: ref.id },
      create: {
        id: ref.id,
        runId: input.runId ?? null,
        novelId: input.novelId,
        taskId: input.taskId ?? null,
        artifactType: ref.artifactType,
        targetType: ref.targetType,
        targetId: ref.targetId,
        version: nextVersion,
        status: "active",
        source: "user_edited",
        contentTable: ref.contentRef.table,
        contentId: ref.contentRef.id,
        contentHash: ref.contentHash,
        schemaVersion: ref.schemaVersion,
        sourceStepRunId: input.sourceStepRunId ?? null,
        protectedUserContent: true,
        artifactUpdatedAt: new Date(),
      },
      update: {
        runId: input.runId ?? null,
        taskId: input.taskId ?? null,
        version: nextVersion,
        status: "active",
        source: "user_edited",
        contentHash: ref.contentHash,
        protectedUserContent: true,
        artifactUpdatedAt: new Date(),
      },
    });
    const dependents = await prisma.directorArtifactDependency.findMany({
      where: { dependsOnArtifactId: ref.id },
      select: { artifactId: true },
    }).catch(() => []);
    const dependentIds = dependents.map((item) => item.artifactId);
    if (dependentIds.length > 0) {
      await prisma.directorArtifact.updateMany({
        where: {
          id: { in: dependentIds },
          artifactType: { not: "chapter_draft" },
          status: { notIn: ["rejected", "superseded"] },
        },
        data: { status: "stale" },
      }).catch(() => null);
    }
    return { ...ref, version: nextVersion };
  }
}
