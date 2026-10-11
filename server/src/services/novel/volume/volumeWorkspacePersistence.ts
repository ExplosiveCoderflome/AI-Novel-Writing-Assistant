import type { VolumeChapterPlan, VolumePlan, VolumePlanDocument } from "@ai-novel/shared/types/novel";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { withSqliteRetry } from "../../../db/sqliteRetry";
import {
  buildFallbackVolumesFromLegacy,
  type LegacyVolumeSource,
} from "./volumePlanUtils";
import { type DbClient, mapVolumeRow } from "./volumeModels";
import {
  buildVolumeWorkspaceDocument,
  normalizeVolumeWorkspaceDocument,
  serializeVolumeWorkspaceDocument,
} from "./volumeWorkspaceDocument";

export const VOLUME_WORKSPACE_TRANSACTION_TIMEOUT_MS = 60_000;

export function runVolumeWorkspaceTransaction<T>(
  runner: (tx: Prisma.TransactionClient) => Promise<T> | T,
): Promise<T> {
  return withSqliteRetry(
    () => prisma.$transaction(async (tx) => runner(tx), {
      timeout: VOLUME_WORKSPACE_TRANSACTION_TIMEOUT_MS,
    }),
    {
      label: "volume.workspace.transaction",
      retryDelaysMs: [500, 1500, 3000, 6000],
    },
  );
}

