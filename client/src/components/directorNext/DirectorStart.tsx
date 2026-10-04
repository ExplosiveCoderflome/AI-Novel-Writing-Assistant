import {useState} from "react";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import LLMSelector from "@/components/common/LLMSelector";
import {useLLMStore} from "@/store/llmStore";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {createDirectorCommandKey,submitDirectorCommand} from "@/api/directorNext";
import {queryKeys} from "@/api/queryKeys";

export default function DirectorStart({novelId, estimatedChapterCount, nextChapter, initialStory, worldId, suggestedRange}: {
  novelId: string; estimatedChapterCount: number | null; nextChapter: number; initialStory: string; worldId?: string | null;
  suggestedRange?: {from:number;to:number}|null;
}) {
  const [story, setStory] = useState(initialStory), [count,setCount] = useState(Math.max(estimatedChapterCount ?? 30, nextChapter));
  const [production,setProduction] = useState(Boolean(suggestedRange)), [from,setFrom] = useState(suggestedRange?.from ?? nextChapter), [to,setTo] = useState(suggestedRange?.to ?? nextChapter);
  const [assisted,setAssisted] = useState(true), [qualityFirst,setQualityFirst] = useState(false);
  const [world,setWorld] = useState<"skip"|"reuse"|"generate">(worldId ? "reuse" : "skip");
  const model = useLLMStore(), queries = useQueryClient();
  const mutation = useMutation({mutationFn: async () => {
    if (!story.trim() || !model.provider || !model.model || !Number.isInteger(count) || count < 1) throw new Error("请填写故事方向、目标章数并选择模型。");
    if (production && (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > count)) throw new Error("请填写目标章数以内的有效章节范围。");
    return submitDirectorCommand({type:"open_run",novelId,driver:assisted ? "assisted" : "auto",stepIdsInScope:null,idempotencyKey:createDirectorCommandKey(),
      launchInput:{storyInput:story.trim(),estimatedChapterCount:count,worldMode:world,targetMode:"opening",provider:model.provider,model:model.model,temperature:model.temperature,
        issuePolicyMode:qualityFirst ? "quality_first" : "completion_first",...(production ? {executionRange:{from,to}} : {})}});
  },onSuccess: async()=>{await Promise.all([queries.invalidateQueries({queryKey:queryKeys.directorNext.summary(novelId)}),queries.invalidateQueries({queryKey:queryKeys.directorNext.detail(novelId)})]);}});
  return <section id="director-start" className="space-y-4 border-t border-border/50 py-5">
    <h2 className="text-sm font-semibold">{suggestedRange ? "选择后续正文范围" : "选择下一步创作"}</h2>
    <p className="text-xs leading-5 text-muted-foreground">核对章节范围后提交，AI 会补齐所需规划并写作；已有正文会保留。</p>
    <label className="flex gap-2 text-xs"><input type="checkbox" checked={production} onChange={e=>setProduction(e.target.checked)}/>生成指定章节正文</label>
    {production ? <div className="grid grid-cols-2 gap-3"><label className="space-y-2 text-xs">起始章<Input type="number" min={1} max={count} value={from} onChange={e=>setFrom(Number(e.target.value))}/></label><label className="space-y-2 text-xs">结束章<Input type="number" min={from} max={count} value={to} onChange={e=>setTo(Number(e.target.value))}/></label><p className="col-span-2 text-xs text-muted-foreground">本次只写上述范围。取消“生成指定章节正文”可只补齐规划。</p></div>:null}
    <p className="text-xs text-muted-foreground">{assisted ? "按阶段确认结果" : "全自动推进"} · {qualityFirst ? "质量问题需确认" : "局部质量问题记录提醒并继续"} · {model.model || "请在更多创作设置中选择模型"}</p>
    <Button className="w-full" disabled={mutation.isPending} onClick={()=>mutation.mutate()}>{mutation.isPending ? "提交中…" : production ? `提交并生成第 ${from}—${to} 章` : "提交并补齐创作规划"}</Button>
    {mutation.isError ? <p role="alert" className="text-xs text-destructive">{mutation.error.message}</p>:null}
    <details className="space-y-4 text-xs"><summary className="cursor-pointer text-muted-foreground">更多创作设置（故事方向、模型、确认方式）</summary>
    <label className="block space-y-2 text-xs">故事方向<textarea className="min-h-24 w-full rounded-md border border-input bg-background p-2 text-sm" value={story} onChange={e=>setStory(e.target.value)} placeholder="这本书讲什么，主角想达成什么？" /></label>
    <label className="block space-y-2 text-xs">全书目标章数<Input type="number" min={1} value={count} onChange={e=>setCount(Number(e.target.value))}/></label>
    <LLMSelector compact showHelperText />
    <label className="block space-y-2 text-xs">世界设定<select className="w-full rounded-md border border-input bg-background p-2" value={world} onChange={e=>setWorld(e.target.value as typeof world)}><option value="skip">不使用独立世界设定</option>{worldId ? <option value="reuse">使用本书关联世界</option>:null}<option value="generate">AI 准备世界设定</option></select></label>
    <label className="flex gap-2 text-xs"><input type="checkbox" checked={assisted} onChange={e=>setAssisted(e.target.checked)}/>按阶段确认结果（推荐）</label>
    <label className="flex gap-2 text-xs"><input type="checkbox" checked={qualityFirst} onChange={e=>setQualityFirst(e.target.checked)}/>质量问题需要我确认后再继续</label>
    </details>
  </section>;
}
