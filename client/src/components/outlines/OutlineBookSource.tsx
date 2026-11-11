import {useQuery} from "@tanstack/react-query";
import {Link} from "react-router-dom";
import {getOutlineRevision} from "@/api/outlines";
import type {OutlineBookBindingView} from "@ai-novel/shared/types/outlineOpenBook";
import {Button} from "@/components/ui/button";
import {OutlinePreservationDetails} from "./OutlinePreservationDetails";
import {findOutlineNodeTitle,formatOutlineValue,outlineFieldLabels} from "@/pages/outlines/outlineNodes";

export function OutlineBookSource({binding}:{binding:OutlineBookBindingView}) {
  const source=useQuery({queryKey:["outline-revision",binding.projectId,binding.revisionId],queryFn:()=>getOutlineRevision(binding.projectId,binding.revisionId)});
  const differences=binding.sourceDifferences ?? [];
  const kinds={added:"新增",removed:"移除",updated:"修改",moved:"移动"};
  return <section className="shrink-0 rounded-md bg-muted/30 px-4 py-3 text-sm" aria-label="大纲来源与绑定摘要">
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"><p><strong>按大纲创作</strong><span className="ml-3 text-muted-foreground">固定采用修订 v{binding.revisionVersion} · {binding.mapping.volumes.length} 卷 · {binding.mapping.chapters.length} 份源章纲 · 每次只写一章</span></p><Button asChild variant="ghost" size="sm"><Link to={`/outlines/${binding.projectId}`}>打开源大纲工作台</Link></Button></div>
    <p className="mt-1 text-xs leading-6 text-muted-foreground">已填内容保留，空白按需补齐；开书本身不调用模型。独立大纲和本书运行规划分别保存。</p>
    <details className="mt-2"><summary className="cursor-pointer text-xs">查看采用的大纲 v{binding.revisionVersion} · 保留明细与章节位置</summary><div className="mt-3 max-h-72 space-y-4 overflow-y-auto pr-2">
      {source.data ? <OutlinePreservationDetails policy={binding.policy} document={source.data.document}/> : <p className="text-xs text-muted-foreground">{source.isError ? "源修订读取失败，请打开源大纲核对。" : "正在读取源修订…"}</p>}
      {binding.mapping.volumes.map(volume=><p key={volume.nodeId} className="text-xs">{source.data ? findOutlineNodeTitle(source.data.document,volume.nodeId) : "分卷"} · {volume.chapterQuota} 章 · 第 {volume.from}–{volume.to} 章</p>)}
    </div></details>
    {binding.currentVersion!==binding.revisionVersion ? <details className="mt-2 text-sm" aria-label="源大纲新修订差异"><summary className="cursor-pointer font-medium text-warning">源大纲有新修订 v{binding.currentVersion} · 查看 {differences.length} 项差异</summary><div className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-2"><p className="text-xs leading-6 text-muted-foreground">本书仍按 v{binding.revisionVersion} 写作，差异仅供查看，不会自动同步或覆盖正文。</p>{differences.map((change,index)=>{
      const left=change.before as Record<string,unknown>|undefined,right=change.after as Record<string,unknown>|undefined;
      const before=(change.kind==="moved" ? left?.node : left) as Record<string,unknown>|undefined,after=(change.kind==="moved" ? right?.node : right) as Record<string,unknown>|undefined;
      const title=change.kind==="added" ? String(after?.title ?? after?.name ?? "新增内容") : source.data ? findOutlineNodeTitle(source.data.document,change.nodeId) : "相关创作内容";
      const fields=[...new Set([...Object.keys(before ?? {}),...Object.keys(after ?? {})])].filter(key=>key!=="nodeId" && JSON.stringify(before?.[key])!==JSON.stringify(after?.[key]));
      return <section key={`${change.nodeId}:${index}`} className="border-t border-border/40 pt-2"><h3 className="text-sm font-medium">{kinds[change.kind]} · {title}</h3>{change.kind==="moved" ? <p className="text-xs leading-6 text-muted-foreground">节点位置有调整；本书仍保留原位置。</p> : null}{fields.filter(field=>outlineFieldLabels[field]).map(field=><div key={field} className="mt-2 text-xs leading-6"><p className="font-medium">{outlineFieldLabels[field]}</p><p className="text-muted-foreground">采用版本：{formatOutlineValue(before?.[field],field,source.data?.document)}</p><p>新修订：{formatOutlineValue(after?.[field],field,source.data?.document)}</p></div>)}</section>;
    })}<Button asChild variant="ghost" size="sm"><Link to={`/outlines/${binding.projectId}`}>在大纲工作台查看版本</Link></Button></div></details> : null}
    {binding.setupState.error ? <p role="alert" className="mt-2 text-xs text-warning">资料索引待恢复，请回到源大纲检查后处理；无需重新开书。</p> : null}
  </section>;
}
