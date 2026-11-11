import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { createOutline, listOutlines } from "@/api/outlines";
import { apiClient } from "@/api/client";
import { useState } from "react";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";

function findSourceNodeTitle(document: OutlineDocument, nodeId: string) {
  if (document.story.nodeId === nodeId) return document.story.title;
  const node = [...document.volumes, ...document.chapters, ...document.characters, ...document.payoffs, ...document.facts]
    .find(item => item.nodeId === nodeId);
  return node && ("title" in node ? node.title : node.name) || nodeId;
}

export default function OutlineListPage() {
  const navigate = useNavigate(), client = useQueryClient();
  const [importText, setImportText] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const query = useQuery({ queryKey: ["outlines"], queryFn: listOutlines });
  const create = useMutation({ mutationFn: (title: string) => createOutline(title), onSuccess: async item => { await client.invalidateQueries({ queryKey: ["outlines"] }); navigate(`/outlines/${item.id}`); } });
  return <div className="mx-auto max-w-6xl space-y-8">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold">大纲</h1><p className="mt-2 text-sm text-muted-foreground">先整理故事方向，再逐步完善卷、章节和人物。</p></div><div className="flex gap-2"><Button variant="outline" onClick={()=>create.mutate("未命名大纲")}>空白大纲</Button><Button onClick={()=>create.mutate("新故事大纲")}>从一个想法开始</Button></div></header>
    <section className="space-y-3 border-b border-border/50 pb-5">
      <h2 className="font-medium">导入 Markdown 或 TXT</h2>
      <textarea className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="粘贴大纲文本；解析结果会先展示给你确认。" value={importText} onChange={event=>setImportText(event.target.value)}/>
      <Button variant="outline" disabled={!importText.trim()} onClick={async()=>{const response=await apiClient.post("/outlines/import/preview",{title:"导入的大纲",text:importText,format:/^\s*#/m.test(importText)?"markdown":"text"});setPreview(response.data.data);}}>解析并预览</Button>
      {preview ? <div className="space-y-3">
        <p className="text-sm">已识别 {preview.document.volumes.length} 卷、{preview.document.chapters.length} 章；{preview.unclassified.length} 段内容待人工查看。</p>
        <p className="text-xs text-muted-foreground">原文共 {preview.sourceLength} 字符，节点来源覆盖 {preview.coveredLength} 字符。未覆盖和未匹配内容需要人工核对。</p>
        {preview.unclassified.map((item:string,index:number)=><p key={index} className="whitespace-pre-wrap text-xs text-muted-foreground">{item}</p>)}
        {preview.unmatchedSources?.length ? <p role="alert" className="text-sm text-destructive">{preview.unmatchedSources.length} 个节点没有匹配到对应原文，请返回原文核对后再确认。</p> : null}
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">核对节点与来源片段</summary>
          <ul className="mt-3 space-y-3">
            {preview.coverage.map((item:{nodeId:string;start:number;end:number;text:string})=><li key={`${item.nodeId}-${item.start}-${item.end}`}>
              <p className="font-medium">{findSourceNodeTitle(preview.document, item.nodeId)}</p>
              <p className="mt-1 text-xs text-muted-foreground">原文位置 {item.start + 1}–{item.end}</p>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap bg-muted/50 p-3 text-xs text-muted-foreground">{item.text}</pre>
            </li>)}
          </ul>
        </details>
        <Button onClick={async()=>{const response=await apiClient.post("/outlines/import/confirm",{token:preview.token});setPreview(null);await client.invalidateQueries({queryKey:["outlines"]});navigate(`/outlines/${response.data.data.project.id}`);}}>确认创建大纲</Button>
      </div> : null}
    </section>
    {query.isLoading ? <p className="text-sm text-muted-foreground">正在读取大纲项目…</p> : query.isError ? <p role="alert" className="text-sm text-destructive">大纲项目读取失败，请稍后重试。</p> : query.data?.length ? <ul className="divide-y divide-border/60">{query.data.map(item=><li key={item.id} className="flex items-center justify-between gap-4 py-5"><div><h2 className="font-medium">{item.title}</h2><p className="mt-1 text-sm text-muted-foreground">修订 v{item.currentVersion} · {new Date(item.updatedAt).toLocaleString()}</p></div><Button asChild variant="ghost"><Link to={`/outlines/${item.id}`}>继续编辑</Link></Button></li>)}</ul> : <section className="py-14 text-center"><h2 className="text-lg font-medium">从一个故事想法开始</h2><p className="mt-2 text-sm text-muted-foreground">大纲会独立保存，不需要先创建小说。</p></section>}
  </div>;
}
