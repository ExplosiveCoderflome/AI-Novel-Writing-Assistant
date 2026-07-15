import { parseJsonStringArraySafe } from "../runtimeContextBlocks";

export interface RuntimeVolumeRewardRow {
  id: string;
  sortOrder: number;
  title: string;
  summary: string | null;
  mainPromise: string | null;
  openPayoffsJson: string | null;
  sourceVersion: { contentJson: string } | null;
  chapters: Array<{ chapterOrder: number }>;
}

function readVolumeRewardContext(
  contentJson: string | null | undefined,
  sortOrder: number,
): { readerRewardLadder: string; coreReward: string } {
  if (!contentJson?.trim()) {
    return { readerRewardLadder: "", coreReward: "" };
  }
  try {
    const parsed = JSON.parse(contentJson) as {
      strategyPlan?: {
        readerRewardLadder?: unknown;
        volumes?: Array<{ sortOrder?: unknown; coreReward?: unknown }>;
      } | null;
    };
    const strategy = parsed.strategyPlan;
    const volumeStrategy = strategy?.volumes?.find((item) => item.sortOrder === sortOrder);
    return {
      readerRewardLadder: typeof strategy?.readerRewardLadder === "string"
        ? strategy.readerRewardLadder.trim()
        : "",
      coreReward: typeof volumeStrategy?.coreReward === "string"
        ? volumeStrategy.coreReward.trim()
        : "",
    };
  } catch {
    return { readerRewardLadder: "", coreReward: "" };
  }
}

export function resolveActiveMilestonePayoffs(input: {
  chapterOrder: number;
  chapter3Payoff?: string | null;
  chapter10Payoff?: string | null;
  chapter30Payoff?: string | null;
}): string[] {
  const candidate = input.chapterOrder <= 3
    ? input.chapter3Payoff
    : input.chapterOrder <= 10
      ? input.chapter10Payoff
      : input.chapterOrder <= 30
        ? input.chapter30Payoff
        : null;
  return candidate?.trim() ? [candidate.trim()] : [];
}

export function buildRuntimeVolumeWindowSeed(
  volumeRows: RuntimeVolumeRewardRow[],
  chapterOrder: number,
) {
  const currentIndex = volumeRows.findIndex((volume) => (
    volume.chapters.some((chapter) => chapter.chapterOrder === chapterOrder)
  ));
  if (currentIndex < 0) {
    return {
      currentVolume: null,
      previousVolume: null,
      nextVolume: null,
      softFutureSummary: "",
    };
  }

  const currentVolume = volumeRows[currentIndex];
  const previousVolume = currentIndex > 0 ? volumeRows[currentIndex - 1] : null;
  const nextVolume = currentIndex < volumeRows.length - 1 ? volumeRows[currentIndex + 1] : null;
  const futureVolumes = volumeRows.slice(currentIndex + 1, currentIndex + 4);
  const rewardContext = readVolumeRewardContext(
    currentVolume.sourceVersion?.contentJson,
    currentVolume.sortOrder,
  );
  return {
    currentVolume: {
      id: currentVolume.id,
      sortOrder: currentVolume.sortOrder,
      title: currentVolume.title,
      summary: currentVolume.summary,
      mainPromise: currentVolume.mainPromise,
      openPayoffs: parseJsonStringArraySafe(currentVolume.openPayoffsJson),
      readerRewardLadder: rewardContext.readerRewardLadder,
      coreReward: rewardContext.coreReward,
    },
    previousVolume: previousVolume
      ? { title: previousVolume.title, summary: previousVolume.summary }
      : null,
    nextVolume: nextVolume
      ? { title: nextVolume.title, summary: nextVolume.summary }
      : null,
    softFutureSummary: futureVolumes.length > 0
      ? futureVolumes
        .map((volume) => `Volume ${volume.sortOrder} ${volume.title}: ${volume.mainPromise ?? volume.summary ?? "pending"}`)
        .join("\n")
      : "",
  };
}
