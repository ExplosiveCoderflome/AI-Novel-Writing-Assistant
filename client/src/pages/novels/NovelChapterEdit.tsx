import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import StreamOutput from "@/components/common/StreamOutput";
import LLMSelector from "@/components/common/LLMSelector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { queryKeys } from "@/api/queryKeys";
import {
  createCreativeDecision,
  deleteCreativeDecision,
  getNovelDetail,
  getChapterTraces,
  listCreativeDecisions,
  updateNovelChapter,
} from "@/api/novel";
import { useSSE } from "@/hooks/useSSE";
import { useLLMStore } from "@/store/llmStore";

export default function NovelChapterEdit() {
  const { id = "", chapterId = "" } = useParams();
  const queryClient = useQueryClient();
  const llm = useLLMStore();
  const [contentDraft, setContentDraft] = useState("");
  const [decisionForm, setDecisionForm] = useState({
    category: "plot",
    content: "",
  });

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
      if (id && chapterId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterTraces(id, chapterId) });
      }
    },
  });

  const { data: tracesResponse } = useQuery({
    queryKey: queryKeys.novels.chapterTraces(id, chapterId),
    queryFn: () => getChapterTraces(id!, chapterId!),
    enabled: Boolean(id && chapterId),
  });
  const traces = tracesResponse?.data ?? [];

  const { data: decisionResponse } = useQuery({
    queryKey: queryKeys.novels.creativeDecisions(id),
    queryFn: () => listCreativeDecisions(id),
    enabled: Boolean(id),
  });
  const decisions = decisionResponse?.data ?? [];

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

  const createDecisionMutation = useMutation({
    mutationFn: () => createCreativeDecision(id, {
      chapterId,
      category: decisionForm.category,
      content: decisionForm.content,
      importance: "normal",
      sourceType: "manual",
      sourceRefId: chapterId,
    }),
    onSuccess: async () => {
      setDecisionForm({ category: "plot", content: "" });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.creativeDecisions(id) });
    },
  });

  const deleteDecisionMutation = useMutation({
    mutationFn: (decisionId: string) => deleteCreativeDecision(id, decisionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.creativeDecisions(id) });
    },
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[28%_44%_28%]">
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
          {traces.length > 0 && (
            <div className="rounded-md border p-2 text-sm">
              <div className="mb-1 font-medium text-muted-foreground">生成轨迹</div>
              <ul className="space-y-1">
                {traces.slice(0, 5).map((run) => (
                  <li key={run.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">{run.goal}</span>
                    <span className="shrink-0 text-muted-foreground">{run.status}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {run.createdAt ? new Date(run.createdAt).toLocaleString() : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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

      <Card>
        <CardHeader>
          <CardTitle>创作决策</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <select
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={decisionForm.category}
            onChange={(event) => setDecisionForm((prev) => ({ ...prev, category: event.target.value }))}
          >
            <option value="plot">plot</option>
            <option value="character">character</option>
            <option value="world">world</option>
            <option value="style">style</option>
          </select>
          <textarea
            className="min-h-28 w-full rounded-md border bg-background p-3 text-sm"
            value={decisionForm.content}
            onChange={(event) => setDecisionForm((prev) => ({ ...prev, content: event.target.value }))}
            placeholder="记录当前章节必须遵守的创作决策..."
          />
          <Button
            onClick={() => createDecisionMutation.mutate()}
            disabled={createDecisionMutation.isPending || !decisionForm.content.trim()}
          >
            添加决策
          </Button>

          <div className="space-y-2">
            {decisions.map((decision) => (
              <div key={decision.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{decision.category}</div>
                    <div className="mt-1 text-muted-foreground">{decision.content}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {decision.sourceType ?? "manual"} · {new Date(decision.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteDecisionMutation.mutate(decision.id)}
                    disabled={deleteDecisionMutation.isPending}
                  >
                    删除
                  </Button>
                </div>
              </div>
            ))}
            {decisions.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                还没有创作决策。
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
