import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { getNovelDetail } from "@/api/novel";
import { Button } from "@/components/ui/button";
import { MobileChapter } from "./MobileChapter";
import { MobileTaskPanel } from "./MobileTaskPanel";

export function MobileNovel({ novelId, chapterId }: { novelId: string; chapterId?: string }) {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ["mobileNovel", novelId], queryFn: () => getNovelDetail(novelId), refetchInterval: 10000 });
  const novel = query.data?.data;
  if (!novel) return <section>{query.isError ? <><p role="alert">小说读取失败。</p><Button onClick={() => void query.refetch()}>重新读取</Button></> : <p role="status">正在读取小说…</p>}</section>;
  const written = novel.chapters.filter(chapter => Boolean(chapter.content?.trim()));
  const selected = chapterId ? novel.chapters.find(chapter => chapter.id === chapterId) : written[written.length - 1] ?? novel.chapters[0];
  return <section className="space-y-5">
    <Button asChild variant="ghost" size="sm"><Link to="/novels">返回小说列表</Link></Button>
    <header className="space-y-2"><h1 className="text-xl font-semibold">{novel.title}</h1><p className="text-sm text-muted-foreground">已写 {written.length} / {novel.estimatedChapterCount ?? novel.chapters.length} 章 · 已规划 {novel.chapters.length} 章</p></header>
    <MobileTaskPanel novelId={novelId} version={novel.directorVersion ?? "v1"} />
    <label className="block space-y-2 text-sm"><span>章节目录与状态</span><select className="w-full rounded-md border bg-background px-3 py-3 text-base" value={selected?.id ?? ""} onChange={event => navigate(`/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(event.target.value)}`)}>
      {novel.chapters.map(chapter => <option key={chapter.id} value={chapter.id}>第 {chapter.order} 章 · {chapter.title} · {chapter.content?.trim() ? "可阅读" : "待生成"}</option>)}
    </select></label>
    {chapterId && !selected ? <p role="alert">找不到该章节，请从目录选择。</p> : null}
    {selected ? <MobileChapter key={selected.id} novelId={novelId} chapter={selected} /> : <p className="text-sm text-muted-foreground">章节规划保存后可在这里查看。</p>}
  </section>;
}
