import i18next from "i18next";
import type { DirectorRunMode, DirectorWorldSetupMode } from "@ai-novel/shared/types/novelDirector";
import type { StyleIntentSummary } from "@ai-novel/shared/types/styleEngine";
import type { NovelBasicFormState } from "../novelBasicInfo.shared";
import {
  EMOTION_OPTIONS,
  PACE_OPTIONS,
  POV_OPTIONS,
  READER_CHANNEL_OPTIONS,
} from "../novelBasicInfo.shared";
import type { DirectorRunModeOption } from "../components/NovelAutoDirectorDialog.shared";

export type AutoDirectorCreateStageKey = "idea" | "basic" | "world_style" | "model_run" | "candidates";

export const AUTO_DIRECTOR_CREATE_STAGES: Array<{
  key: AutoDirectorCreateStageKey;
  order: number;
  label: string;
}> = [
  { key: "idea", order: 0, label: i18next.t("gen.pages.novels.autoDirector.directorCreateStages.gen_ed3a57cd") },
  { key: "basic", order: 1, label: i18next.t("gen.pages.novels.autoDirector.directorCreateStages.gen_06773c1e") },
  { key: "world_style", order: 2, label: i18next.t("gen.pages.novels.autoDirector.directorCreateStages.gen_0dffbb3f") },
  { key: "model_run", order: 3, label: i18next.t("gen.pages.novels.autoDirector.directorCreateStages.gen_061c5fc7") },
  { key: "candidates", order: 4, label: i18next.t("gen.pages.novels.autoDirector.directorCreateStages.gen_875c5ec8") },
];

function findLabel(options: Array<{ value: string; label: string }>, value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function summarizeIdea(idea: string): string {
  const normalized = idea.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return i18next.t("gen.pages.novels.autoDirector.directorCreateStages.gen_ed870737");
  }
  return normalized.length > 42 ? `${normalized.slice(0, 42)}...` : normalized;
}

export function summarizeBasicStage(basicForm: NovelBasicFormState): string {
  return [
    findLabel(READER_CHANNEL_OPTIONS, basicForm.readerChannelPreference),
    findLabel(POV_OPTIONS, basicForm.narrativePov),
    findLabel(PACE_OPTIONS, basicForm.pacePreference),
    findLabel(EMOTION_OPTIONS, basicForm.emotionIntensity),
    `约 ${basicForm.estimatedChapterCount} 章`,
  ].join(" · ");
}

export function summarizeWorldStyleStage(input: {
  basicForm: NovelBasicFormState;
  worldOptions: Array<{ id: string; name: string }>;
  worldSetupMode: DirectorWorldSetupMode;
  styleProfileId: string;
  styleProfiles: Array<{ id: string; name: string }>;
  selectedStyleSummary: StyleIntentSummary | null;
}): string {
  const selectedWorld = input.worldOptions.find((world) => world.id === input.basicForm.worldId);
  const worldLabel = selectedWorld
    ? `参考世界：${selectedWorld.name}`
    : input.worldSetupMode === "skip"
      ? i18next.t("gen.pages.novels.autoDirector.directorCreateStages.gen_5dcc48bb")
      : i18next.t("gen.pages.novels.autoDirector.directorCreateStages.gen_3684d509");
  const styleProfile = input.styleProfiles.find((profile) => profile.id === input.styleProfileId);
  const styleLabel = styleProfile?.name
    ?? input.selectedStyleSummary?.headline
    ?? (input.basicForm.styleTone.trim() ? `文风：${input.basicForm.styleTone.trim()}` : i18next.t("gen.pages.novels.autoDirector.directorCreateStages.gen_c9449912"));
  return `${worldLabel} · ${styleLabel}`;
}

export function summarizeModelRunStage(input: {
  runMode: DirectorRunMode;
  runModeOptions: DirectorRunModeOption[];
  postGenerationStyleReviewEnabled: boolean;
}): string {
  const runModeLabel = input.runModeOptions.find((option) => option.value === input.runMode)?.label ?? input.runMode;
  return `${runModeLabel} · ${input.postGenerationStyleReviewEnabled ? i18next.t("gen.pages.novels.autoDirector.directorCreateStages.gen_a28d5db1") : i18next.t("gen.pages.novels.autoDirector.directorCreateStages.gen_ae77d6e9")}`;
}
