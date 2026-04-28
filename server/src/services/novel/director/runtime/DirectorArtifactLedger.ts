import { createHash } from "node:crypto";
import type {
  DirectorArtifactRef,
  DirectorArtifactSource,
  DirectorArtifactStatus,
  DirectorArtifactType,
} from "@ai-novel/shared/types/directorRuntime";

const ARTIFACT_SCHEMA_VERSION = "legacy-wrapper-v1";

const ARTIFACT_STATUSES: readonly DirectorArtifactStatus[] = [
  "draft",
  "active",
  "superseded",
  "stale",
  "rejected",
];

const ARTIFACT_SOURCES: readonly DirectorArtifactSource[] = [
  "ai_generated",
  "user_edited",
  "auto_repaired",
  "imported",
  "backfilled",
];

export interface DirectorArtifactTarget {
  artifactType: DirectorArtifactRef["artifactType"];
  targetType: DirectorArtifactRef["targetType"];
  targetId?: string | null;
  contentRef: DirectorArtifactRef["contentRef"];
  updatedAt?: Date | string | null;
  status?: DirectorArtifactRef["status"];
  source?: DirectorArtifactRef["source"];
  contentHash?: string | null;
  protectedUserContent?: boolean | null;
  dependsOn?: DirectorArtifactRef["dependsOn"];
  promptAssetKey?: string | null;
  promptVersion?: string | null;
  modelRoute?: string | null;
  sourceStepRunId?: string | null;
}

export interface DirectorArtifactLedgerReconciliation {
  artifacts: DirectorArtifactRef[];
  indexedArtifacts: DirectorArtifactRef[];
  staleArtifacts: DirectorArtifactRef[];
}

export interface DirectorArtifactLedgerSummary {
  missingArtifactTypes: DirectorArtifactType[];
  staleArtifacts: DirectorArtifactRef[];
  protectedUserContentArtifacts: DirectorArtifactRef[];
  needsRepairArtifacts: DirectorArtifactRef[];
}

type DirectorArtifactDependency = NonNullable<DirectorArtifactRef["dependsOn"]>[number];

export function stableDirectorContentHash(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  return createHash("sha256").update(normalized).digest("hex");
}

export function buildDirectorArtifactId(input: {
  type: DirectorArtifactType;
  targetType: DirectorArtifactRef["targetType"];
  targetId?: string | null;
  table: string;
  id: string;
}): string {
  return `${input.type}:${input.targetType}:${input.targetId ?? "global"}:${input.table}:${input.id}`;
}

export function compactDirectorArtifactDependencies(
  dependencies: Array<string | DirectorArtifactDependency | null | undefined>,
): DirectorArtifactRef["dependsOn"] {
  const normalized = dependencies.flatMap((dependency): DirectorArtifactDependency[] => {
    if (!dependency) {
      return [];
    }
    return typeof dependency === "string"
      ? [{ artifactId: dependency, version: 1 }]
      : [dependency];
  });
  return normalizeDependencies(normalized);
}

export function normalizeDirectorArtifactTargets(
  items: DirectorArtifactTarget[],
  novelId: string,
): DirectorArtifactRef[] {
  const byKey = new Map<string, DirectorArtifactRef>();
  for (const item of items) {
    const artifact = buildDirectorArtifactRef({
      novelId,
      type: item.artifactType,
      targetType: item.targetType,
      targetId: item.targetId,
      table: item.contentRef.table,
      id: item.contentRef.id,
      updatedAt: item.updatedAt,
      status: item.status,
      source: item.source,
      contentHash: item.contentHash,
      protectedUserContent: item.protectedUserContent,
      dependsOn: item.dependsOn,
      promptAssetKey: item.promptAssetKey,
      promptVersion: item.promptVersion,
      modelRoute: item.modelRoute,
      sourceStepRunId: item.sourceStepRunId,
    });
    byKey.set(artifact.id, artifact);
  }
  return [...byKey.values()];
}

