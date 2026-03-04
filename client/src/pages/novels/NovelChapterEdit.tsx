import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import StreamOutput from "@/components/common/StreamOutput";
import LLMSelector from "@/components/common/LLMSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { queryKeys } from "@/api/queryKeys";
import { getNovelDetail, updateNovelChapter } from "@/api/novel";
import { useSSE } from "@/hooks/useSSE";
import { useLLMStore } from "@/store/llmStore";

export default function NovelChapterEdit() {
  const { id = "", chapterId = "" } = useParams();
  const queryClient = useQueryClient();
  const llm = useLLMStore();
  const [contentDraft, setContentDraft] = useState("");

  const { data: detailResponse } = useQuery({
    queryKey: queryKeys.novels.detail(id),
    queryFn: () => getNovelDetail(id),
    enabled: Boolean(id),
  });

  const chapter = useMemo(
    () => detailResponse?.data?.chapters.find((item) => item.id === chapterId),
    [chapterId, detailResponse?.data?.chapters],
  );

  useEffect(() => {
    setContentDraft(chapter?.content ?? "");
  }, [chapter?.content]);

  const { content, start, abort, isStreaming } = useSSE({
    onDone: (fullContent) => {
      setContentDraft(fullContent);
    },
  });

  const saveChapterMutation = useMutation({
    mutationFn: (text: string) =>
      updateNovelChapter(id, chapterId, {
        content: text,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.novels.detail(id),
      });
    },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[40%_60%]">
      <Card>
        <CardHeader>
          <CardTitle>章节信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="mb-1 text-sm text-muted-foreground">章节标题</div>
            <div className="rounded-md border p-2 text-sm">{chapter?.title ?? "未找到章节"}</div>
          </div>
          <LLMSelector />
          <div className="flex gap-2">
            <Button
              onClick={() =>
                void start(`/novels/${id}/chapters/${chapterId}/generate`, {
                  provider: llm.provider,
                  model: llm.model,
                  temperature: llm.temperature,
                })
              }
              disabled={isStreaming || !chapter}
            >
              AI 生成内容
            </Button>
            <Button variant="secondary" onClick={abort} disabled={!isStreaming}>
              停止生成
            </Button>
          </div>
          <StreamOutput content={content} isStreaming={isStreaming} onAbort={abort} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>正文编辑</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            className="min-h-[520px] w-full rounded-md border bg-background p-3 text-sm"
            value={contentDraft}
            onChange={(event) => setContentDraft(event.target.value)}
            placeholder="在这里编辑章节正文..."
          />
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>字数：{contentDraft.length}</span>
            <Button
              onClick={() => saveChapterMutation.mutate(contentDraft)}
              disabled={saveChapterMutation.isPending || !chapter}
            >
              {saveChapterMutation.isPending ? "保存中..." : "保存章节"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
