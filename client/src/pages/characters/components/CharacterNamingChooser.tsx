import { useState } from "react";
import type { CharacterNamingCandidatesOutput } from "@ai-novel/shared/types/characterNaming";
import { generateCharacterNameCandidates } from "@/api/character";
import { useLLMStore } from "@/store/llmStore";
import { Button } from "@/components/ui/button";

interface Props { currentName: string; role: string; background?: string; onSelect: (name: string) => void }
const control = "w-full rounded-md border bg-background px-2 py-2 text-sm";

export function CharacterNamingChooser({ currentName, role, background, onSelect }: Props) {
  const llm = useLLMStore();
  const [fields, setFields] = useState({ era: "", region: "", culture: "", age: "", family: "", role: "", surname: "", generation: "", forbiddenNames: "", forbiddenChars: "" });
  const [position, setPosition] = useState<1 | 2>(1);
  const [preference, setPreference] = useState<"plain" | "balanced" | "meaningful">("balanced");
  const [result, setResult] = useState<CharacterNamingCandidatesOutput | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const update = (key: keyof typeof fields, value: string) => setFields((old) => ({ ...old, [key]: value }));
  const generate = async () => {
    setPending(true); setError(""); setResult(null);
    try {
      const response = await generateCharacterNameCandidates({
        character: { currentName: currentName.trim() || undefined, role: fields.role.trim() || role.trim(), ageOrBirthEra: fields.age.trim() || undefined, familyBackground: fields.family.trim() || background?.slice(0, 400) || undefined },
        namingBackground: { era: fields.era.trim() || undefined, region: fields.region.trim() || undefined, languageCulture: fields.culture.trim() || undefined },
        constraints: {
          fixedSurname: fields.surname.trim() || undefined,
          generationChar: fields.generation.trim() ? { char: fields.generation.trim(), position } : undefined,
          forbiddenNames: fields.forbiddenNames.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean),
          forbiddenChars: [...fields.forbiddenChars.replace(/\s/g, "")], preference,
        }, candidateCount: 4,
        provider: llm.provider || undefined, model: llm.model || undefined,
      });
      if (!response.data) throw new Error(response.message || "取名候选生成失败");
      setResult(response.data);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "取名失败，请检查设置或稍后重试。"); }
    finally { setPending(false); }
  };
  return <details className="space-y-3 py-2 md:col-span-2"><summary className="cursor-pointer text-sm font-medium">结合人物背景挑选姓名</summary>
    <p className="pt-2 text-xs leading-5 text-muted-foreground">说明人物自己的出生年代与家庭，而非只填故事年代。候选理由供参考，也可以保留朴素的现名。</p>
    <div className="grid gap-3 md:grid-cols-2">{([
      ["role", "人物作用", role || "例如：守着老店、对迁居迟疑的姐姐", 200], ["era", "时代", "例如：十九世纪末，跨代人物分别说明", 80],
      ["region", "地域", "出生或成长地区", 80], ["culture", "语言文化", "方言、语言或通行转写习惯", 80],
      ["age", "年龄 / 出生年代", "人物的年龄与成长年代", 80], ["family", "家庭与命名习惯", background || "阶层、家族、兄弟姐妹或父母的命名习惯", 400],
    ] as const).map(([key, label, placeholder, maxLength]) => <label className="space-y-1 text-sm" key={key}><span>{label}</span><input className={control} value={fields[key]} maxLength={maxLength} placeholder={placeholder} onChange={(event) => update(key, event.target.value)} /></label>)}</div>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="space-y-1 text-sm"><span>固定姓氏（可选，支持多词姓）</span><input className={control} value={fields.surname} maxLength={60} onChange={(event) => update("surname", event.target.value)} /></label>
      <label className="space-y-1 text-sm"><span>取名倾向</span><select className={control} value={preference} onChange={(event) => setPreference(event.target.value as typeof preference)}><option value="plain">平实</option><option value="balanced">兼顾自然与辨识度</option><option value="meaningful">有明确寓意</option></select></label>
      <label className="space-y-1 text-sm"><span>字辈（可选，单字）</span><input className={control} value={fields.generation} maxLength={2} onChange={(event) => update("generation", event.target.value)} /></label>
      <label className="space-y-1 text-sm"><span>字辈在名中的位置（不含姓）</span><select className={control} value={position} onChange={(event) => setPosition(Number(event.target.value) as 1 | 2)}><option value={1}>第一个字</option><option value={2}>第二个字</option></select></label>
      <label className="space-y-1 text-sm"><span>禁用 / 已有姓名（逗号分隔）</span><input className={control} value={fields.forbiddenNames} maxLength={1000} onChange={(event) => update("forbiddenNames", event.target.value)} /></label>
      <label className="space-y-1 text-sm"><span>禁用字</span><input className={control} value={fields.forbiddenChars} maxLength={50} onChange={(event) => update("forbiddenChars", event.target.value)} /></label>
    </div>
    <Button type="button" variant="outline" onClick={() => void generate()} disabled={pending || !(fields.role.trim() || role.trim())}>{pending ? "正在取名…" : "生成 4 个候选"}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {result && <div className="space-y-3">
      <p className="text-sm">{result.keepCurrentName.recommended ? "建议保留现名：" : "现名参考："}{result.keepCurrentName.reason}</p>
      {result.candidates.map((candidate) => <div key={candidate.name} className="space-y-1 border-t py-3 text-sm">
        <div className="flex items-center justify-between gap-3"><strong>{candidate.name}</strong><Button type="button" size="sm" variant="outline" onClick={() => onSelect(candidate.name)}>填入草稿</Button></div>
        <p>{candidate.distinction}</p>
        <p className="text-xs leading-5 text-muted-foreground">时代：{candidate.rationale.era} · 地域：{candidate.rationale.region} · 语言文化：{candidate.rationale.languageCulture}</p>
        <p className="text-xs leading-5 text-muted-foreground">年龄与家庭：{candidate.rationale.ageAndFamily} · 人物作用：{candidate.rationale.storyRole}</p>
        {candidate.readingRisks.length > 0 && <p className="text-xs text-amber-700">阅读风险：{candidate.readingRisks.map((risk) => risk.detail).join("；")}</p>}
      </div>)}
    </div>}
    <p className="text-xs text-muted-foreground">选择只填入当前草稿，保存角色时采用；不会替换已有章节中的姓名。</p>
  </details>;
}
