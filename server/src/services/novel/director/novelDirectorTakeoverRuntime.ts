import type { DirectorTakeoverNovelContext, DirectorTakeoverAssetSnapshot } from "./novelDirectorTakeover";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import type { BookContractService } from "../BookContractService";
import { prisma } from "../../../db/prisma";
import { normalizeNovelOutput } from "../novelCoreShared";
import { DIRECTOR_PROGRESS } from "./novelDirectorProgress";

export interface DirectorTakeoverLoadedState {
  novel: DirectorTakeoverNovelContext;
  storyMacroPlan: StoryMacroPlan | null;
  bookContract: Awaited<ReturnType<BookContractService["getByNovelId"]>>;
  snapshot: DirectorTakeoverAssetSnapshot;
  activeTaskId: string | null;
  hasActiveTask: boolean;
}

export async function loadDirectorTakeoverState(input: {
  novelId: string;
  getStoryMacroPlan: (novelId: string) => Promise<StoryMacroPlan | null>;
  getDirectorAssetSnapshot: (novelId: string) => Promise<{
    characterCount: number;
    chapterCount: number;
    volumeCount: number;
    firstVolumeId: string | null;
    firstVolumeChapterCount: number;
  }>;
  findActiveAutoDirectorTask: (novelId: string) => Promise<{ id: string } | null>;
}): Promise<DirectorTakeoverLoadedState> {
  const [novelRow, storyMacroPlan, assets, activeTask] = await Promise.all([
    prisma.novel.findUnique({
      where: { id: input.novelId },
      select: {
        id: true,
        title: true,
        description: true,
        targetAudience: true,
        bookSellingPoint: true,
        competingFeel: true,
        first30ChapterPromise: true,
        commercialTagsJson: true,
        genreId: true,
        worldId: true,
        writingMode: true,
        projectMode: true,
        narrativePov: true,
        pacePreference: true,
        styleTone: true,
        emotionIntensity: true,
        aiFreedom: true,
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
        bookContract: true,
      },
    }),
    input.getStoryMacroPlan(input.novelId).catch(() => null),
    input.getDirectorAssetSnapshot(input.novelId),
    input.findActiveAutoDirectorTask(input.novelId),
  ]);
  if (!novelRow) {
    throw new Error("小说不存在。");
  }
  const novel = normalizeNovelOutput(novelRow) as DirectorTakeoverNovelContext & {
    bookContract?: Awaited<ReturnType<BookContractService["getByNovelId"]>>;
  };
  return {
    novel,
    storyMacroPlan,
    bookContract: novel.bookContract ?? null,
    snapshot: {
      ...assets,
      hasStoryMacroPlan: Boolean(storyMacroPlan?.storyInput?.trim() && storyMacroPlan.decomposition),
      hasBookContract: Boolean(novel.bookContract),
    },
    activeTaskId: activeTask?.id ?? null,
    hasActiveTask: Boolean(activeTask),
  };
}

export function resolveDirectorRunningStateForPhase(
  phase: "story_macro" | "character_setup" | "volume_strategy" | "structured_outline",
) {
  if (phase === "story_macro") {
    return {
      stage: "story_macro" as const,
      itemKey: "book_contract" as const,
      itemLabel: "正在准备 Book Contract 与故事宏观规划",
      progress: DIRECTOR_PROGRESS.bookContract,
    };
  }
  if (phase === "character_setup") {
    return {
      stage: "character_setup" as const,
      itemKey: "character_setup" as const,
      itemLabel: "正在补齐角色准备",
      progress: DIRECTOR_PROGRESS.characterSetup,
    };
  }
  if (phase === "volume_strategy") {
    return {
      stage: "volume_strategy" as const,
      itemKey: "volume_strategy" as const,
      itemLabel: "正在继续生成卷战略",
      progress: DIRECTOR_PROGRESS.volumeStrategy,
    };
  }
  return {
    stage: "structured_outline" as const,
    itemKey: "beat_sheet" as const,
    itemLabel: "正在继续生成第 1 卷节奏板与细化",
    progress: DIRECTOR_PROGRESS.beatSheet,
  };
}