export function buildDirectorArtifactRef(input: {
  novelId: string;
  type: DirectorArtifactType;
  targetType: DirectorArtifactRef["targetType"];
  targetId?: string | null;
  table: string;
  id: string;
  updatedAt?: Date | string | null;
  status?: DirectorArtifactRef["status"];
  source?: DirectorArtifactRef["source"];
  contentHash?: string | null;
  protectedUserContent?: boolean | null;
  dependsOn?: DirectorArtifactRef["dependsOn"];
  promptAssetKey?: string | null;
  promptVersion?: string | null;
  modelRoute?: string | null;
  sourceStepRunId?: string | null;
}): DirectorArtifactRef {
  return normalizeDirectorArtifactRef({
    id: buildDirectorArtifactId(input),
    novelId: input.novelId,
    artifactType: input.type,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    version: 1,
    status: input.status ?? "active",
    source: input.source ?? "backfilled",
    contentRef: {
      table: input.table,
      id: input.id,
    },
    contentHash: input.contentHash ?? null,
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    promptAssetKey: input.promptAssetKey ?? null,
    promptVersion: input.promptVersion ?? null,
    modelRoute: input.modelRoute ?? null,
    sourceStepRunId: input.sourceStepRunId ?? null,
    protectedUserContent: input.protectedUserContent ?? null,
    dependsOn: normalizeDependencies(input.dependsOn),
    updatedAt: normalizeUpdatedAt(input.updatedAt),
  });
}

export function reconcileDirectorArtifactLedger(
  existingArtifacts: DirectorArtifactRef[],
  nextArtifacts: DirectorArtifactRef[],
  options?: {
    runId?: string | null;
    sourceStepRunId?: string | null;
  },
): DirectorArtifactLedgerReconciliation {
  const byId = new Map(existingArtifacts.map((artifact) => {
    const normalized = normalizeDirectorArtifactRef(artifact);
    return [normalized.id, normalized] as const;
  }));
  const indexedArtifacts: DirectorArtifactRef[] = [];
  const changedVersionById = new Map<string, number>();

  for (const rawNext of nextArtifacts) {
    const next = normalizeDirectorArtifactRef({
      ...rawNext,
      runId: rawNext.runId ?? options?.runId ?? null,
      sourceStepRunId: rawNext.sourceStepRunId ?? options?.sourceStepRunId ?? null,
    });
    const existing = byId.get(next.id);
    if (!existing) {
      byId.set(next.id, next);
      indexedArtifacts.push(next);
      continue;
    }

    const contentChanged = hasContentChanged(existing, next);
    const version = contentChanged ? existing.version + 1 : existing.version;
    const merged = normalizeDirectorArtifactRef({
      ...existing,
      ...next,
      version,
      status: next.status,
      source: next.source === "backfilled" && existing.source !== "backfilled"
        ? existing.source
        : next.source,
      contentHash: next.contentHash ?? existing.contentHash ?? null,
      promptAssetKey: next.promptAssetKey ?? existing.promptAssetKey ?? null,
      promptVersion: next.promptVersion ?? existing.promptVersion ?? null,
      modelRoute: next.modelRoute ?? existing.modelRoute ?? null,
      sourceStepRunId: next.sourceStepRunId ?? existing.sourceStepRunId ?? null,
      protectedUserContent: next.protectedUserContent ?? existing.protectedUserContent ?? null,
      dependsOn: next.dependsOn ?? existing.dependsOn,
      updatedAt: next.updatedAt ?? existing.updatedAt ?? null,
    });
    byId.set(next.id, merged);
    if (contentChanged || existing.status !== merged.status) {
      indexedArtifacts.push(merged);
    }
    if (merged.version > existing.version) {
      changedVersionById.set(merged.id, merged.version);
    }
  }

  const staleArtifacts: DirectorArtifactRef[] = [];
  for (const artifact of byId.values()) {
    if (changedVersionById.has(artifact.id)) {
      continue;
    }
    const staleDependency = artifact.dependsOn?.find((dependency) => {
      const latestVersion = changedVersionById.get(dependency.artifactId);
      return latestVersion !== undefined && (dependency.version ?? 0) < latestVersion;
    });
    if (!staleDependency || artifact.status === "stale") {
      continue;
    }
    const staleArtifact = normalizeDirectorArtifactRef({
      ...artifact,
      status: "stale",
    });
    byId.set(staleArtifact.id, staleArtifact);
    staleArtifacts.push(staleArtifact);
  }

  return {
    artifacts: [...byId.values()],
    indexedArtifacts,
    staleArtifacts,
  };
}

