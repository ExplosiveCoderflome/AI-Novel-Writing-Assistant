import {
  buildDefaultNovelCoverSourceDescription,
  type NovelCoverImagePromptNovelContext,
} from "@ai-novel/shared/imagePrompt";
import { normalizeCommercialTags } from "@ai-novel/shared/types/novelFraming";
import type { StoryWorldSliceView } from "@ai-novel/shared/types/storyWorldSlice";
import type { NovelBasicFormState } from "../../novelBasicInfo.shared";

interface GenreOption {
  id: string;
  label: string;
  path: string;
}

interface StoryModeOption {
  id: string;
  name: string;
  label: string;
  path: string;
}

interface WorldOption {
  id: string;
  name: string;
}

export interface BuildNovelCoverDraftInput {
  basicForm: NovelBasicFormState;
  genreOptions: GenreOption[];
  storyModeOptions: StoryModeOption[];
  worldOptions: WorldOption[];
  worldSliceView?: StoryWorldSliceView | null;
}

const NARRATIVE_POV_LABELS: Record<NovelBasicFormState["narrativePov"], string> = {
  first_person: "第一人称",
  third_person: "第三人称",
  mixed: "混合视角",
};

const PACE_PREFERENCE_LABELS: Record<NovelBasicFormState["pacePreference"], string> = {
  slow: "慢节奏",
  balanced: "均衡",
  fast: "快节奏",
};

const EMOTION_INTENSITY_LABELS: Record<NovelBasicFormState["emotionIntensity"], string> = {
  low: "低情绪浓度",
  medium: "中情绪浓度",
  high: "高情绪浓度",
};

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function findNamedOption<T extends { id: string }>(
  options: T[],
  selectedId: string,
): T | null {
  if (!selectedId) {
    return null;
  }
  return options.find((item) => item.id === selectedId) ?? null;
}

export function buildNovelCoverDraftContext(
  input: BuildNovelCoverDraftInput,
): NovelCoverImagePromptNovelContext {
  const genre = findNamedOption(input.genreOptions, input.basicForm.genreId);
  const primaryStoryMode = findNamedOption(input.storyModeOptions, input.basicForm.primaryStoryModeId);
  const secondaryStoryMode = findNamedOption(input.storyModeOptions, input.basicForm.secondaryStoryModeId);
  const world = findNamedOption(input.worldOptions, input.basicForm.worldId);
  const worldSummary = normalizeOptionalText(input.worldSliceView?.slice?.coreWorldFrame);
  const commercialTags = normalizeCommercialTags(input.basicForm.commercialTagsText);

  return {
    title: normalizeOptionalText(input.basicForm.title) ?? "这本小说",
    description: normalizeOptionalText(input.basicForm.description),
    targetAudience: normalizeOptionalText(input.basicForm.targetAudience),
    bookSellingPoint: normalizeOptionalText(input.basicForm.bookSellingPoint),
    competingFeel: normalizeOptionalText(input.basicForm.competingFeel),
    first30ChapterPromise: normalizeOptionalText(input.basicForm.first30ChapterPromise),
    commercialTags: commercialTags.length > 0 ? commercialTags : null,
    genreLabel: normalizeOptionalText(genre?.path || genre?.label),
    primaryStoryModeLabel: normalizeOptionalText(primaryStoryMode?.path || primaryStoryMode?.label || primaryStoryMode?.name),
    secondaryStoryModeLabel: normalizeOptionalText(secondaryStoryMode?.path || secondaryStoryMode?.label || secondaryStoryMode?.name),
    worldName: normalizeOptionalText(world?.name),
    worldSummary,
    styleTone: normalizeOptionalText(input.basicForm.styleTone),
    narrativePovLabel: NARRATIVE_POV_LABELS[input.basicForm.narrativePov],
    pacePreferenceLabel: PACE_PREFERENCE_LABELS[input.basicForm.pacePreference],
    emotionIntensityLabel: EMOTION_INTENSITY_LABELS[input.basicForm.emotionIntensity],
  };
}

export function buildNovelCoverDraftSourcePrompt(input: BuildNovelCoverDraftInput): string {
  return buildDefaultNovelCoverSourceDescription(buildNovelCoverDraftContext(input));
}
