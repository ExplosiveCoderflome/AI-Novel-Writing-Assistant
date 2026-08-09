import { useEffect, useMemo, useState } from "react";
import type { Chapter, ChapterStatus } from "@ai-novel/shared/types/novel";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Check, Copy, Edit3, List, Settings2, X } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { getNovelChapters, getNovelDetail } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function countWords(content: string | null | undefined): number {
  const text = content?.trim() ?? "";
  if (!text) return 0;
  const cjk = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const words = text.replace(/[\u3400-\u9fff]/g, " ").match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0;
  return cjk + words;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatChapterStatus(status?: ChapterStatus | null): string {
  switch (status) {
    case "completed": return "正文完成";
    case "pending_review": return "待审校";
    case "needs_repair": return "待修复";
    case "generating": return "生成中";
    case "pending_generation": return "待生成";
    case "unplanned": return "未规划";
    default: return "未标记";
  }
}

function chapterText(content: string | null | undefined): string {
  return content?.trim() ?? "";
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "true");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    document.body.removeChild(area);
  }
}

export default function NovelPreview() {
  const { id = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showChapters, setShowChapters] = useState(true);
  const [copied, setCopied] = useState(false);
  const selectedChapterId = searchParams.get("chapterId") ?? "";

  const novelQuery = useQuery({
    queryKey: queryKeys.novels.detail(id),
    queryFn: () => getNovelDetail(id),
    enabled: Boolean(id),
  });
  const chaptersQuery = useQuery({
    queryKey: queryKeys.novels.chapters(id),
    queryFn: () => getNovelChapters(id),
    enabled: Boolean(id),
  });

  const novel = novelQuery.data?.data ?? null;
  const chapters = useMemo(
    () => [...(chaptersQuery.data?.data ?? [])].sort((a, b) => a.order - b.order),
    [chaptersQuery.data?.data],
  );
  const generatedChapters = useMemo(() => chapters.filter((chapter) => chapterText(chapter.content)), [chapters]);
  const activeChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === selectedChapterId) ?? generatedChapters[0] ?? chapters[0] ?? null,
    [chapters, generatedChapters, selectedChapterId],
  );
  const activeContent = chapterText(activeChapter?.content);
  const totalWordCount = useMemo(() => chapters.reduce((sum, chapter) => sum + countWords(chapter.content), 0), [chapters]);

  useEffect(() => {
    if (!activeChapter || selectedChapterId === activeChapter.id) return;
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("chapterId", activeChapter.id);
      return next;
    }, { replace: true });
  }, [activeChapter, selectedChapterId, setSearchParams]);

  const selectChapter = (chapter: Chapter) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("chapterId", chapter.id);
      return next;
    });
    if (!window.matchMedia("(min-width: 1024px)").matches) {
      setShowChapters(false);
    }
  };

  const handleCopy = async () => {
    if (!activeContent) return toast.error("当前章节还没有正文。");
    try {
      await copyText(activeContent);
      setCopied(true);
      toast.success("正文已复制。");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("复制失败，请手动选择正文复制。");
    }
  };

  if (!id) {
    return <div className="flex min-h-full items-center justify-center"><Button asChild><Link to="/novels">返回小说列表</Link></Button></div>;
  }

  const isLoading = novelQuery.isPending || chaptersQuery.isPending;
  const isError = novelQuery.isError || chaptersQuery.isError;

  if (isLoading) {
    return <div className="flex min-h-full items-center justify-center text-sm text-muted-foreground">正在打开作品...</div>;
  }
  if (isError) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm text-muted-foreground">当前无法打开这本作品。</p>
        <Button onClick={() => { void novelQuery.refetch(); void chaptersQuery.refetch(); }}>重新加载</Button>
      </div>
    );
  }
  if (chapters.length === 0) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 text-center">
        <BookOpen className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">这本作品还没有可阅读的章节。</p>
        <Button asChild><Link to={`/novels/${id}/edit`}>进入工作区</Link></Button>
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-y-auto bg-[#faf9f6] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-[#faf9f6]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5 lg:pl-72">
          <Button asChild variant="ghost" size="sm" className="-ml-2 text-slate-500 hover:text-slate-900">
            <Link to="/novels" aria-label="返回书架"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate text-sm font-medium">{novel?.title ?? "小说预览"}</div>
            <div className="mt-0.5 text-xs text-slate-400">{activeChapter ? `第 ${activeChapter.order} 章` : "阅读"}</div>
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" variant={showChapters ? "secondary" : "ghost"} size="sm" className="text-slate-500 hover:text-slate-900" onClick={() => setShowChapters((value) => !value)} title="打开目录" aria-label="打开目录">
              <List className="h-4 w-4" />
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-slate-500 hover:text-slate-900" title="打开工作区" aria-label="打开工作区">
              <Link to={`/novels/${id}/edit`}><Settings2 className="h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="px-6 pb-24 pt-16 sm:px-10 sm:pt-20 lg:pl-[22.5rem]">
        <div className="mx-auto max-w-3xl">
          <div className="mb-12 text-center">
          <div className="text-xs tracking-[0.22em] text-slate-400">{novel?.status === "published" ? "PUBLISHED" : "DRAFT"}</div>
          <h1 className="mt-4 text-3xl font-semibold tracking-normal text-slate-900 sm:text-4xl">{novel?.title ?? "小说预览"}</h1>
          <p className="mt-3 text-sm text-slate-500">{formatCount(totalWordCount)} 字 · {generatedChapters.length}/{chapters.length} 章已生成</p>
          </div>

          <article className="whitespace-pre-wrap text-[17px] leading-[2.15] text-slate-800 sm:text-[18px]">
            {activeContent || "本章还没有正文。"}
          </article>

          <footer className="mt-20 flex items-center justify-center gap-2 border-t border-slate-200/70 pt-6">
            <Button type="button" variant="ghost" size="sm" className="text-slate-500" onClick={() => void handleCopy()} disabled={!activeContent}>
              {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
              {copied ? "已复制" : "复制本章"}
            </Button>
            {activeChapter ? (
              <Button asChild variant="ghost" size="sm" className="text-slate-500">
                <Link to={`/novels/${id}/chapters/${activeChapter.id}`}><Edit3 className="mr-1.5 h-4 w-4" />编辑本章</Link>
              </Button>
            ) : null}
          </footer>
        </div>
      </main>

      {showChapters ? (
        <>
          <button type="button" aria-label="关闭目录" className="fixed inset-0 z-30 bg-slate-900/20 lg:hidden" onClick={() => setShowChapters(false)} />
          <aside className="fixed inset-y-0 left-0 z-40 flex w-[min(360px,88vw)] flex-col border-r border-slate-200 bg-[#faf9f6] shadow-xl lg:shadow-none">
            <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-4">
              <div><div className="font-medium">目录</div><div className="mt-1 text-xs text-slate-400">{generatedChapters.length}/{chapters.length} 章 · {formatCount(totalWordCount)} 字</div></div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowChapters(false)} title="关闭目录" aria-label="关闭目录"><X className="h-4 w-4" /></Button>
            </div>
            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
              {chapters.map((chapter) => {
                const hasContent = Boolean(chapterText(chapter.content));
                return (
                  <button key={chapter.id} type="button" className={cn("w-full rounded-md px-3 py-3 text-left transition hover:bg-slate-200/60", activeChapter?.id === chapter.id && "bg-slate-200/70")} onClick={() => selectChapter(chapter)}>
                    <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">第 {chapter.order} 章</span><span className="text-xs text-slate-400">{formatCount(countWords(chapter.content))} 字</span></div>
                    <div className="mt-1 truncate text-sm text-slate-500">{chapter.title || "未命名章节"}</div>
                    <div className="mt-1 text-xs text-slate-400">{hasContent ? formatChapterStatus(chapter.chapterStatus) : "暂无正文"}</div>
                  </button>
                );
              })}
            </nav>
          </aside>
        </>
      ) : null}
    </div>
  );
}
