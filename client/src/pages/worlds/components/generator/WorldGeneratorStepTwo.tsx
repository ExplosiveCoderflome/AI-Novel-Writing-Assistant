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
    title: t("gen.pages.worlds.components.generator.WorldGeneratorStepTwo.gen_080bd757"),
    description: t("gen.pages.worlds.components.generator.WorldGeneratorStepTwo.gen_8f1b2dec"),
  },
  {
    value: "standard",
    title: t("gen.pages.worlds.components.generator.WorldGeneratorStepTwo.gen_77e7b5d2"),
    description: t("gen.pages.worlds.components.generator.WorldGeneratorStepTwo.gen_17cc0890"),
  },
  {
    value: "epic",
    title: t("gen.pages.worlds.components.generator.WorldGeneratorStepTwo.gen_7dfb0759"),
    description: t("gen.pages.worlds.components.generator.WorldGeneratorStepTwo.gen_04522d6d"),
  },
];

const COUNT_LABELS: Record<keyof WorldSkeletonGenerationCounts, string> = {
  rules: t("gen.pages.worlds.components.generator.WorldGeneratorStepTwo.gen_0a431a82"),
  factionGroups: t("gen.pages.worlds.components.generator.WorldGeneratorStepTwo.gen_b3de18cc"),
  forces: t("gen.pages.worlds.components.generator.WorldGeneratorStepTwo.gen_6892df3b"),
  locations: t("gen.pages.worlds.components.generator.WorldGeneratorStepTwo.gen_ce7830fa"),
  conflicts: t("gen.pages.worlds.components.generator.WorldGeneratorStepTwo.gen_4360e03d"),
  storyEntrySuggestions: t("gen.pages.worlds.components.generator.WorldGeneratorStepTwo.gen_2ff7e9ff"),
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
        <div className="text-sm font-medium">{t("gen.pages.worlds.components.generator.WorldGeneratorStepTwo.gen_3d7f4575")}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          规模会决定 AI 生成多少规则、阵营、具体势力、关键地点和可开书入口。默认推荐“标准长篇”。
        </div>
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
              <span>{t("gen.pages.worlds.components.generator.WorldGeneratorStepTwo.gen_e5cf4116")}</span>
              <span>{t("gen.pages.worlds.components.generator.WorldGeneratorStepTwo.gen_8579bec0")}</span>
              <span>{t("gen.pages.worlds.components.generator.WorldGeneratorStepTwo.gen_459399c1")}</span>
              <span>{t("gen.pages.worlds.components.generator.WorldGeneratorStepTwo.gen_35f03500")}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-md border p-4">
        <div className="text-sm font-medium">{t("gen.pages.worlds.components.generator.WorldGeneratorStepTwo.gen_c0099a4f")}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          新手建议保持默认；只有明确想要更小或更大的世界时再调整。
        </div>
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
        {generating ? t("gen.pages.worlds.components.generator.WorldGeneratorStepTwo.gen_7ad924ca") : t("gen.pages.worlds.components.generator.WorldGeneratorStepTwo.gen_a9e8681a")}
      </Button>
    </div>
  );
}
