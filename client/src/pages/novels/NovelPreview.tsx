import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useEffect, useMemo, useState } from "react";
import type { Chapter, ChapterStatus } from "@ai-novel/shared/types/novel";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Check, Copy, Edit3, FileText, ListTree } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { getNovelChapters, getNovelDetail } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function countWords(content: string | null | undefined): number {
  const text = content?.trim() ?? "";
  if (!text) {
    return 0;
  }

  const cjkMatches = text.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const wordMatches = text
    .replace(/[\u3400-\u9fff]/g, " ")
    .match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0;
  return cjkMatches + wordMatches;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatChapterStatus(status?: ChapterStatus | null): string {
  switch (status) {
    case "completed":
      return t("gen.pages.novels.NovelPreview.gen_84af95a7");
    case "pending_review":
      return t("gen.pages.novels.NovelPreview.gen_420b5a47");
    case "needs_repair":
      return t("gen.pages.novels.NovelPreview.gen_a7a05e79");
    case "generating":
      return t("gen.pages.novels.NovelPreview.gen_1ae3a984");
    case "pending_generation":
      return t("gen.pages.novels.NovelPreview.gen_418dde27");
    case "unplanned":
      return t("gen.pages.novels.NovelPreview.gen_16fe50f9");
    default:
      return t("gen.pages.novels.NovelPreview.gen_120e6f23");
  }
}

function normalizeChapterText(content: string | null | undefined): string {
  return content?.trim() ?? "";
}

async function writeTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Some desktop webviews and local browser contexts deny Clipboard API writes.
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "fixed";
  textArea.style.top = "0";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();

  try {
    const copied = document.execCommand("copy");
    if (!copied) {
      throw new Error("copy command rejected");
    }
  } finally {
    document.body.removeChild(textArea);
  }
}

