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
  getChapterAuditReports,
  getChapterPlan,
  getChapterStateSnapshot,
  getNovelDetail,
  getChapterTraces,
  listCreativeDecisions,
  replanNovel,
  updateNovelChapter,
} from "@/api/novel";
import {
  createStyleBinding,
  deleteStyleBinding,
  detectStyleIssues,
  getStyleBindings,
  getStyleProfiles,
  rewriteStyleIssues,
} from "@/api/styleEngine";
import { useSSE } from "@/hooks/useSSE";
import { useLLMStore } from "@/store/llmStore";
import { ChapterRuntimeAuditCard, ChapterRuntimeContextCard } from "./components/ChapterRuntimePanels";

export default function NovelChapterEdit() {
  const { id = "", chapterId = "" } = useParams();
  const queryClient = useQueryClient();
  const llm = useLLMStore();
  const [contentDraft, setContentDraft] = useState("");
  const [selectedStyleProfileId, setSelectedStyleProfileId] = useState("");
  const [styleRewritePreview, setStyleRewritePreview] = useState("");
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

  const { content, start, abort, isStreaming, runtimePackage } = useSSE({
    onDone: async (fullContent) => {
      setContentDraft(fullContent);
      if (id && chapterId) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterTraces(id, chapterId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterPlan(id, chapterId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterStateSnapshot(id, chapterId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterAuditReports(id, chapterId) }),
        ]);
      }
    },
  });

  const { data: tracesResponse } = useQuery({
    queryKey: queryKeys.novels.chapterTraces(id, chapterId),
    queryFn: () => getChapterTraces(id!, chapterId!),
    enabled: Boolean(id && chapterId),
  });
  const traces = tracesResponse?.data ?? [];

  const { data: chapterPlanResponse } = useQuery({
    queryKey: queryKeys.novels.chapterPlan(id, chapterId),
    queryFn: () => getChapterPlan(id, chapterId),
    enabled: Boolean(id && chapterId),
  });

  const { data: chapterStateResponse } = useQuery({
    queryKey: queryKeys.novels.chapterStateSnapshot(id, chapterId),
    queryFn: () => getChapterStateSnapshot(id, chapterId),
    enabled: Boolean(id && chapterId),
  });

  const { data: chapterAuditResponse } = useQuery({
    queryKey: queryKeys.novels.chapterAuditReports(id, chapterId),
    queryFn: () => getChapterAuditReports(id, chapterId),
    enabled: Boolean(id && chapterId),
  });

  const chapterPlan = chapterPlanResponse?.data ?? null;
  const chapterStateSnapshot = chapterStateResponse?.data ?? null;
  const chapterAuditReports = chapterAuditResponse?.data ?? [];
  const openAuditIssueIds = useMemo(
    () => chapterAuditReports.flatMap((report) => report.issues.filter((issue) => issue.status === "open").map((issue) => issue.id)),
    [chapterAuditReports],
  );

  const { data: styleProfilesResponse } = useQuery({
    queryKey: queryKeys.styleEngine.profiles,
    queryFn: getStyleProfiles,
  });
  const styleProfiles = styleProfilesResponse?.data ?? [];

  const { data: chapterStyleBindingsResponse } = useQuery({
    queryKey: queryKeys.styleEngine.bindings(`chapter-${chapterId}`),
    queryFn: () => getStyleBindings({ targetType: "chapter", targetId: chapterId }),
    enabled: Boolean(chapterId),
  });
  const chapterStyleBindings = chapterStyleBindingsResponse?.data ?? [];

  useEffect(() => {
    if (!selectedStyleProfileId && styleProfiles.length > 0) {
      setSelectedStyleProfileId(styleProfiles[0].id);
    }
  }, [selectedStyleProfileId, styleProfiles]);

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

  const createStyleBindingMutation = useMutation({
    mutationFn: () => createStyleBinding({
      styleProfileId: selectedStyleProfileId,
      targetType: "chapter",
      targetId: chapterId,
      priority: 5,
      weight: 1,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.bindings(`chapter-${chapterId}`) });
    },
  });

  const deleteStyleBindingMutation = useMutation({
    mutationFn: (bindingId: string) => deleteStyleBinding(bindingId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.bindings(`chapter-${chapterId}`) });
    },
  });

  const detectStyleMutation = useMutation({
    mutationFn: () => detectStyleIssues({
      content: contentDraft,
      novelId: id,
      chapterId,
      provider: llm.provider,
      model: llm.model,
      temperature: 0.2,
    }),
  });

  const rewriteStyleMutation = useMutation({
    mutationFn: async () => {
      const report = detectStyleMutation.data?.data ?? (await detectStyleIssues({
        content: contentDraft,
        novelId: id,
        chapterId,
        provider: llm.provider,
        model: llm.model,
        temperature: 0.2,
      })).data;
      if (!report || report.violations.length === 0) {
        return { data: { content: contentDraft } };
      }
      return rewriteStyleIssues({
        content: contentDraft,
        novelId: id,
        chapterId,
        issues: report.violations.map((item) => ({
          ruleName: item.ruleName,
          excerpt: item.excerpt,
          suggestion: item.suggestion,
        })),
        provider: llm.provider,
        model: llm.model,
        temperature: 0.5,
      });
    },
    onSuccess: (response) => {
      const next = response.data?.content ?? contentDraft;
      setStyleRewritePreview(next);
      setContentDraft(next);
    },
  });

  const replanChapterMutation = useMutation({
    mutationFn: () => replanNovel(id, {
      chapterId,
      reason: "manual_replan_from_chapter_editor",
      triggerType: "manual",
      sourceIssueIds: openAuditIssueIds,
      windowSize: 3,
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    }),
    onSuccess: async (response) => {
      const affectedChapterIds = response.data?.affectedChapterIds ?? [];
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
      await Promise.all(
        affectedChapterIds.map((affectedChapterId) =>
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterPlan(id, affectedChapterId) })),
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterPlan(id, chapterId) });
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
                void start(`/novels/${id}/chapters/${chapterId}/runtime/run`, {
                  provider: llm.provider,
                  model: llm.model,
                  temperature: llm.temperature,
                  taskStyleProfileId: selectedStyleProfileId || undefined,
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
          <ChapterRuntimeContextCard
            runtimePackage={runtimePackage}
            chapterPlan={chapterPlan}
            stateSnapshot={chapterStateSnapshot}
          />
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
          <CardTitle>写法 / 审计 / 决策</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border p-3">
            <div className="mb-2 text-sm font-medium">当前章节写法</div>
            <div className="flex gap-2">
              <select
                className="flex-1 rounded-md border bg-background p-2 text-sm"
                value={selectedStyleProfileId}
                onChange={(event) => setSelectedStyleProfileId(event.target.value)}
              >
                {styleProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.name}</option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={() => createStyleBindingMutation.mutate()}
                disabled={createStyleBindingMutation.isPending || !selectedStyleProfileId || !chapterId}
              >
                绑定到本章
              </Button>
            </div>
            <div className="mt-2 space-y-2">
              {chapterStyleBindings.map((binding) => (
                <div key={binding.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <span>{binding.styleProfile?.name ?? binding.styleProfileId}</span>
                  <Button size="sm" variant="ghost" onClick={() => deleteStyleBindingMutation.mutate(binding.id)}>
                    删除
                  </Button>
                </div>
              ))}
              {runtimePackage?.context.styleContext?.matchedBindings?.length ? (
                <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
                  当前命中：{runtimePackage.context.styleContext.matchedBindings.map((binding) => binding.styleProfile?.name ?? binding.styleProfileId).join(" / ")}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-md border p-3">
            <div className="mb-2 text-sm font-medium">写法检测 / 一键修正</div>
            <div className="flex gap-2">
              <Button onClick={() => detectStyleMutation.mutate()} disabled={detectStyleMutation.isPending || !contentDraft.trim()}>
                检测 AI 味
              </Button>
              <Button variant="secondary" onClick={() => rewriteStyleMutation.mutate()} disabled={rewriteStyleMutation.isPending || !contentDraft.trim()}>
                一键修正
              </Button>
            </div>
            {detectStyleMutation.data?.data ? (
              <div className="mt-3 rounded-md border p-2 text-sm">
                <div className="font-medium">风险分：{detectStyleMutation.data.data.riskScore}</div>
                <div className="mt-1 text-muted-foreground">{detectStyleMutation.data.data.summary}</div>
              </div>
            ) : null}
            {styleRewritePreview ? (
              <div className="mt-2 rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
                已将修正结果回填到正文编辑区。
              </div>
            ) : null}
          </div>

          {runtimePackage?.styleReview?.report ? (
            <div className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">Runtime style review</div>
                <span className="text-xs text-muted-foreground">
                  risk {runtimePackage.styleReview.report.riskScore}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {runtimePackage.styleReview.autoRewritten
                  ? "This draft was auto-rewritten to better match the selected style."
                  : "This draft was checked against the selected style and kept as-is."}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {runtimePackage.styleReview.report.summary}
              </div>
              {runtimePackage.styleReview.report.violations.slice(0, 3).map((item, index) => (
                <div key={`${item.ruleId}-${index}`} className="mt-2 rounded-md border bg-muted/20 p-2 text-xs">
                  <div className="font-medium">{item.ruleName}</div>
                  <div className="mt-1 text-muted-foreground">{item.reason}</div>
                  <div className="mt-1 whitespace-pre-wrap">{item.excerpt}</div>
                </div>
              ))}
            </div>
          ) : null}
          <ChapterRuntimeAuditCard
            runtimePackage={runtimePackage}
            auditReports={chapterAuditReports}
            onReplan={() => replanChapterMutation.mutate()}
            isReplanning={replanChapterMutation.isPending}
            lastReplanResult={replanChapterMutation.data?.data ?? null}
          />
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
