import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type {
  WorldSkeletonGenerationCounts,
  WorldSkeletonPreset,
} from "@ai-novel/shared/types/worldWizard";
import {
  WORLD_SKELETON_COUNT_LIMITS,
  WORLD_SKELETON_PRESET_COUNTS,
} from "@ai-novel/shared/types/worldWizard";
import { Button } from "@/components/ui/button";

const PRESET_CARDS: Array<{
  value: WorldSkeletonPreset;
  title: string;
  description: string;
}> = [
  {
    value: "light",
    title: i18next.t("dict.gen_080bd757"),
    description: i18next.t("dict.gen_8f1b2dec"),
  },
  {
    value: "standard",
    title: i18next.t("dict.gen_77e7b5d2"),
    description: i18next.t("dict.gen_17cc0890"),
  },
  {
    value: "epic",
    title: i18next.t("dict.gen_7dfb0759"),
    description: i18next.t("dict.gen_04522d6d"),
  },
];

const COUNT_LABELS: Record<keyof WorldSkeletonGenerationCounts, string> = {
  rules: i18next.t("dict.gen_0a431a82"),
  factionGroups: i18next.t("dict.gen_b3de18cc"),
  forces: i18next.t("dict.gen_6892df3b"),
  locations: i18next.t("dict.gen_ce7830fa"),
  conflicts: i18next.t("dict.gen_4360e03d"),
  storyEntrySuggestions: i18next.t("dict.gen_2ff7e9ff"),
};

interface WorldGeneratorStepTwoProps {
  preset: WorldSkeletonPreset;
  counts: WorldSkeletonGenerationCounts;
  generating: boolean;
  onPresetChange: (preset: WorldSkeletonPreset) => void;
  onCountChange: (key: keyof WorldSkeletonGenerationCounts, value: number) => void;
  onGenerateSkeleton: () => void;
}

export default function WorldGeneratorStepTwo(props: WorldGeneratorStepTwoProps) {
  const {
    preset,
    counts,
    generating,
    onPresetChange,
    onCountChange,
    onGenerateSkeleton,
  } = props;

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-background p-4">
        <div className="text-sm font-medium">{i18next.t("dict.gen_3d7f4575")}</div>
        <div className="mt-1 text-xs text-muted-foreground">{i18next.t("worlds.worldGeneratorStepTwo.x8cy6b")}</div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {PRESET_CARDS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`rounded-md border p-4 text-left transition ${
              preset === item.value ? "border-primary bg-primary/5" : "bg-background hover:border-primary/60"
            }`}
            onClick={() => onPresetChange(item.value)}
          >
            <div className="text-sm font-semibold">{item.title}</div>
            <div className="mt-2 text-xs leading-5 text-muted-foreground">{item.description}</div>
            <div className="mt-3 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
              <span>{i18next.t("dict.gen_dcfe557b")} {WORLD_SKELETON_PRESET_COUNTS[item.value].forces}</span>
              <span>{i18next.t("dict.gen_fc1a7d3c")} {WORLD_SKELETON_PRESET_COUNTS[item.value].locations}</span>
              <span>{i18next.t("dict.gen_93190be9")} {WORLD_SKELETON_PRESET_COUNTS[item.value].conflicts}</span>
              <span>{i18next.t("dict.gen_5639f70c")} {WORLD_SKELETON_PRESET_COUNTS[item.value].storyEntrySuggestions}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-md border p-4">
        <div className="text-sm font-medium">{i18next.t("dict.gen_c0099a4f")}</div>
        <div className="mt-1 text-xs text-muted-foreground">{i18next.t("worlds.worldGeneratorStepTwo.giab0b")}</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(Object.keys(COUNT_LABELS) as Array<keyof WorldSkeletonGenerationCounts>).map((key) => {
            const limit = WORLD_SKELETON_COUNT_LIMITS[key];
            return (
              <label key={key} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{COUNT_LABELS[key]}</span>
                  <span className="text-xs text-muted-foreground">{counts[key]}</span>
                </div>
                <input
                  className="mt-3 w-full"
                  type="range"
                  min={limit.min}
                  max={limit.max}
                  step={1}
                  value={counts[key]}
                  onChange={(event) => onCountChange(key, Number(event.target.value))}
                />
              </label>
            );
          })}
        </div>
      </div>

      <Button onClick={onGenerateSkeleton} disabled={generating}>
        {generating ? i18next.t("dict.gen_7ad924ca") : i18next.t("dict.gen_a9e8681a")}
      </Button>
    </div>
  );
}
