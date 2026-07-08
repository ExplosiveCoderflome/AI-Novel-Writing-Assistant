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
  { key: "idea", order: 0, label: "起始想法" },
  { key: "basic", order: 1, label: "导演起始设置" },
  { key: "world_style", order: 2, label: "世界与写法" },
  { key: "model_run", order: 3, label: "模型与运行方式" },
  { key: "candidates", order: 4, label: "方向候选" },
];

function findLabel(options: Array<{ value: string; label: string }>, value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function summarizeIdea(idea: string): string {
  const normalized = idea.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "等待填写起始想法";
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
      ? "暂不使用世界观"
      : "自动生成本书世界";
  const styleProfile = input.styleProfiles.find((profile) => profile.id === input.styleProfileId);
  const styleLabel = styleProfile?.name
    ?? input.selectedStyleSummary?.headline
    ?? (input.basicForm.styleTone.trim() ? `文风：${input.basicForm.styleTone.trim()}` : "默认写法");
  return `${worldLabel} · ${styleLabel}`;
}

export function summarizeModelRunStage(input: {
  runMode: DirectorRunMode;
  runModeOptions: DirectorRunModeOption[];
  postGenerationStyleReviewEnabled: boolean;
}): string {
  const runModeLabel = input.runModeOptions.find((option) => option.value === input.runMode)?.label ?? input.runMode;
  return `${runModeLabel} · ${input.postGenerationStyleReviewEnabled ? "正文后检测 AI 味" : "不做正文后 AI 味检测"}`;
}
