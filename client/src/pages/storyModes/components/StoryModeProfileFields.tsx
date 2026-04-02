import type { StoryModeProfile } from "@ai-novel/shared/types/storyMode";

function linesToList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listToLines(value: string[]): string {
  return value.join("\n");
}

interface StoryModeProfileFieldsProps {
  value: StoryModeProfile;
  onChange: (value: StoryModeProfile) => void;
}

export default function StoryModeProfileFields({
  value,
  onChange,
}: StoryModeProfileFieldsProps) {
  const updateList = (field: keyof Pick<
    StoryModeProfile,
    "progressionUnits" | "allowedConflictForms" | "forbiddenConflictForms" | "mandatorySignals" | "antiSignals"
  >, text: string) => {
    onChange({
      ...value,
      [field]: linesToList(text),
    });
  };

  return (
    <div className="grid gap-3">
      <label className="space-y-2 text-sm">
        <span className="font-medium text-foreground">核心驱动</span>
        <textarea
          rows={2}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          value={value.coreDrive}
          onChange={(event) => onChange({ ...value, coreDrive: event.target.value })}
        />
      </label>
      <label className="space-y-2 text-sm">
        <span className="font-medium text-foreground">读者奖励</span>
        <textarea
          rows={2}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          value={value.readerReward}
          onChange={(event) => onChange({ ...value, readerReward: event.target.value })}
        />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">章节推进单位</span>
          <textarea
            rows={4}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={listToLines(value.progressionUnits)}
            onChange={(event) => updateList("progressionUnits", event.target.value)}
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">允许冲突形式</span>
          <textarea
            rows={4}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={listToLines(value.allowedConflictForms)}
            onChange={(event) => updateList("allowedConflictForms", event.target.value)}
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">禁止冲突形式</span>
          <textarea
            rows={4}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={listToLines(value.forbiddenConflictForms)}
            onChange={(event) => updateList("forbiddenConflictForms", event.target.value)}
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">冲突上限</span>
          <select
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={value.conflictCeiling}
            onChange={(event) => onChange({ ...value, conflictCeiling: event.target.value as StoryModeProfile["conflictCeiling"] })}
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">化解方式</span>
          <textarea
            rows={2}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={value.resolutionStyle}
            onChange={(event) => onChange({ ...value, resolutionStyle: event.target.value })}
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">章节颗粒</span>
          <textarea
            rows={2}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={value.chapterUnit}
            onChange={(event) => onChange({ ...value, chapterUnit: event.target.value })}
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">卷末奖励</span>
          <textarea
            rows={2}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={value.volumeReward}
            onChange={(event) => onChange({ ...value, volumeReward: event.target.value })}
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">必须出现的信号</span>
          <textarea
            rows={4}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={listToLines(value.mandatorySignals)}
            onChange={(event) => updateList("mandatorySignals", event.target.value)}
          />
        </label>
      </div>
      <label className="space-y-2 text-sm">
        <span className="font-medium text-foreground">必须避免的跑偏信号</span>
        <textarea
          rows={4}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          value={listToLines(value.antiSignals)}
          onChange={(event) => updateList("antiSignals", event.target.value)}
        />
      </label>
    </div>
  );
}
