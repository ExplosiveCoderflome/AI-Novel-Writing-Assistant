import type { Chapter } from "@ai-novel/shared/types/novel";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StreamOutput from "@/components/common/StreamOutput";
import WorldInjectionHint from "./WorldInjectionHint";

interface ChapterManagementTabProps {
  novelId: string;
  worldInjectionSummary: string | null;
  hasCharacters: boolean;
  chapters: Chapter[];
  selectedChapterId: string;
  selectedChapter?: Chapter;
  onSelectChapter: (chapterId: string) => void;
  onGoToCharacterTab: () => void;
  onCreateChapter: () => void;
  isCreatingChapter: boolean;
  onGenerateSelectedChapter: () => void;
  streamContent: string;
  isStreaming: boolean;
  onAbortStream: () => void;
}

export default function ChapterManagementTab(props: ChapterManagementTabProps) {
  const {
    novelId,
    worldInjectionSummary,
    hasCharacters,
    chapters,
    selectedChapterId,
    selectedChapter,
    onSelectChapter,
    onGoToCharacterTab,
    onCreateChapter,
    isCreatingChapter,
    onGenerateSelectedChapter,
    streamContent,
    isStreaming,
    onAbortStream,
  } = props;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>章节管理</CardTitle>
        <Button onClick={onCreateChapter} disabled={isCreatingChapter}>
          {isCreatingChapter ? "创建中..." : "新建章节"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />
        <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
          说明：文本输入、导入和生成链路都必须使用 UTF-8 编码，避免乱码。
        </div>
        {!hasCharacters ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <span>请先添加至少 1 个角色，再生成章节内容。</span>
            <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>去角色管理</Button>
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rounded-md border">
            <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
              章节列表：{chapters.length}
            </div>
            <div className="max-h-[560px] space-y-2 overflow-y-auto p-2">
              {chapters.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">暂无章节。</div>
              ) : (
                chapters.map((chapter) => (
                  <button
                    key={chapter.id}
                    type="button"
                    onClick={() => onSelectChapter(chapter.id)}
                    className={`w-full rounded-md border p-2 text-left transition ${
                      selectedChapterId === chapter.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="text-sm font-medium">第{chapter.order}章：{chapter.title}</div>
                    {chapter.expectation ? (
                      <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{chapter.expectation}</div>
                    ) : null}
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>字数：{chapter.content?.length ?? 0}</span>
                      {chapter.generationState ? (
                        <Badge variant="outline">{chapter.generationState}</Badge>
                      ) : null}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="space-y-3">
            {selectedChapter ? (
              <div className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">第{selectedChapter.order}章：{selectedChapter.title}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>字数：{selectedChapter.content?.length ?? 0}</span>
                    {selectedChapter.generationState ? (
                      <Badge variant="outline">{selectedChapter.generationState}</Badge>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">本章大纲</div>
                    <div className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-2 text-sm">
                      {selectedChapter.expectation?.trim() || "暂无大纲"}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-muted-foreground">正文预览</div>
                    <div className="max-h-[360px] overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-2 text-sm">
                      {selectedChapter.content?.trim() || "当前章节尚未生成正文"}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link to={`/novels/${novelId}/chapters/${selectedChapter.id}`}>编辑章节</Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={onGenerateSelectedChapter}
                    disabled={!hasCharacters}
                  >
                    生成内容
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                请先在左侧选择一个章节查看详情。
              </div>
            )}

            <StreamOutput content={streamContent} isStreaming={isStreaming} onAbort={onAbortStream} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
