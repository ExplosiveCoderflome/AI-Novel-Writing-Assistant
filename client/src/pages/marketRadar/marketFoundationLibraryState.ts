import type {
  MarketProductionFoundationCandidate,
  MarketProductionFoundationSyncState,
} from "@ai-novel/shared/types/marketRadar";

export function resolveMarketFoundationLibraryState(
  candidate: MarketProductionFoundationCandidate | null | undefined,
  sync: MarketProductionFoundationSyncState | null | undefined,
) {
  const genreId = sync?.genre?.id ?? candidate?.genre.existingId ?? null;
  const primaryStoryModeId = sync?.storyModes?.primaryStoryMode.id
    ?? candidate?.primaryStoryMode.existingId
    ?? null;
  const secondaryStoryModeId = sync?.storyModes?.secondaryStoryMode?.id
    ?? candidate?.secondaryStoryMode?.existingId
    ?? null;
  return {
    genreId,
    primaryStoryModeId,
    secondaryStoryModeId,
    genreNeedsSync: Boolean(candidate && !genreId),
    storyModesNeedSync: Boolean(candidate && (
      !primaryStoryModeId || (candidate.secondaryStoryMode && !secondaryStoryModeId)
    )),
  };
}