export async function listActiveVolumeRows(novelId: string, db: DbClient = prisma): Promise<VolumePlan[]> {
  const rows = await db.volumePlan.findMany({
    where: { novelId },
    include: {
      chapters: {
        orderBy: { chapterOrder: "asc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map(mapVolumeRow);
}

export async function getActiveVersionRow(novelId: string, db: DbClient = prisma) {
  return db.volumePlanVersion.findFirst({
    where: { novelId, status: "active" },
    orderBy: [{ version: "desc" }],
  });
}

export async function getLatestVersionRow(novelId: string, db: DbClient = prisma) {
  return db.volumePlanVersion.findFirst({
    where: { novelId },
    orderBy: [{ version: "desc" }],
  });
}

async function syncArcCompatibility(
  tx: Prisma.TransactionClient,
  novelId: string,
  volumes: VolumePlan[],
): Promise<void> {
  const externalRefs = volumes.map((volume) => `volume:${volume.sortOrder}`);
  await tx.storyPlan.deleteMany({
    where: {
      novelId,
      level: "arc",
      externalRef: {
        startsWith: "volume:",
        notIn: externalRefs,
      },
    },
  });

  for (const volume of volumes) {
    const externalRef = `volume:${volume.sortOrder}`;
    const existing = await tx.storyPlan.findFirst({
      where: { novelId, level: "arc", externalRef },
      select: { id: true },
    });
    const payload = {
      title: volume.title,
      objective: volume.mainPromise ?? volume.summary ?? `推进第${volume.sortOrder}卷主线。`,
      phaseLabel: volume.escalationMode ?? null,
      hookTarget: volume.nextVolumeHook ?? null,
      rawPlanJson: JSON.stringify({
        volumeTitle: volume.title,
        summary: volume.summary,
        openingHook: volume.openingHook,
        mainPromise: volume.mainPromise,
        primaryPressureSource: volume.primaryPressureSource,
        coreSellingPoint: volume.coreSellingPoint,
        escalationMode: volume.escalationMode,
        protagonistChange: volume.protagonistChange,
        midVolumeRisk: volume.midVolumeRisk,
        climax: volume.climax,
        payoffType: volume.payoffType,
        nextVolumeHook: volume.nextVolumeHook,
        resetPoint: volume.resetPoint,
        openPayoffs: volume.openPayoffs,
        chapters: volume.chapters.map((chapter) => ({
          chapterOrder: chapter.chapterOrder,
          beatKey: chapter.beatKey ?? null,
          title: chapter.title,
          summary: chapter.summary,
        })),
      }),
      revealsJson: volume.openPayoffs.length > 0 ? JSON.stringify(volume.openPayoffs) : null,
      mustAdvanceJson: JSON.stringify(volume.chapters.map((chapter) => `第${chapter.chapterOrder}章 ${chapter.title}`)),
      status: "active",
      externalRef,
    };
    if (existing) {
      await tx.storyPlan.update({
        where: { id: existing.id },
        data: payload,
      });
    } else {
      await tx.storyPlan.create({
        data: {
          novelId,
          level: "arc",
          ...payload,
        },
      });
    }
  }
}

function toVolumePlanData(
  novelId: string,
  volume: VolumePlan,
  sourceVersionId: string | null,
): Prisma.VolumePlanUncheckedCreateInput {
  return {
    id: volume.id,
    novelId,
    sortOrder: volume.sortOrder,
    title: volume.title,
    summary: volume.summary ?? null,
    mainPromise: volume.mainPromise ?? null,
    escalationMode: volume.escalationMode ?? null,
    protagonistChange: volume.protagonistChange ?? null,
    climax: volume.climax ?? null,
    nextVolumeHook: volume.nextVolumeHook ?? null,
    resetPoint: volume.resetPoint ?? null,
    openPayoffsJson: JSON.stringify(volume.openPayoffs),
    status: volume.status,
    sourceVersionId,
  };
}

function toVolumePlanUpdateData(
  novelId: string,
  volume: VolumePlan,
  sourceVersionId: string | null,
): Prisma.VolumePlanUncheckedUpdateInput {
  const { id: _id, ...data } = toVolumePlanData(novelId, volume, sourceVersionId);
  return data;
}

function toVolumeChapterPlanData(volumeId: string, chapter: VolumeChapterPlan): Prisma.VolumeChapterPlanUncheckedCreateInput {
  const hasConflictLevel = Object.prototype.hasOwnProperty.call(chapter, "conflictLevel");
  const conflictLevelSource = hasConflictLevel
    ? chapter.conflictLevelSource ?? "ai"
    : chapter.conflictLevelSource ?? null;
  return {
    id: chapter.id,
    volumeId,
    chapterId: chapter.chapterId ?? null,
    chapterOrder: chapter.chapterOrder,
    title: chapter.title,
    summary: chapter.summary,
    purpose: chapter.purpose ?? null,
    conflictLevel: chapter.conflictLevel ?? null,
    conflictLevelSource,
    revealLevel: chapter.revealLevel ?? null,
    targetWordCount: chapter.targetWordCount ?? null,
    mustAvoid: chapter.mustAvoid ?? null,
    taskSheet: chapter.taskSheet ?? null,
    sceneCards: chapter.sceneCards ?? null,
    payoffRefsJson: JSON.stringify(chapter.payoffRefs),
  };
}

function isExplicitConflictLevelRelease(params: {
  existingSource?: string | null;
  existingValue?: number | null;
  incomingSource?: VolumeChapterPlan["conflictLevelSource"];
  incomingValue?: number | null;
  hasConflictLevel: boolean;
}): boolean {
  return params.existingSource === "user"
    && params.incomingSource === "ai"
    && params.hasConflictLevel
    && (params.existingValue ?? null) === (params.incomingValue ?? null);
}

function shouldPreserveUserConflictLevel(params: {
  existingSource?: string | null;
  existingValue?: number | null;
  incomingSource?: VolumeChapterPlan["conflictLevelSource"];
  incomingValue?: number | null;
  hasConflictLevel: boolean;
  hasConflictLevelSource: boolean;
}): boolean {
  const hasConflictPatch = params.hasConflictLevel || params.hasConflictLevelSource;
  return params.existingSource === "user"
    && params.incomingSource !== "user"
    && hasConflictPatch
    && !isExplicitConflictLevelRelease(params);
}

function toVolumeChapterPlanUpdateData(
  volumeId: string,
  chapter: VolumeChapterPlan,
  existingChapter?: ExistingVolumeWorkspaceRow["chapters"][number],
): Prisma.VolumeChapterPlanUncheckedUpdateInput {
  const { id: _id, conflictLevel, conflictLevelSource, ...baseData } = toVolumeChapterPlanData(volumeId, chapter);
  const data: Prisma.VolumeChapterPlanUncheckedUpdateInput = baseData;
  const hasConflictLevel = Object.prototype.hasOwnProperty.call(chapter, "conflictLevel");
  const hasConflictLevelSource = Object.prototype.hasOwnProperty.call(chapter, "conflictLevelSource");
  const incomingSource = hasConflictLevel ? chapter.conflictLevelSource ?? "ai" : chapter.conflictLevelSource ?? null;
  const preserveUserConflictLevel = shouldPreserveUserConflictLevel({
    existingSource: existingChapter?.conflictLevelSource,
    existingValue: existingChapter?.conflictLevel,
    incomingSource,
    incomingValue: chapter.conflictLevel ?? null,
    hasConflictLevel,
    hasConflictLevelSource,
  });
  if (hasConflictLevel) {
    if (!preserveUserConflictLevel) {
      data.conflictLevel = conflictLevel;
      data.conflictLevelSource = incomingSource;
    }
  } else if (hasConflictLevelSource) {
    if (!preserveUserConflictLevel) {
      data.conflictLevelSource = conflictLevelSource;
    }
  }
  return data;
}

type ExistingVolumeWorkspaceRow = Prisma.VolumePlanGetPayload<{
  select: {
    id: true;
    sortOrder: true;
    title: true;
    summary: true;
    mainPromise: true;
    escalationMode: true;
    protagonistChange: true;
    climax: true;
    nextVolumeHook: true;
    resetPoint: true;
    openPayoffsJson: true;
    status: true;
    sourceVersionId: true;
    chapters: {
      select: {
        id: true;
        volumeId: true;
        chapterId: true;
        chapterOrder: true;
        title: true;
        summary: true;
        purpose: true;
        conflictLevel: true;
        conflictLevelSource: true;
        revealLevel: true;
        targetWordCount: true;
        mustAvoid: true;
        taskSheet: true;
        sceneCards: true;
        payoffRefsJson: true;
      };
    };
  };
}>;

function sameNullableText(left: string | null | undefined, right: string | null | undefined): boolean {
  return (left ?? null) === (right ?? null);
}

function isVolumeRowCurrent(
  row: ExistingVolumeWorkspaceRow,
  volume: VolumePlan,
  sourceVersionId: string | null,
): boolean {
  return row.sortOrder === volume.sortOrder
    && row.title === volume.title
    && sameNullableText(row.summary, volume.summary)
    && sameNullableText(row.mainPromise, volume.mainPromise)
    && sameNullableText(row.escalationMode, volume.escalationMode)
    && sameNullableText(row.protagonistChange, volume.protagonistChange)
    && sameNullableText(row.climax, volume.climax)
    && sameNullableText(row.nextVolumeHook, volume.nextVolumeHook)
    && sameNullableText(row.resetPoint, volume.resetPoint)
    && sameNullableText(row.openPayoffsJson, JSON.stringify(volume.openPayoffs))
    && row.status === volume.status
    && sameNullableText(row.sourceVersionId, sourceVersionId);
}

function isChapterRowCurrent(
  row: ExistingVolumeWorkspaceRow["chapters"][number],
  volumeId: string,
  chapter: VolumeChapterPlan,
): boolean {
  const hasConflictLevel = Object.prototype.hasOwnProperty.call(chapter, "conflictLevel");
  const hasConflictLevelSource = Object.prototype.hasOwnProperty.call(chapter, "conflictLevelSource");
  const incomingSource = hasConflictLevel ? chapter.conflictLevelSource ?? "ai" : chapter.conflictLevelSource ?? null;
  const preserveUserConflictLevel = shouldPreserveUserConflictLevel({
    existingSource: row.conflictLevelSource,
    existingValue: row.conflictLevel,
    incomingSource,
    incomingValue: chapter.conflictLevel ?? null,
    hasConflictLevel,
    hasConflictLevelSource,
  });
  return row.volumeId === volumeId
    && sameNullableText(row.chapterId, chapter.chapterId)
    && row.chapterOrder === chapter.chapterOrder
    && row.title === chapter.title
    && row.summary === chapter.summary
    && sameNullableText(row.purpose, chapter.purpose)
    && (
      preserveUserConflictLevel
      || !hasConflictLevel
      || (row.conflictLevel ?? null) === (chapter.conflictLevel ?? null)
    )
    && (
      preserveUserConflictLevel
      || (!hasConflictLevel && !hasConflictLevelSource)
      || sameNullableText(row.conflictLevelSource, incomingSource)
    )
    && (row.revealLevel ?? null) === (chapter.revealLevel ?? null)
    && (row.targetWordCount ?? null) === (chapter.targetWordCount ?? null)
    && sameNullableText(row.mustAvoid, chapter.mustAvoid)
    && sameNullableText(row.taskSheet, chapter.taskSheet)
    && sameNullableText(row.sceneCards, chapter.sceneCards)
    && sameNullableText(row.payoffRefsJson, JSON.stringify(chapter.payoffRefs));
}

function requiresOrderParking(existingVolumes: ExistingVolumeWorkspaceRow[], document: VolumePlanDocument): boolean {
  const volumeIdBySortOrder = new Map(existingVolumes.map((volume) => [volume.sortOrder, volume.id]));
  for (const volume of document.volumes) {
    const existingVolumeId = volumeIdBySortOrder.get(volume.sortOrder);
    if (existingVolumeId && existingVolumeId !== volume.id) {
      return true;
    }
  }

  const chapterIdByVolumeAndOrder = new Map<string, string>();
  for (const volume of existingVolumes) {
    for (const chapter of volume.chapters) {
      chapterIdByVolumeAndOrder.set(`${chapter.volumeId}:${chapter.chapterOrder}`, chapter.id);
    }
  }
  for (const volume of document.volumes) {
    for (const chapter of volume.chapters) {
      const existingChapterId = chapterIdByVolumeAndOrder.get(`${volume.id}:${chapter.chapterOrder}`);
      if (existingChapterId && existingChapterId !== chapter.id) {
        return true;
      }
    }
  }
  return false;
}

// ---- #166: 写入前序号冲突预检 ----
// VolumeChapterPlan 有 @@unique([volumeId, chapterOrder])，VolumePlan 有
// @@unique([novelId, sortOrder])。若 incoming 文档自身就带重复序号，
// requiresOrderParking 不会触发，随后的逐行 create/update 会直接撞唯一约束
// （Prisma P2002），还可能把工作区写成一半。写入前先拦下来，抛明确错误，
// 而不是让 Prisma 的原始错误透到用户面前。
export interface DuplicateOrderDetail {
  scope: "volume" | "chapter";
  volumeId: string;
  volumeTitle: string;
  order: number;
  ids: string[];
}

export function findDuplicateOrders(document: VolumePlanDocument): DuplicateOrderDetail[] {
  const duplicates: DuplicateOrderDetail[] = [];

  const volumeIdsBySortOrder = new Map<number, string[]>();
  for (const volume of document.volumes) {
    const ids = volumeIdsBySortOrder.get(volume.sortOrder) ?? [];
    ids.push(volume.id);
    volumeIdsBySortOrder.set(volume.sortOrder, ids);
  }
  for (const [order, ids] of volumeIdsBySortOrder) {
    if (ids.length > 1) {
      duplicates.push({ scope: "volume", volumeId: "", volumeTitle: "", order, ids });
    }
  }

  const chapterEntryByVolumeAndOrder = new Map<string, DuplicateOrderDetail>();
  for (const volume of document.volumes) {
    for (const chapter of volume.chapters) {
      const key = `${volume.id}:${chapter.chapterOrder}`;
      let entry = chapterEntryByVolumeAndOrder.get(key);
      if (!entry) {
        entry = {
          scope: "chapter",
          volumeId: volume.id,
          volumeTitle: volume.title,
          order: chapter.chapterOrder,
          ids: [],
        };
        chapterEntryByVolumeAndOrder.set(key, entry);
      }
      entry.ids.push(chapter.id);
    }
  }
  for (const entry of chapterEntryByVolumeAndOrder.values()) {
    if (entry.ids.length > 1) {
      duplicates.push(entry);
    }
  }

  return duplicates;
}

function assertNoDuplicateOrders(document: VolumePlanDocument): void {
  const duplicates = findDuplicateOrders(document);
  if (duplicates.length === 0) {
    return;
  }
  const detail = duplicates
    .map((duplicate) =>
      duplicate.scope === "volume"
        ? `卷序号 ${duplicate.order} 被 ${duplicate.ids.length} 个卷占用`
        : `《${duplicate.volumeTitle}》章节序号 ${duplicate.order} 被 ${duplicate.ids.length} 个章节占用`,
    )
    .join("；");
  throw new Error(`卷工作区文档存在重复序号，已拒绝保存以避免数据损坏：${detail}。请检查卷/章节规划后重试。`);
}

async function parkExistingVolumeWorkspaceRows(
  tx: Prisma.TransactionClient,
  existingVolumes: ExistingVolumeWorkspaceRow[],
): Promise<void> {
  let parkedChapterOrder = -1;
  for (const volume of existingVolumes) {
    for (const chapter of volume.chapters) {
      await tx.volumeChapterPlan.update({
        where: { id: chapter.id },
        data: { chapterOrder: parkedChapterOrder },
      });
      parkedChapterOrder -= 1;
    }
  }

  let parkedVolumeOrder = -1;
  for (const volume of existingVolumes) {
    await tx.volumePlan.update({
      where: { id: volume.id },
      data: { sortOrder: parkedVolumeOrder },
    });
    parkedVolumeOrder -= 1;
  }
}

export async function persistActiveVolumeWorkspace(
  tx: Prisma.TransactionClient,
  novelId: string,
  document: VolumePlanDocument,
  sourceVersionId: string | null,
): Promise<void> {
  // #166: incoming 文档自身若带重复序号，parking 不会触发、逐行写入会撞唯一约束；
  // 先拦下来，避免把工作区写成一半。
  assertNoDuplicateOrders(document);
  const existingVolumes = await tx.volumePlan.findMany({
    where: { novelId },
    select: {
      id: true,
      sortOrder: true,
      title: true,
      summary: true,
      mainPromise: true,
      escalationMode: true,
      protagonistChange: true,
      climax: true,
      nextVolumeHook: true,
      resetPoint: true,
      openPayoffsJson: true,
      status: true,
      sourceVersionId: true,
      chapters: {
        select: {
          id: true,
          volumeId: true,
          chapterId: true,
          chapterOrder: true,
          title: true,
          summary: true,
          purpose: true,
          conflictLevel: true,
          conflictLevelSource: true,
          revealLevel: true,
          targetWordCount: true,
          mustAvoid: true,
          taskSheet: true,
          sceneCards: true,
          payoffRefsJson: true,
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });
  const shouldParkOrders = requiresOrderParking(existingVolumes, document);
  if (shouldParkOrders) {
    await parkExistingVolumeWorkspaceRows(tx, existingVolumes);
  }

  const nextVolumeIds = new Set(document.volumes.map((volume) => volume.id));
  const nextChapterIds = new Set(document.volumes.flatMap((volume) => volume.chapters.map((chapter) => chapter.id)));
  const existingVolumeById = new Map(existingVolumes.map((volume) => [volume.id, volume]));
  const existingChapterById = new Map(
    existingVolumes.flatMap((volume) => volume.chapters.map((chapter) => [chapter.id, chapter] as const)),
  );

  for (const volume of document.volumes) {
    const existingVolume = existingVolumeById.get(volume.id);
    if (!existingVolume) {
      await tx.volumePlan.create({
        data: toVolumePlanData(novelId, volume, sourceVersionId),
      });
    } else if (shouldParkOrders || !isVolumeRowCurrent(existingVolume, volume, sourceVersionId)) {
      await tx.volumePlan.update({
        where: { id: volume.id },
        data: toVolumePlanUpdateData(novelId, volume, sourceVersionId),
      });
    }

    for (const chapter of volume.chapters) {
      const existingChapter = existingChapterById.get(chapter.id);
      if (!existingChapter) {
        await tx.volumeChapterPlan.create({
          data: toVolumeChapterPlanData(volume.id, chapter),
        });
      } else if (shouldParkOrders || !isChapterRowCurrent(existingChapter, volume.id, chapter)) {
        await tx.volumeChapterPlan.update({
          where: { id: chapter.id },
          data: toVolumeChapterPlanUpdateData(volume.id, chapter, existingChapter),
        });
      }
    }
  }

  const staleChapterIds = existingVolumes
    .flatMap((volume) => volume.chapters.map((chapter) => chapter.id))
    .filter((chapterId) => !nextChapterIds.has(chapterId));
  if (staleChapterIds.length > 0) {
    await tx.volumeChapterPlan.deleteMany({
      where: { id: { in: staleChapterIds } },
    });
  }

  const staleVolumeIds = existingVolumes
    .map((volume) => volume.id)
    .filter((volumeId) => !nextVolumeIds.has(volumeId));
  if (staleVolumeIds.length > 0) {
    await tx.volumePlan.deleteMany({
      where: { id: { in: staleVolumeIds } },
    });
  }

  await tx.novel.update({
    where: { id: novelId },
    data: {
      outline: document.derivedOutline,
      structuredOutline: document.derivedStructuredOutline,
      storylineStatus: document.volumes.length > 0 ? "in_progress" : undefined,
      outlineStatus: document.volumes.length > 0 ? "in_progress" : undefined,
    },
  });
  await syncArcCompatibility(tx, novelId, document.volumes);
}

export async function ensureVolumeWorkspaceDocument(params: {
  novelId: string;
  getLegacySource: () => Promise<LegacyVolumeSource>;
}): Promise<VolumePlanDocument> {
  const { novelId, getLegacySource } = params;
  const [activeRows, activeVersion] = await Promise.all([
    listActiveVolumeRows(novelId),
    getActiveVersionRow(novelId),
  ]);

  if (activeVersion) {
    const parsed = normalizeVolumeWorkspaceDocument(novelId, activeVersion.contentJson, {
      source: activeRows.length > 0 ? "volume" : "empty",
      activeVersionId: activeVersion.id,
    });
    const fallbackDocument = parsed.volumes.length > 0
      ? parsed
      : buildVolumeWorkspaceDocument({
        novelId,
        volumes: activeRows,
        source: activeRows.length > 0 ? "volume" : "empty",
        activeVersionId: activeVersion.id,
    });
    if (activeRows.length === 0 && fallbackDocument.volumes.length > 0) {
      await runVolumeWorkspaceTransaction(async (tx) => {
        await persistActiveVolumeWorkspace(tx, novelId, fallbackDocument, activeVersion.id);
      });
    }
    return fallbackDocument;
  }

  if (activeRows.length > 0) {
    return buildVolumeWorkspaceDocument({
      novelId,
      volumes: activeRows,
      source: "volume",
      activeVersionId: null,
    });
  }

  const latestVersion = await getLatestVersionRow(novelId);
  if (latestVersion) {
    const document = normalizeVolumeWorkspaceDocument(novelId, latestVersion.contentJson, {
      source: "volume",
      activeVersionId: latestVersion.id,
    });
    if (document.volumes.length > 0) {
      await runVolumeWorkspaceTransaction(async (tx) => {
        if (latestVersion.status !== "active") {
          await tx.volumePlanVersion.update({
            where: { id: latestVersion.id },
            data: { status: "active" },
          });
        }
        await persistActiveVolumeWorkspace(tx, novelId, document, latestVersion.id);
      });
      return document;
    }
  }

  const legacySource = await getLegacySource();
  const migratedVolumes = buildFallbackVolumesFromLegacy(novelId, legacySource);
  if (migratedVolumes.length === 0) {
    return buildVolumeWorkspaceDocument({
      novelId,
      volumes: [],
      source: "empty",
      activeVersionId: null,
    });
  }

  const legacyDocument = buildVolumeWorkspaceDocument({
    novelId,
    volumes: migratedVolumes,
    source: "legacy",
    activeVersionId: null,
  });
  const createdVersion = await runVolumeWorkspaceTransaction(async (tx) => {
    const version = await tx.volumePlanVersion.create({
      data: {
        novelId,
        version: 1,
        status: "active",
        contentJson: serializeVolumeWorkspaceDocument(legacyDocument),
        diffSummary: "从旧版主线/大纲自动回填为卷级方案。",
      },
    });
    await persistActiveVolumeWorkspace(tx, novelId, {
      ...legacyDocument,
      activeVersionId: version.id,
    }, version.id);
    return version;
  });

  return {
    ...legacyDocument,
    activeVersionId: createdVersion.id,
  };
}
