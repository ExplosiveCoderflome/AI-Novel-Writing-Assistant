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
    title: "轻量舞台",
    description: "适合短篇、单主线、低复杂度，先得到一个清楚好写的故事舞台。",
  },
  {
    value: "standard",
    title: "标准长篇",
    description: "适合多数网文长篇，默认生成足够的规则、势力、地点和开局入口。",
  },
  {
    value: "epic",
    title: "复杂群像",
    description: "适合多势力、多地点、多线冲突，需要更强的地图和关系承载。",
  },
];

const COUNT_LABELS: Record<keyof WorldSkeletonGenerationCounts, string> = {
  rules: "核心规则",
  factionGroups: "阵营方向",
  forces: "具体势力",
  locations: "关键地点",
  conflicts: "关系/冲突",
  storyEntrySuggestions: "故事入口",
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
        <div className="text-sm font-medium">选择世界规模</div>
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
              <span>势力 {WORLD_SKELETON_PRESET_COUNTS[item.value].forces}</span>
              <span>地点 {WORLD_SKELETON_PRESET_COUNTS[item.value].locations}</span>
              <span>冲突 {WORLD_SKELETON_PRESET_COUNTS[item.value].conflicts}</span>
              <span>入口 {WORLD_SKELETON_PRESET_COUNTS[item.value].storyEntrySuggestions}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-md border p-4">
        <div className="text-sm font-medium">调整数量</div>
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
        {generating ? "生成世界骨架中..." : "生成世界骨架"}
      </Button>
    </div>
  );
}
