import {
  CREATIVE_ORIENTATION_OPTIONS, NARRATIVE_DRIVE_OPTIONS, CONFLICT_SCALE_OPTIONS,
  CHARACTER_ARC_SHAPE_OPTIONS, CHAPTER_ENDING_MODE_OPTIONS, FOCALIZATION_OPTIONS,
  NARRATIVE_DISTANCE_OPTIONS, IMAGERY_DENSITY_OPTIONS, DIALOGUE_MODE_OPTIONS,
  NARRATOR_COMMENTARY_OPTIONS,
  type CreativeProfile, type CreativeProfileIssue, type CreativeOrientation,
  type CreativeProfileOption, type StyleDimensions,
} from "@ai-novel/shared/types/creativeProfile";
import SelectControl from "@/components/common/SelectControl";

interface Props {
  value?: CreativeProfile | null;
  issue?: CreativeProfileIssue | null;
  onChange: (value: CreativeProfile | null) => void;
}
const control = "w-full rounded-md border bg-background px-3 py-2 text-sm";

function Choice({ label, value, options, onChange }: {
  label: string; value?: string; options: CreativeProfileOption<string>[]; onChange: (value: string) => void;
}) {
  return <label className="space-y-1 text-sm"><span>{label}</span>
    <SelectControl className={control} value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
      <option value="">结合故事选择</option>
      {options.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
    </SelectControl>
    {value && <span className="block text-xs leading-5 text-muted-foreground">{options.find((item) => item.value === value)?.description}</span>}
  </label>;
}

export function CreativeProfileSection({ value, issue, onChange }: Props) {
  const profile = value ?? null;
  const patch = (next: Partial<CreativeProfile>) => {
    if (profile) onChange({ ...profile, ...next });
  };
  const style = (key: keyof StyleDimensions, next: string) => patch({ styleDimensions: { ...profile?.styleDimensions, [key]: next.trim() ? next : undefined } });
  const styleChoices = [
    ["focalization", "聚焦方式", FOCALIZATION_OPTIONS],
    ["narrativeDistance", "叙事距离", NARRATIVE_DISTANCE_OPTIONS],
    ["imagery", "意象安排", IMAGERY_DENSITY_OPTIONS],
    ["dialogue", "对白方式", DIALOGUE_MODE_OPTIONS],
    ["commentary", "叙述者议论", NARRATOR_COMMENTARY_OPTIONS],
  ] as const;
  return <section className="space-y-4 py-3">
    <div><h3 className="text-base font-medium">创作取向</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">题材决定写什么，取向决定作品靠什么成立。现代文学可以写任何时代；人称、篇幅与文风分别设置。</p></div>
    {issue && <div role="alert" className="space-y-2 text-sm text-destructive"><p>创作设置无法读取。重新选择取向并保存；其他设置的保存不会清除这项内容。</p><button type="button" className="underline" onClick={() => onChange(null)}>清除无法读取的设置并采用网文默认</button></div>}
    <label className="block space-y-1 text-sm"><span>作品取向</span>
      <SelectControl className={control} value={profile?.orientation ?? ""} onChange={(event) => {
        const orientation = event.target.value as CreativeOrientation | "";
        onChange(orientation ? { ...profile, schemaVersion: 1, orientation } : null);
      }}>
        <option value="">网文默认（未单独设置）</option>
        {CREATIVE_ORIENTATION_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
      </SelectControl>
    </label>
    {profile && <>
      <p className="text-xs leading-5 text-muted-foreground">用于后续规划、生成与检查，已有正文保持原样；更换取向后可调整未写章节的规划。</p>
      <p className="text-xs leading-5 text-muted-foreground">{CREATIVE_ORIENTATION_OPTIONS.find((option) => option.value === profile.orientation)?.description}</p>
      <details className="space-y-3"><summary className="cursor-pointer text-sm font-medium">叙事策略（可选）</summary>
        <div className="grid gap-4 pt-3 md:grid-cols-2">
          <Choice label="推进主要靠什么" value={profile.strategy?.drive} options={NARRATIVE_DRIVE_OPTIONS} onChange={(drive) => patch({ strategy: { ...profile.strategy, drive: (drive || undefined) as NonNullable<CreativeProfile["strategy"]>["drive"] } })} />
          <Choice label="主要人物弧线" value={profile.strategy?.arcShape} options={CHARACTER_ARC_SHAPE_OPTIONS} onChange={(arcShape) => patch({ strategy: { ...profile.strategy, arcShape: (arcShape || undefined) as NonNullable<CreativeProfile["strategy"]>["arcShape"] } })} />
        </div>
        <fieldset className="pt-3"><legend className="text-sm">主要冲突尺度（最多三项）</legend><div className="mt-2 flex flex-wrap gap-4">
          {CONFLICT_SCALE_OPTIONS.map((item) => { const selected = profile.strategy?.conflictScales ?? []; return <label className="flex items-center gap-2 text-sm" key={item.value} title={item.description}>
            <input type="checkbox" checked={selected.includes(item.value)} disabled={!selected.includes(item.value) && selected.length >= 3} onChange={(event) => { const list = event.target.checked ? [...selected, item.value] : selected.filter((entry) => entry !== item.value); patch({ strategy: { ...profile.strategy, conflictScales: list.length ? list : undefined } }); }} />{item.label}</label>; })}
        </div></fieldset>
        <fieldset className="pt-3"><legend className="text-sm">允许的章节收尾（不选时结合故事安排）</legend><div className="mt-2 flex flex-wrap gap-4">
          {CHAPTER_ENDING_MODE_OPTIONS.map((item) => { const selected = profile.strategy?.allowedChapterEndings ?? []; return <label className="flex items-center gap-2 text-sm" key={item.value} title={item.description}>
            <input type="checkbox" checked={selected.includes(item.value)} onChange={(event) => { const list = event.target.checked ? [...selected, item.value] : selected.filter((entry) => entry !== item.value); patch({ strategy: { ...profile.strategy, allowedChapterEndings: list.length ? list : undefined } }); }} />{item.label}</label>; })}
        </div></fieldset>
      </details>
      <details className="space-y-3"><summary className="cursor-pointer text-sm font-medium">文风维度（可选）</summary>
        <p className="pt-2 text-xs text-muted-foreground">人称与整体节奏沿用下方设置；具体语言写法可配合写法资产。这里选择叙述如何贴近人物、安排意象和对白。</p>
        <div className="grid gap-4 pt-2 md:grid-cols-2">{styleChoices.map(([key, label, options]) => <Choice key={key} label={label} value={profile.styleDimensions?.[key]} options={[...options]} onChange={(next) => style(key, next)} />)}</div>
        <label className="block space-y-1 text-sm"><span>全书一致性约定</span><input className={control} maxLength={300} value={profile.styleDimensions?.consistencyNotes ?? ""} placeholder="例如：保持人物各自的时代用语与称谓，意象随关系变化而复现" onChange={(event) => style("consistencyNotes", event.target.value)} /></label>
      </details>
      <details className="space-y-3"><summary className="cursor-pointer text-sm font-medium">人物命名背景（可选）</summary>
        <p className="pt-2 text-xs text-muted-foreground">跨时代故事可说明各代人的背景；具体人物的年龄、家庭和取名约束可在候选取名时补充。</p>
        <div className="grid gap-3 pt-2 md:grid-cols-2">{([
          ["era", "时代", 80], ["region", "地域", 80], ["languageCulture", "语言文化", 80], ["familyConventions", "家庭命名习惯", 300],
        ] as const).map(([key, label, maxLength]) => <label className="space-y-1 text-sm" key={key}><span>{label}</span><input className={control} maxLength={maxLength} value={profile.namingBackground?.[key] ?? ""} onChange={(event) => patch({ namingBackground: { ...profile.namingBackground, [key]: event.target.value.trim() ? event.target.value : undefined } })} /></label>)}</div>
      </details>
    </>}
  </section>;
}
