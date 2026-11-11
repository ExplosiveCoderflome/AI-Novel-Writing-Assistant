import {useState} from "react";
import {useMutation,useQueryClient} from "@tanstack/react-query";
import type {DirectorWorkspace} from "@/api/directorNext";
import {createDirectorCommandKey,submitDirectorCommand} from "@/api/directorNext";
import {queryKeys} from "@/api/queryKeys";
import LLMSelector from "@/components/common/LLMSelector";
import {useLLMStore} from "@/store/llmStore";
import {Button} from "@/components/ui/button";
import {nextUnwrittenChapter} from "@/pages/outlines/openBook/model";

// Explicit authorization only: preparation must not include the body-writing producer.
export const outlinePreparationSteps=["story_macro","book_contract","world_setup","character_setup","volume_strategy","volume_beat_sheet","volume_chapter_list","chapter_detail_bundle","execution_contract_sync"];
export default function OutlineWritingControls({book,initialStory,worldId}:{book:DirectorWorkspace;initialStory:string;worldId?:string|null}) {
  const total=book.novel.estimatedChapterCount ?? 1;
  const next=nextUnwrittenChapter(book.chapters,total);
  const [order,setOrder]=useState(next ?? total);
  const [confirmed,setConfirmed]=useState(false);
  const model=useLLMStore(),queries=useQueryClient();
  const chapter=book.chapters.find(row=>row.order===order);
  const written=Boolean(chapter?.content?.trim());
  const previousReady=order===1 || Boolean(book.chapters.find(row=>row.order===order-1)?.content?.trim());
  const valid=Number.isSafeInteger(order) && order>=1 && order<=total && previousReady && !written;
  const mutation=useMutation({mutationFn:(action:"opening"|"prepare"|"write")=>{
    if (!model.provider || !model.model) throw new Error("请先在模型设置中选择写作模型。");
    if (action!=="opening" && !valid) throw new Error("请先完成前一章；已有正文不会被覆盖。");
    if (action==="write" && !confirmed) throw new Error("请确认本次只生成当前章正文。");
    return submitDirectorCommand({type:"open_run",novelId:book.novel.id,driver:"assisted",stepIdsInScope:action==="write" ? null : outlinePreparationSteps,idempotencyKey:createDirectorCommandKey(),
      launchInput:{storyInput:initialStory,estimatedChapterCount:total,worldMode:worldId ? "reuse" : "skip",targetMode:"opening",provider:model.provider,model:model.model,temperature:model.temperature,
        ...(action!=="opening" ? {executionRange:{from:order,to:order}} : {})}});
  },onSuccess:async()=>{setConfirmed(false);await Promise.all([queries.invalidateQueries({queryKey:queryKeys.directorNext.summary(book.novel.id)}),queries.invalidateQueries({queryKey:queryKeys.directorNext.detail(book.novel.id)}),queries.invalidateQueries({queryKey:["directorBookWorkspace",book.novel.id]})]);}});
  return <section className="space-y-4 border-t border-border/50 py-4" aria-label="按大纲逐章确认">
    <h2 className="text-sm font-semibold">下一步写哪章</h2><p className="text-xs leading-6 text-muted-foreground">分阶段查看并确认补缺结果。准备章节不会生成正文；写完后先阅读修改，再推进下一章。</p>
    <Button variant="secondary" className="w-full" disabled={mutation.isPending} onClick={()=>mutation.mutate("opening")}>补齐开写准备</Button>
    <label className="flex items-center justify-between gap-3 text-sm">当前章<input aria-label="当前章" className="h-9 w-24 rounded-md border border-input bg-background px-3 text-right" type="number" min={1} max={total} value={order} onChange={event=>{setOrder(Number(event.target.value));setConfirmed(false);}}/></label>
    {written ? <p className="text-xs leading-6 text-muted-foreground">本章有正文，请从左侧目录阅读并修改；不会覆盖生成。</p> : !previousReady ? <p className="text-xs leading-6 text-warning">请先完成前一章并核对正文，再准备本章。</p> : null}
    {next===null ? <p className="text-xs leading-6 text-muted-foreground">目标范围内的章节都有正文，可从目录继续阅读修改。</p> : null}
    <Button variant="outline" className="w-full" disabled={!valid || mutation.isPending} onClick={()=>mutation.mutate("prepare")}>准备第 {order} 章</Button>
    <label className="flex cursor-pointer items-start gap-2 text-xs leading-6"><input type="checkbox" className="mt-1 accent-primary" checked={confirmed} disabled={!valid} onChange={event=>setConfirmed(event.target.checked)}/><span>本次仅生成第 {order} 章，确认采用本章安排；不自动写下一章。</span></label>
    <Button className="w-full" disabled={!valid || !confirmed || mutation.isPending} onClick={()=>mutation.mutate("write")}>{mutation.isPending ? "正在提交…" : `开始写第 ${order} 章`}</Button>
    {mutation.isError ? <p role="alert" className="text-xs leading-6 text-destructive">{mutation.error.message} 可检查本书导演状态后继续。</p> : null}
    <details><summary className="cursor-pointer text-xs text-muted-foreground">模型设置</summary><div className="pt-3"><LLMSelector compact showHelperText/></div></details>
  </section>;
}
