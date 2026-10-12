import type { StoryModeProfile } from "@ai-novel/shared/types/storyMode";
import SelectControl from "@/components/common/SelectControl";

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

  const textareaClassName = "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

  return (
    <div className="space-y-7">
      <section className="border-t border-border pt-6">
        <div>
          <h3 className="text-sm font-semibold text-foreground">核心体验</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">明确故事为什么能持续推进，以及读者每个阶段会得到什么。</p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">核心驱动</span>
            <textarea
              rows={3}
              className={textareaClassName}
              value={value.coreDrive}
              placeholder="例如：建设目标不断升级，资源与势力同步扩张。"
              onChange={(event) => onChange({ ...value, coreDrive: event.target.value })}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">读者回报</span>
            <textarea
              rows={3}
              className={textareaClassName}
              value={value.readerReward}
              placeholder="例如：看见成果落地、地盘扩大和角色地位提升。"
              onChange={(event) => onChange({ ...value, readerReward: event.target.value })}
            />
          </label>
        </div>
      </section>

      <section className="border-t border-border pt-6">
        <div>
          <h3 className="text-sm font-semibold text-foreground">推进节奏</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">规定章节如何形成小循环，以及阶段结束时怎样兑现成果。</p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">章节推进单位</span>
            <textarea
              rows={4}
              className={textareaClassName}
              value={listToLines(value.progressionUnits)}
              placeholder={"每行一项，例如：\n发现资源缺口\n完成建设目标\n获得阶段反馈"}
              onChange={(event) => updateList("progressionUnits", event.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">章节颗粒</span>
            <textarea
              rows={4}
              className={textareaClassName}
              value={value.chapterUnit}
              placeholder="说明一章通常完成多大的目标和变化。"
              onChange={(event) => onChange({ ...value, chapterUnit: event.target.value })}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">常用化解方式</span>
            <textarea
              rows={3}
              className={textareaClassName}
              value={value.resolutionStyle}
              placeholder="主角通常依靠什么解决阻力并进入下一阶段。"
              onChange={(event) => onChange({ ...value, resolutionStyle: event.target.value })}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">阶段 / 卷末回报</span>
            <textarea
              rows={3}
              className={textareaClassName}
              value={value.volumeReward}
              placeholder="说明一个大阶段结束时必须兑现的成果。"
              onChange={(event) => onChange({ ...value, volumeReward: event.target.value })}
            />
          </label>
        </div>
      </section>

      <section className="border-t border-border pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">边界与防跑偏</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">告诉 AI 哪些冲突适合这种模式，以及写到什么程度应该收住。</p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm">
            <span className="font-medium text-foreground">冲突强度</span>
            <SelectControl
              className="w-28"
              value={value.conflictCeiling}
              onChange={(event) => onChange({ ...value, conflictCeiling: event.target.value as StoryModeProfile["conflictCeiling"] })}
            >
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </SelectControl>
          </label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">适合的冲突</span>
            <textarea
              rows={4}
              className={textareaClassName}
              value={listToLines(value.allowedConflictForms)}
              placeholder="每行一种适合反复使用的冲突形式。"
              onChange={(event) => updateList("allowedConflictForms", event.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">不适合的冲突</span>
            <textarea
              rows={4}
              className={textareaClassName}
              value={listToLines(value.forbiddenConflictForms)}
              placeholder="每行一种会破坏该模式体验的冲突形式。"
              onChange={(event) => updateList("forbiddenConflictForms", event.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">必须出现的信号</span>
            <textarea
              rows={4}
              className={textareaClassName}
              value={listToLines(value.mandatorySignals)}
              placeholder="每行一个能证明推进模式正在生效的信号。"
              onChange={(event) => updateList("mandatorySignals", event.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">必须避免的跑偏信号</span>
            <textarea
              rows={4}
              className={textareaClassName}
              value={listToLines(value.antiSignals)}
              placeholder="每行一个出现后说明故事正在偏离该模式的信号。"
              onChange={(event) => updateList("antiSignals", event.target.value)}
            />
          </label>
        </div>
      </section>
    </div>
  );
}