export function summarizeDirectorArtifactLedger(
  artifacts: DirectorArtifactRef[],
  expectedArtifactTypes: DirectorArtifactType[],
): DirectorArtifactLedgerSummary {
  const normalized = artifacts.map((artifact) => normalizeDirectorArtifactRef(artifact));
  const presentTypes = new Set(
    normalized
      .filter((artifact) => artifact.status !== "rejected" && artifact.status !== "superseded")
      .map((artifact) => artifact.artifactType),
  );
  return {
    missingArtifactTypes: [...new Set(expectedArtifactTypes)].filter((type) => !presentTypes.has(type)),
    staleArtifacts: normalized.filter((artifact) => artifact.status === "stale"),
    protectedUserContentArtifacts: normalized.filter((artifact) => (
      artifact.protectedUserContent === true
      || (artifact.source === "user_edited" && artifact.status === "active")
    )),
    needsRepairArtifacts: normalized.filter((artifact) => artifact.artifactType === "repair_ticket" && artifact.status !== "rejected"),
  };
}

export function normalizeDirectorArtifactRef(artifact: DirectorArtifactRef): DirectorArtifactRef {
  const status = ARTIFACT_STATUSES.includes(artifact.status) ? artifact.status : "active";
  const source = ARTIFACT_SOURCES.includes(artifact.source) ? artifact.source : "backfilled";
  return {
    ...artifact,
    id: artifact.id || buildDirectorArtifactId({
      type: artifact.artifactType,
      targetType: artifact.targetType,
      targetId: artifact.targetId,
      table: artifact.contentRef.table,
      id: artifact.contentRef.id,
    }),
    version: Number.isFinite(artifact.version) && artifact.version > 0
      ? Math.round(artifact.version)
      : 1,
    status,
    source,
    contentHash: artifact.contentHash ?? null,
    schemaVersion: artifact.schemaVersion || ARTIFACT_SCHEMA_VERSION,
    promptAssetKey: artifact.promptAssetKey ?? null,
    promptVersion: artifact.promptVersion ?? null,
    modelRoute: artifact.modelRoute ?? null,
    sourceStepRunId: artifact.sourceStepRunId ?? null,
    protectedUserContent: artifact.protectedUserContent ?? null,
    dependsOn: normalizeDependencies(artifact.dependsOn),
    updatedAt: normalizeUpdatedAt(artifact.updatedAt),
  };
}

function hasContentChanged(existing: DirectorArtifactRef, next: DirectorArtifactRef): boolean {
  if (existing.contentHash && next.contentHash) {
    return existing.contentHash !== next.contentHash;
  }
  if (!existing.contentHash && next.contentHash) {
    return timestampOf(next.updatedAt) > timestampOf(existing.updatedAt);
  }
  return false;
}

function normalizeDependencies(
  dependencies: DirectorArtifactRef["dependsOn"] | undefined,
): DirectorArtifactRef["dependsOn"] {
  if (!dependencies || dependencies.length === 0) {
    return undefined;
  }
  return dependencies
    .filter((dependency) => dependency.artifactId?.trim())
    .map((dependency) => ({
      artifactId: dependency.artifactId,
      version: typeof dependency.version === "number" && Number.isFinite(dependency.version)
        ? Math.max(1, Math.round(dependency.version))
        : null,
    }));
}

function normalizeUpdatedAt(value?: Date | string | null): string | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function timestampOf(value?: string | null): number {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
