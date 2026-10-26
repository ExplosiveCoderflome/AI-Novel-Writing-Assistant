import type {Prisma} from "@prisma/client";
import {prisma} from "../../../../db/prisma";
import type {StoryMacroPlanService} from "../../storyMacro/StoryMacroPlanService";
import type {VolumeGenerationNovel,VolumeWorkspace} from "../volumeModels";
import {buildStoryModePromptBlock,normalizeStoryModeOutput} from "../../../storyMode/storyModeProfile";
import {buildDirectorCompletionProfile} from "@ai-novel/shared/types/directorCompletion";
type StoryMacroPlanResult=Awaited<ReturnType<StoryMacroPlanService["getPlan"]>>|null;
export async function loadGenerationContext(params: {
  novelId: string;
  workspace: VolumeWorkspace;
  storyMacroPlanService: Pick<StoryMacroPlanService, "getPlan">;
  db?: Pick<Prisma.TransactionClient, "novel">;
  strictSources?: boolean;
}): Promise<{
  novel: VolumeGenerationNovel;
  storyMacroPlan: StoryMacroPlanResult;
}> {
  const { novelId, storyMacroPlanService } = params;
  const [rawNovel, storyMacroPlan] = await Promise.all([
    (params.db ?? prisma).novel.findUnique({
      where: { id: novelId },
      select: {
        title: true,
        description: true,
        targetAudience: true,
        bookSellingPoint: true,
        competingFeel: true,
        first30ChapterPromise: true,
        commercialTagsJson: true,
        estimatedChapterCount: true,
        narrativePov: true,
        pacePreference: true,
        emotionIntensity: true,
        primaryStoryMode: {
          select: {
            id: true,
            name: true,
            description: true,
            template: true,
            parentId: true,
            profileJson: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        secondaryStoryMode: {
          select: {
            id: true,
            name: true,
            description: true,
            template: true,
            parentId: true,
            profileJson: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        genre: {
          select: { name: true },
        },
        characters: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            role: true,
            castRole: true,
            currentGoal: true,
            currentState: true,
          },
        },
      },
    }),
    params.strictSources ? storyMacroPlanService.getPlan(novelId) : storyMacroPlanService.getPlan(novelId).catch(() => null),
  ]);

  if (!rawNovel) {
    throw new Error("小说不存在。");
  }

  const novel: VolumeGenerationNovel = {
    ...rawNovel,
    completionProfile: buildDirectorCompletionProfile(rawNovel.estimatedChapterCount ?? 80),
    storyModePromptBlock: buildStoryModePromptBlock({
      primary: rawNovel.primaryStoryMode ? normalizeStoryModeOutput(rawNovel.primaryStoryMode) : null,
      secondary: rawNovel.secondaryStoryMode ? normalizeStoryModeOutput(rawNovel.secondaryStoryMode) : null,
    }),
  };

  return {
    novel,
    storyMacroPlan,
  };
}
