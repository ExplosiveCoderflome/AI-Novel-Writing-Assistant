import type { NovelAutoDirectorTaskSummary } from "@ai-novel/shared/types/novel";
import { prisma } from "../../../../db/prisma";
import { mapNovelAutoDirectorTaskSummary } from "../../../task/novelWorkflowTaskSummary";
import { getArchivedTaskIdSet } from "../../../task/taskArchive";
import { listNovelTokenUsageByNovelIds } from "../../novelTokenUsageSummary";
import { toImageAsset } from "../../../image/imageGenerationMappers";
import { normalizeNovelOutput, type PaginationInput } from "../../novelCoreShared";

export async function listNovels({ page, limit, search, status, narrativeForm, writingMode, sort = "updated" }: PaginationInput) {
  const normalizedSearch = search?.trim();
  const orderBy = sort === "created" ? { createdAt: "desc" as const } : { updatedAt: "desc" as const };
  const where = {
    ...(status ? { status } : {}),
    ...(narrativeForm ? { narrativeForm } : {}),
    ...(writingMode ? { writingMode } : {}),
    ...(normalizedSearch ? {
      OR: [
        { title: { contains: normalizedSearch } },
        { description: { contains: normalizedSearch } },
      ],
    } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.novel.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy,
      where,
      select: {
        id: true,
        title: true,
        description: true,
        targetAudience: true,
        bookSellingPoint: true,
        competingFeel: true,
        first30ChapterPromise: true,
        commercialTagsJson: true,
        status: true,
        writingMode: true,
        projectMode: true,
        creationExperience: true,
        narrativeForm: true,
        targetWordCount: true,
        derivedFromNovelId: true,
        writingPlatform: true,
        writingPlatformProfileVersion: true,
        narrativePov: true,
        pacePreference: true,
        styleTone: true,
        emotionIntensity: true,
        aiFreedom: true,
        postGenerationStyleReviewEnabled: true,
        defaultChapterLength: true,
        estimatedChapterCount: true,
        projectStatus: true,
        storylineStatus: true,
        outlineStatus: true,
        resourceReadyScore: true,
        sourceNovelId: true,
        sourceKnowledgeDocumentId: true,
        continuationBookAnalysisId: true,
        continuationBookAnalysisSections: true,
        genreId: true,
        primaryStoryModeId: true,
        secondaryStoryModeId: true,
        worldId: true,
        createdAt: true,
        updatedAt: true,
        genre: { select: { id: true, name: true } },
        world: { select: { id: true, name: true, worldType: true } },
        novelWorld: {
          select: {
            id: true,
            title: true,
            sourceWorld: { select: { id: true, name: true, worldType: true } },
          },
        },
        _count: { select: { chapters: true, characters: true, plotBeats: true } },
      },
    }),
    prisma.novel.count({ where }),
  ]);

  const novelIds = items.map((item) => item.id);
  const [latestAutoDirectorTaskByNovelId, latestCreationStudioTaskByNovelId, tokenUsageByNovelId, coverAssets, coverTasks] = await Promise.all([
    listLatestVisibleAutoDirectorTasksByNovelIds(novelIds),
    listLatestCreationStudioTasksByNovelIds(novelIds),
    listNovelTokenUsageByNovelIds(novelIds),
    prisma.imageAsset.findMany({
      where: { sceneType: "novel_cover", novelId: { in: novelIds }, isPrimary: true },
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.imageGenerationTask.findMany({
      where: {
        sceneType: "novel_cover",
        novelId: { in: novelIds },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    }),
  ]);
  const primaryCoverByNovelId = new Map<string, ReturnType<typeof toImageAsset>>();
  for (const asset of coverAssets) {
    if (asset.novelId && !primaryCoverByNovelId.has(asset.novelId)) {
      primaryCoverByNovelId.set(asset.novelId, toImageAsset(asset));
    }
  }
  const coverTaskByNovelId = new Map<string, (typeof coverTasks)[number]>();
  for (const task of coverTasks) {
    if (task.novelId && !coverTaskByNovelId.has(task.novelId)) coverTaskByNovelId.set(task.novelId, task);
  }

  return {
    items: items.map((item) => {
      const normalized = normalizeNovelOutput(item);
      const world = normalized.world ?? (normalized.novelWorld
        ? {
          id: normalized.novelWorld.sourceWorld?.id ?? normalized.novelWorld.id,
          name: normalized.novelWorld.sourceWorld?.name ?? normalized.novelWorld.title ?? "本书世界",
          worldType: normalized.novelWorld.sourceWorld?.worldType ?? null,
        }
        : null);
      return {
        ...normalized,
        world,
        latestAutoDirectorTask: latestAutoDirectorTaskByNovelId.get(item.id) ?? null,
        latestCreationStudioTask: latestCreationStudioTaskByNovelId.get(item.id) ?? null,
        tokenUsage: tokenUsageByNovelId.get(item.id) ?? null,
        primaryCover: primaryCoverByNovelId.get(item.id) ?? null,
        coverGeneration: coverTaskByNovelId.has(item.id)
          ? { taskId: coverTaskByNovelId.get(item.id)!.id, status: coverTaskByNovelId.get(item.id)!.status }
          : null,
      };
    }),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

async function listLatestCreationStudioTasksByNovelIds(
  novelIds: string[],
): Promise<Map<string, NovelAutoDirectorTaskSummary>> {
  const uniqueNovelIds = Array.from(new Set(novelIds.filter(Boolean)));
  if (uniqueNovelIds.length === 0) return new Map();
  const rows = await prisma.novelWorkflowTask.findMany({
    where: { lane: "creation_studio", novelId: { in: uniqueNovelIds } },
    select: {
      id: true,
      novelId: true,
      lane: true,
      status: true,
      progress: true,
      currentStage: true,
      currentItemKey: true,
      currentItemLabel: true,
      checkpointType: true,
      checkpointSummary: true,
      resumeTargetJson: true,
      seedPayloadJson: true,
      lastError: true,
      heartbeatAt: true,
      finishedAt: true,
      milestonesJson: true,
      title: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
  const archivedTaskIds = await getArchivedTaskIdSet("novel_workflow", rows.map((row) => row.id));
  const result = new Map<string, NovelAutoDirectorTaskSummary>();
  for (const row of rows) {
    if (!row.novelId || result.has(row.novelId) || archivedTaskIds.has(row.id)) continue;
    result.set(row.novelId, mapNovelAutoDirectorTaskSummary(row));
  }
  return result;
}

async function listLatestVisibleAutoDirectorTasksByNovelIds(
  novelIds: string[],
): Promise<Map<string, NovelAutoDirectorTaskSummary>> {
  const uniqueNovelIds = Array.from(new Set(novelIds.filter((id) => id.trim().length > 0)));
  if (uniqueNovelIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.novelWorkflowTask.findMany({
    where: {
      lane: "auto_director",
      novelId: {
        in: uniqueNovelIds,
      },
    },
    select: {
      id: true,
      novelId: true,
      lane: true,
      status: true,
      progress: true,
      currentStage: true,
      currentItemKey: true,
      currentItemLabel: true,
      checkpointType: true,
      checkpointSummary: true,
      resumeTargetJson: true,
      seedPayloadJson: true,
      lastError: true,
      heartbeatAt: true,
      finishedAt: true,
      milestonesJson: true,
      title: true,
      updatedAt: true,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });

  if (rows.length === 0) {
    return new Map();
  }

  const archivedTaskIds = await getArchivedTaskIdSet("novel_workflow", rows.map((row) => row.id));
  const visibleRows: typeof rows = [];
  const seenNovelIds = new Set<string>();
  for (const row of rows) {
    if (!row.novelId || archivedTaskIds.has(row.id) || seenNovelIds.has(row.novelId)) {
      continue;
    }
    visibleRows.push(row);
    seenNovelIds.add(row.novelId);
  }

  const liveTaskIds = visibleRows
    .filter((row) => row.status === "queued" || row.status === "running" || row.status === "waiting_approval")
    .map((row) => row.id);
  const latestLiveStepLabelByTaskId = new Map<string, string>();
  if (liveTaskIds.length > 0) {
    const liveSteps = await prisma.directorStepRun.findMany({
      where: {
        taskId: {
          in: liveTaskIds,
        },
        status: {
          in: ["running", "waiting_approval", "blocked_scope"],
        },
      },
      select: {
        taskId: true,
        label: true,
      },
      orderBy: [{ updatedAt: "desc" }, { startedAt: "desc" }],
    });
    for (const step of liveSteps) {
      if (!latestLiveStepLabelByTaskId.has(step.taskId) && step.label.trim().length > 0) {
        latestLiveStepLabelByTaskId.set(step.taskId, step.label.trim());
      }
    }
  }

  const taskByNovelId = new Map<string, NovelAutoDirectorTaskSummary>();
  for (const row of visibleRows) {
    const novelId = row.novelId;
    if (!novelId) {
      continue;
    }
    const rowCurrentItemLabel = row.currentItemLabel?.trim() || null;
    taskByNovelId.set(novelId, mapNovelAutoDirectorTaskSummary({
      ...row,
      currentItemLabel: rowCurrentItemLabel ?? latestLiveStepLabelByTaskId.get(row.id) ?? row.currentItemLabel,
    }));
  }
  return taskByNovelId;
}
