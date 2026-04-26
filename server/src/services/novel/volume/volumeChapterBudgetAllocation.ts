import type { VolumePlan } from "@ai-novel/shared/types/novel";
import type {
  VolumeGenerateOptions,
  VolumeGenerationNovel,
  VolumeWorkspace,
} from "./volumeModels";

export function deriveChapterBudget(params: {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  options: VolumeGenerateOptions;
}): number {
  const { novel, workspace, options } = params;
  return Math.max(
    options.estimatedChapterCount ?? 0,
    novel.estimatedChapterCount ?? 0,
    workspace.volumes.flatMap((volume) => volume.chapters).length,
    12,
  );
}

function buildEvenChapterBudgets(input: {
  safeVolumeCount: number;
  minimumPerVolume: number;
  totalBudget: number;
}): number[] {
  const baseBudget = Math.floor(input.totalBudget / input.safeVolumeCount);
  let remainder = input.totalBudget - (baseBudget * input.safeVolumeCount);
  return Array.from({ length: input.safeVolumeCount }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return Math.max(input.minimumPerVolume, baseBudget + extra);
  });
}

function shouldUseExistingVolumeWeights(existingCounts: number[], minimumPerVolume: number): boolean {
  return existingCounts.length > 0
    && existingCounts.every((count) => count >= minimumPerVolume);
}

export function allocateChapterBudgets(params: {
  volumeCount: number;
  chapterBudget: number;
  existingVolumes: VolumePlan[];
}): number[] {
  const { volumeCount, chapterBudget, existingVolumes } = params;
  const safeVolumeCount = Math.max(volumeCount, 1);
  const minimumPerVolume = 3;
  const totalBudget = Math.max(chapterBudget, safeVolumeCount * minimumPerVolume);
  const existingCounts = Array.from(
    { length: safeVolumeCount },
    (_, index) => Math.max(existingVolumes[index]?.chapters.length ?? 0, 0),
  );

  if (!shouldUseExistingVolumeWeights(existingCounts, minimumPerVolume)) {
    return buildEvenChapterBudgets({
      safeVolumeCount,
      minimumPerVolume,
      totalBudget,
    });
  }

  const weights = existingCounts.map((count) => Math.max(count, 1));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const budgets = weights.map((weight) => Math.max(
    minimumPerVolume,
    Math.round((totalBudget * weight) / totalWeight),
  ));
  let delta = totalBudget - budgets.reduce((sum, budget) => sum + budget, 0);

  while (delta !== 0) {
    const direction = delta > 0 ? 1 : -1;
    for (let index = 0; index < budgets.length && delta !== 0; index += 1) {
      if (direction < 0 && budgets[index] <= minimumPerVolume) {
        continue;
      }
      budgets[index] += direction;
      delta -= direction;
    }
  }

  return budgets;
}
