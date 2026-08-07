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
  { key: "idea", order: 0, label: "starting idea" },
  { key: "basic", order: 1, label: "Director's initial settings" },
  { key: "world_style", order: 2, label: "The world and writing" },
  { key: "model_run", order: 3, label: "Model and production preparation" },
  { key: "candidates", order: 4, label: "Orientation and automatic preparation" },
];

function findLabel(options: Array<{ value: string; label: string }>, value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function summarizeIdea(idea: string): string {
  const normalized = idea.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "Waiting to fill in the starting idea";
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
      ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
      : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  const styleProfile = input.styleProfiles.find((profile) => profile.id === input.styleProfileId);
  const styleLabel = styleProfile?.name
    ?? input.selectedStyleSummary?.headline
    ?? (input.basicForm.styleTone.trim() ? `文风：${input.basicForm.styleTone.trim()}` : "Default writing method");
  return `${worldLabel} · ${styleLabel}`;
}

export function summarizeModelRunStage(input: {
  runMode: DirectorRunMode;
  runModeOptions: DirectorRunModeOption[];
  postGenerationStyleReviewEnabled: boolean;
}): string {
  const runModeLabel = input.runModeOptions.find((option) => option.value === input.runMode)?.label ?? input.runMode;
  return `${runModeLabel} · ${input.postGenerationStyleReviewEnabled ? "Detect AI-scented text after post-processing" : "Disable AI-scented text after post-processing"}`;
}
