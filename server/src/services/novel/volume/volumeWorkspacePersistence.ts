import type { VolumePlan, VolumePlanDocument } from "@ai-novel/shared/types/novel";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
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

export async function persistActiveVolumeWorkspace(
  tx: Prisma.TransactionClient,
  novelId: string,
  document: VolumePlanDocument,
  sourceVersionId: string | null,
): Promise<void> {
  await tx.volumePlan.deleteMany({ where: { novelId } });
  for (const volume of document.volumes) {
    await tx.volumePlan.create({
      data: {
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
        chapters: {
          create: volume.chapters.map((chapter) => ({
            id: chapter.id,
            chapterOrder: chapter.chapterOrder,
            title: chapter.title,
            summary: chapter.summary,
            purpose: chapter.purpose ?? null,
            conflictLevel: chapter.conflictLevel ?? null,
            revealLevel: chapter.revealLevel ?? null,
            targetWordCount: chapter.targetWordCount ?? null,
            mustAvoid: chapter.mustAvoid ?? null,
            taskSheet: chapter.taskSheet ?? null,
            sceneCards: chapter.sceneCards ?? null,
            payoffRefsJson: JSON.stringify(chapter.payoffRefs),
          })),
        },
      },
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
      await prisma.$transaction(async (tx) => {
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
      await prisma.$transaction(async (tx) => {
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
  const createdVersion = await prisma.$transaction(async (tx) => {
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