export default function NovelPreview() {
  const { id = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [copiedChapterId, setCopiedChapterId] = useState<string | null>(null);
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
  const generatedChapters = useMemo(
    () => chapters.filter((chapter) => normalizeChapterText(chapter.content).length > 0),
    [chapters],
  );
  const activeChapter = useMemo(() => {
    return chapters.find((chapter) => chapter.id === selectedChapterId)
      ?? generatedChapters[0]
      ?? chapters[0]
      ?? null;
  }, [chapters, generatedChapters, selectedChapterId]);
  const activeContent = normalizeChapterText(activeChapter?.content);
  const totalWordCount = useMemo(
    () => chapters.reduce((sum, chapter) => sum + countWords(chapter.content), 0),
    [chapters],
  );

  useEffect(() => {
    if (!activeChapter || selectedChapterId === activeChapter.id) {
      return;
    }

    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("chapterId", activeChapter.id);
      return next;
    }, { replace: true });
  }, [activeChapter, selectedChapterId, setSearchParams]);

  const selectChapter = (chapter: Chapter) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("chapterId", chapter.id);
      return next;
    });
  };

  const copyActiveChapter = async () => {
    if (!activeChapter || !activeContent) {
      toast.error(t("gen.pages.novels.NovelPreview.gen_307412f2"));
      return;
    }

    try {
      await writeTextToClipboard(activeContent);
      setCopiedChapterId(activeChapter.id);
      toast.success(t("gen.pages.novels.NovelPreview.gen_d6f3284a"));
      window.setTimeout(() => {
        setCopiedChapterId((current) => (current === activeChapter.id ? null : current));
      }, 1600);
    } catch {
      toast.error(t("gen.pages.novels.NovelPreview.gen_44bcfdfc"));
    }
  };

  if (!id) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("gen.pages.novels.NovelPreview.gen_2813d1e2")}</CardTitle>
          <CardDescription>{t("gen.pages.novels.NovelPreview.gen_137f80e7")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/novels">{t("gen.pages.novels.NovelPreview.gen_9c469174")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isLoading = novelQuery.isPending || chaptersQuery.isPending;
  const isError = novelQuery.isError || chaptersQuery.isError;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Button asChild variant="ghost" size="sm" className="px-0 text-muted-foreground">
            <Link to="/novels">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              返回小说列表
            </Link>
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words text-2xl font-semibold tracking-tight">
                {novel?.title ?? t("gen.pages.novels.NovelPreview.gen_38cb41c9")}
              </h1>
              {novel?.status ? (
                <Badge variant={novel.status === "published" ? "default" : "secondary"}>
                  {novel.status === "published" ? t("gen.pages.novels.NovelPreview.gen_dca0c13b") : t("gen.pages.novels.NovelPreview.gen_22b4334f")}
                </Badge>
              ) : null}
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              按章节阅读已生成正文，适合检查连贯性、节奏和已经写出的内容。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to={`/novels/${id}/edit`}>
              <Edit3 className="h-4 w-4" aria-hidden="true" />
              打开工作区
            </Link>
          </Button>
          {activeChapter ? (
            <Button asChild>
              <Link to={`/novels/${id}/chapters/${activeChapter.id}`}>
                <FileText className="h-4 w-4" aria-hidden="true" />
                编辑本章
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="grid min-h-[70vh] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="animate-pulse">
            <CardHeader>
              <div className="h-5 w-28 rounded bg-muted" />
              <div className="h-4 w-40 rounded bg-muted" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-16 rounded-lg bg-muted" />
              ))}
            </CardContent>
          </Card>
          <Card className="animate-pulse">
            <CardHeader>
              <div className="h-7 w-1/2 rounded bg-muted" />
              <div className="h-4 w-48 rounded bg-muted" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 10 }).map((_, index) => (
                <div key={index} className="h-4 rounded bg-muted" />
              ))}
            </CardContent>
          </Card>
        </div>
      ) : isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("gen.pages.novels.NovelPreview.gen_57d68ea3")}</CardTitle>
            <CardDescription>{t("gen.pages.novels.NovelPreview.gen_900b1e74")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => {
              void novelQuery.refetch();
              void chaptersQuery.refetch();
            }}
            >
              重新加载
            </Button>
          </CardContent>
        </Card>
      ) : chapters.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("gen.pages.novels.NovelPreview.gen_6c29ec53")}</CardTitle>
            <CardDescription>{t("gen.pages.novels.NovelPreview.gen_25b00d48")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to={`/novels/${id}/edit`}>{t("gen.pages.novels.NovelPreview.gen_781a989a")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid min-h-[70vh] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="min-h-0 lg:h-[calc(100vh-13rem)]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListTree className="h-4 w-4" aria-hidden="true" />
                章节目录
              </CardTitle>
              <CardDescription>
                已生成正文 {generatedChapters.length}/{chapters.length} 章，约 {formatCount(totalWordCount)} 字。
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 space-y-2 overflow-y-auto pr-2 lg:max-h-[calc(100vh-20rem)]">
              {chapters.map((chapter) => {
                const chapterContent = normalizeChapterText(chapter.content);
                const isActive = activeChapter?.id === chapter.id;
                return (
                  <button
                    key={chapter.id}
                    type="button"
                    className={cn(
                      "w-full rounded-lg border p-3 text-left text-sm transition hover:border-primary/40 hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-ring",
                      isActive ? "border-primary bg-primary/[0.06]" : "border-border bg-background",
                    )}
                    onClick={() => selectChapter(chapter)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground">
                          第 {chapter.order} 章
                        </div>
                        <div className="mt-1 line-clamp-2 break-words text-muted-foreground">
                          {chapter.title || t("gen.pages.novels.NovelPreview.gen_db55d102")}
                        </div>
                      </div>
                      <Badge variant={chapterContent ? "outline" : "secondary"}>
                        {chapterContent ? t("gen.pages.novels.NovelPreview.gen_9c39cadc") : t("gen.pages.novels.NovelPreview.gen_6de9bb70")}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{formatChapterStatus(chapter.chapterStatus)}</span>
                      <span>{t("gen.pages.novels.NovelPreview.chapterWordCount")}</span>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card className="min-h-0 lg:h-[calc(100vh-13rem)]">
            <CardHeader className="border-b">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <BookOpen className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="break-words">
                      {activeChapter ? `第 ${activeChapter.order} 章：${activeChapter.title || t("gen.pages.novels.NovelPreview.gen_db55d102")}` : t("gen.pages.novels.NovelPreview.gen_0ca66ea7")}
                    </span>
                  </CardTitle>
                  {activeChapter ? (
                    <CardDescription className="mt-2">
                      {formatChapterStatus(activeChapter.chapterStatus)} · {formatCount(countWords(activeChapter.content))} 字
                    </CardDescription>
                  ) : null}
                </div>
                {activeChapter ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void copyActiveChapter()}
                      disabled={!activeContent}
                    >
                      {copiedChapterId === activeChapter.id ? (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Copy className="h-4 w-4" aria-hidden="true" />
                      )}
                      {copiedChapterId === activeChapter.id ? t("gen.pages.novels.NovelPreview.gen_52e6abbe") : t("gen.pages.novels.NovelPreview.gen_26c0d431")}
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/novels/${id}/chapters/${activeChapter.id}`}>
                        <Edit3 className="h-4 w-4" aria-hidden="true" />
                        编辑本章
                      </Link>
                    </Button>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="min-h-0 overflow-y-auto p-0 lg:max-h-[calc(100vh-21rem)]">
              {activeContent ? (
                <article className="mx-auto max-w-3xl whitespace-pre-wrap px-5 py-6 text-base leading-8 text-slate-900 md:px-8">
                  {activeContent}
                </article>
              ) : (
                <div className="flex min-h-[420px] items-center justify-center px-6 text-center">
                  <div className="max-w-md space-y-3">
                    <FileText className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
                    <div className="text-lg font-medium">{t("gen.pages.novels.NovelPreview.gen_8722b85f")}</div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      进入章节编辑页生成或补写正文后，这里会显示完整内容。
                    </p>
                    {activeChapter ? (
                      <Button asChild>
                        <Link to={`/novels/${id}/chapters/${activeChapter.id}`}>{t("gen.pages.novels.NovelPreview.gen_21a7b9c5")}</Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
