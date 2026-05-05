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
}
