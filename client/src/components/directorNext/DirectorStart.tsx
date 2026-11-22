import {useId, useState} from "react";
import {ArrowRight, Settings2} from "lucide-react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {directorChapterTokenLimitSchema, MAX_DIRECTOR_CHAPTER_TOKEN_LIMIT} from "@ai-novel/shared/types/director/chapterBudget";
import {getDirectorChapterBudgetSettings} from "@/api/settings";
import LLMSelector from "@/components/common/LLMSelector";
import {useLLMStore} from "@/store/llmStore";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {createDirectorCommandKey,submitDirectorCommand,type DirectorDriver} from "@/api/directorNext";
import {queryKeys} from "@/api/queryKeys";
import PanelDisclosure from "./panel/PanelDisclosure";

export default function DirectorStart({novelId, estimatedChapterCount, nextChapter, initialStory, worldId, suggestedRange, initialDriver = "assisted"}: {
  novelId: string; estimatedChapterCount: number | null; nextChapter: number; initialStory: string; worldId?: string | null;
  suggestedRange?: {from:number;to:number}|null;
  initialDriver?: DirectorDriver;
}) {
  const [story, setStory] = useState(initialStory), [count,setCount] = useState(Math.max(estimatedChapterCount ?? 30, nextChapter));
  const [production,setProduction] = useState(Boolean(suggestedRange)), [from,setFrom] = useState(suggestedRange?.from ?? nextChapter), [to,setTo] = useState(suggestedRange?.to ?? nextChapter);
  const [assisted,setAssisted] = useState(initialDriver === "assisted");
  const scopeId = useId();
  const [issuePolicyMode, setIssuePolicyMode] = useState<"inherit" | "quality_first" | "completion_first">("inherit");
  const [world,setWorld] = useState<"skip"|"reuse"|"generate">(worldId ? "reuse" : "skip");
  const model = useLLMStore(), queries = useQueryClient();
  const [chapterBudget, setChapterBudget] = useState("");
  const [volumeCount, setVolumeCount] = useState("");
  const validVolumeCount = !volumeCount || (Number.isInteger(Number(volumeCount)) && Number(volumeCount) >= 1 && Number(volumeCount) <= 24);
  const budgetSettings = useQuery({queryKey: queryKeys.settings.directorChapterBudget, queryFn: getDirectorChapterBudgetSettings});
  const validBudget = !chapterBudget.trim() || directorChapterTokenLimitSchema.safeParse(Number(chapterBudget)).success;
  const mutation = useMutation({mutationFn: async () => {
    if (!story.trim() || !model.provider || !model.model || !Number.isInteger(count) || count < 1) throw new Error("请填写故事方向、目标章数并选择模型。");
    if (production && (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > count)) throw new Error("请填写目标章数以内的有效章节范围。");
    if (!validVolumeCount) throw new Error("固定卷数须为 1–24 之间的整数，或留空由 AI 推荐。");
    if (!validBudget) throw new Error("单章 AI 用量上限须为 16,001 至 10,000,000 之间的整数。");
    return submitDirectorCommand({type:"open_run",novelId,driver:assisted ? "assisted" : "auto",stepIdsInScope:null,idempotencyKey:createDirectorCommandKey(),
      launchInput:{storyInput:story.trim(),estimatedChapterCount:count,...(volumeCount ? {userPreferredVolumeCount:Number(volumeCount)} : {}),worldMode:world,targetMode:"opening",provider:model.provider,model:model.model,temperature:model.temperature,
        issuePolicyMode: issuePolicyMode === "inherit" ? undefined : issuePolicyMode,...(chapterBudget.trim() ? {chapterTokenLimit:Number(chapterBudget)} : {}),...(production ? {executionRange:{from,to}} : {})}});
  },onSuccess: async()=>{await Promise.all([queries.invalidateQueries({queryKey:queryKeys.directorNext.summary(novelId)}),queries.invalidateQueries({queryKey:queryKeys.directorNext.detail(novelId)})]);}});
  return <section id="director-start" className="min-w-0 space-y-4">
    <h2 className="text-lg font-semibold leading-snug">下一步创作</h2>
    <fieldset className="grid min-w-0 grid-cols-2 gap-1 rounded-lg bg-muted p-1">
      <legend className="sr-only">选择创作内容</legend>
      {[{label: "写章节正文", writeChapters: true}, {label: "只做规划", writeChapters: false}].map(({label, writeChapters}) =>
        <label key={label} className="min-w-0 cursor-pointer">
          <input type="radio" className="peer sr-only" name={scopeId} checked={production === writeChapters} onChange={()=>setProduction(writeChapters)} />
          <span className="flex min-h-9 items-center justify-center rounded-md px-2 text-sm text-muted-foreground peer-checked:bg-background peer-checked:font-semibold peer-checked:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">{label}</span>
        </label>
      )}
    </fieldset>
    {production && <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
      <label className="min-w-0 space-y-1.5 text-sm font-medium">起始章<Input className="tabular-nums" type="number" min={1} max={count} value={from} onChange={e=>setFrom(Number(e.target.value))}/></label>
      <ArrowRight className="mb-3 size-4 text-muted-foreground" aria-hidden="true" />
      <label className="min-w-0 space-y-1.5 text-sm font-medium">结束章<Input className="tabular-nums" type="number" min={from} max={count} value={to} onChange={e=>setTo(Number(e.target.value))}/></label>
    </div>}
    <p className="text-sm leading-6 text-muted-foreground">{production ? "AI 会补齐规划，续写所选章节。已有正文会保留。" : "AI 会补齐本书的创作规划，已有正文会保留。"}</p>
    <label className="flex cursor-pointer items-start gap-2.5">
      <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={assisted} onChange={e=>setAssisted(e.target.checked)}/>
      <span className="text-sm font-medium">按阶段确认结果<span className="mt-0.5 block text-xs font-normal leading-5 text-muted-foreground">{assisted ? "每个阶段由你确认后继续。" : "AI 将按本次范围自动推进。"}</span></span>
    </label>
    <div className="border-y border-border/60">
      <PanelDisclosure title="更多创作设置" icon={Settings2} value={model.model || "选择模型"}>
        <div className="space-y-4 text-xs">
          <label className="block space-y-2 text-xs">单章 AI 用量上限（Tokens）<Input type="number" min={16001} max={MAX_DIRECTOR_CHAPTER_TOKEN_LIMIT} step={1}
            value={chapterBudget} placeholder={budgetSettings.data?.data ? `沿用全局设置：${budgetSettings.data.data.tokenLimit.toLocaleString("zh-CN")}` : "留空沿用全局设置"}
            aria-invalid={!validBudget} onChange={event=>setChapterBudget(event.target.value)}/></label>
          <p className="text-xs text-muted-foreground">使用系统默认额度时，每章可以按需自动追加一次。填写额度或使用已保存的全局设置时，需要确认后才能追加。</p>
          {!validBudget ? <p className="text-xs text-destructive">请输入 16,001 至 10,000,000 之间的整数，或留空沿用全局设置。</p> : null}
          <label className="block space-y-2 text-xs">故事方向<textarea className="min-h-24 w-full rounded-md border border-input bg-background p-2 text-sm" value={story} onChange={e=>setStory(e.target.value)} placeholder="这本书讲什么，主角想达成什么？" /></label>
          <label className="block space-y-2 text-xs">全书目标章数<Input type="number" min={1} value={count} onChange={e=>setCount(Number(e.target.value))}/></label>
          <label className="block space-y-2 text-xs">固定卷数（可选）<Input type="number" min={1} max={24} step={1} value={volumeCount} placeholder="留空由 AI 推荐" aria-invalid={!validVolumeCount} onChange={event=>setVolumeCount(event.target.value)}/></label>
          <p className="text-xs text-muted-foreground">填写 1–24 卷，AI 按指定卷数安排全书；已有卷结构会保留。</p>
          <LLMSelector compact showHelperText />
          <label className="block space-y-2 text-xs">世界设定<select className="w-full rounded-md border border-input bg-background p-2" value={world} onChange={e=>setWorld(e.target.value as typeof world)}><option value="skip">不使用独立世界设定</option>{worldId ? <option value="reuse">使用本书关联世界</option>:null}<option value="generate">AI 准备世界设定</option></select></label>
          <label className="block space-y-2 text-xs">本次质量处理
            <select className="w-full rounded-md border border-input bg-background p-2" value={issuePolicyMode}
              onChange={event => setIssuePolicyMode(event.target.value as typeof issuePolicyMode)}>
              <option value="inherit">沿用本书问题管理</option>
              <option value="quality_first">质量问题需我确认</option>
              <option value="completion_first">记录提醒并继续</option>
            </select>
          </label>
        </div>
      </PanelDisclosure>
    </div>
    <Button className="h-auto min-h-10 w-full gap-2 whitespace-normal" disabled={mutation.isPending || !validBudget || !validVolumeCount} onClick={()=>mutation.mutate()}>
      {mutation.isPending ? "提交中…" : production ? `提交并生成第 ${from}—${to} 章` : "提交并补齐创作规划"}
      {!mutation.isPending && <ArrowRight className="size-4 shrink-0" aria-hidden="true" />}
    </Button>
    {mutation.isError && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
  </section>;
}
