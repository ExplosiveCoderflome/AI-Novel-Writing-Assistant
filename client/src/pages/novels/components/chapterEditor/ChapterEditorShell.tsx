import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createNovelSnapshot, previewChapterRewrite, updateNovelChapter } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
import AIDiffPanel from "./AIDiffPanel";
import ChapterTextEditor from "./ChapterTextEditor";
import SelectionAIFloatingToolbar from "./SelectionAIFloatingToolbar";
import type {
  ChapterEditorSelectionRange,
  ChapterEditorSessionState,
  ChapterEditorShellProps,
  SelectionToolbarPosition,
} from "./chapterEditorTypes";
import {
  CHAPTER_EDITOR_OPERATION_LABELS,
  applyCandidateToContent,
  buildChapterSummary,
  buildCharacterStateSummary,
  buildGoalSummary,
  buildRewritePreviewRequest,
  countEditorWords,
  getSaveStatusLabel,
  normalizeChapterContent,
} from "./chapterEditorUtils";

const EMPTY_SESSION: ChapterEditorSessionState = {
  sessionId: "",
  operation: "polish",
  targetRange: {
    from: 0,
    to: 0,
    text: "",
  },
  candidates: [],
  activeCandidateId: null,
  status: "idle",
  viewMode: "block",
};

export default function ChapterEditorShell(props: ChapterEditorShellProps) {
  const {
    novelId,
    chapter,
    chapterPlan,
    latestStateSnapshot,
    chapterAuditReports,
    worldInjectionSummary,
    styleSummary,
    chapterSummary,
    onBack,
    onOpenVersionHistory,
    onRunFullAudit,
    onGenerateChapterPlan,
    onReplanChapter,
    isRunningFullAudit = false,
    isGeneratingChapterPlan = false,
    isReplanningChapter = false,
  } = props;
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const lastPreviewRequestRef = useRef<ReturnType<typeof buildRewritePreviewRequest> | null>(null);
  const normalizedChapterContent = useMemo(() => normalizeChapterContent(chapter?.content ?? ""), [chapter?.content]);

  const [contentDraft, setContentDraft] = useState(normalizedChapterContent);
  const [savedContent, setSavedContent] = useState(normalizedChapterContent);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [selection, setSelection] = useState<ChapterEditorSelectionRange | null>(null);
  const [selectionToolbarPosition, setSelectionToolbarPosition] = useState<SelectionToolbarPosition | null>(null);
  const [session, setSession] = useState<ChapterEditorSessionState>(EMPTY_SESSION);
  const [isContextOpen, setIsContextOpen] = useState(false);

  useEffect(() => {
    const nextContent = normalizedChapterContent;
    setContentDraft(nextContent);
    setSavedContent(nextContent);
    setSaveStatus("idle");
    setSelection(null);
    setSelectionToolbarPosition(null);
    setSession(EMPTY_SESSION);
    lastPreviewRequestRef.current = null;
  }, [chapter?.id, normalizedChapterContent]);

  const isDirty = contentDraft !== savedContent;
  const wordCount = useMemo(() => countEditorWords(contentDraft), [contentDraft]);
  const openAuditIssues = useMemo(
    () => chapterAuditReports.flatMap((report) => report.issues.filter((issue) => issue.status === "open")),
    [chapterAuditReports],
  );
  const goalSummary = useMemo(
    () => buildGoalSummary(chapterPlan, chapter?.expectation),
    [chapter?.expectation, chapterPlan],
  );
  const derivedChapterSummary = useMemo(
    () => buildChapterSummary(chapterSummary, chapter?.content),
    [chapter?.content, chapterSummary],
  );
  const characterStateSummary = useMemo(
    () => buildCharacterStateSummary(latestStateSnapshot),
    [latestStateSnapshot],
  );
  const activeCandidate = useMemo(
    () => session.candidates.find((candidate) => candidate.id === session.activeCandidateId) ?? null,
    [session.activeCandidateId, session.candidates],
  );

  const invalidateChapterQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.snapshots(novelId) }),
      chapter?.id
        ? queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterPlan(novelId, chapter.id) })
        : Promise.resolve(),
      chapter?.id
        ? queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterAuditReports(novelId, chapter.id) })
        : Promise.resolve(),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.latestStateSnapshot(novelId) }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async (nextContent: string) => {
      if (!chapter) {
        throw new Error("当前未选中章节。");
      }
      return updateNovelChapter(novelId, chapter.id, { content: nextContent });
    },
    onMutate: () => {
      setSaveStatus("saving");
    },
    onSuccess: async (_response, nextContent) => {
      setSavedContent(nextContent);
      setSaveStatus("saved");
      await invalidateChapterQueries();
      toast.success("章节正文已保存。");
    },
    onError: (error) => {
      setSaveStatus("error");
      toast.error(error instanceof Error ? error.message : "章节保存失败。");
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (request: ReturnType<typeof buildRewritePreviewRequest>) => {
      if (!chapter) {
        throw new Error("当前未选中章节。");
      }
      return previewChapterRewrite(novelId, chapter.id, request);
    },
    onMutate: (request) => {
      lastPreviewRequestRef.current = request;
      setSession((current) => ({
        ...current,
        status: "loading",
        operation: request.operation,
        operationLabel: CHAPTER_EDITOR_OPERATION_LABELS[request.operation],
        customInstruction: request.customInstruction,
        targetRange: request.targetRange,
        candidates: [],
        activeCandidateId: null,
        errorMessage: undefined,
      }));
    },
    onSuccess: (response, request) => {
      const data = response.data;
      if (!data) {
        setSession((current) => ({
          ...current,
          status: "error",
          errorMessage: "AI 未返回改写结果，请重试。",
        }));
        return;
      }
      setSession({
        ...data,
        status: "ready",
        viewMode: "block",
        operationLabel: CHAPTER_EDITOR_OPERATION_LABELS[request.operation],
        customInstruction: request.customInstruction,
        errorMessage: undefined,
      });
      setSelection(null);
      setSelectionToolbarPosition(null);
    },
    onError: (error) => {
      setSession((current) => ({
        ...current,
        status: "error",
        errorMessage: error instanceof Error ? error.message : "AI 改写失败，请重试。",
      }));
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!chapter || !activeCandidate) {
        throw new Error("当前没有可应用的候选版本。");
      }
      const label = `chapter-editor:${chapter.order}:${session.operation}:${Date.now()}`;
      const nextContent = applyCandidateToContent(contentDraft, session.targetRange, activeCandidate.content);
      await createNovelSnapshot(novelId, {
        triggerType: "manual",
        label,
      });
      await updateNovelChapter(novelId, chapter.id, {
        content: nextContent,
      });
      return nextContent;
    },
    onSuccess: async (nextContent) => {
      setContentDraft(nextContent);
      setSavedContent(nextContent);
      setSaveStatus("saved");
      setSession(EMPTY_SESSION);
      await invalidateChapterQueries();
      toast.success("已应用候选版本，并创建 AI 修改前快照。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "应用候选版本失败。");
    },
  });

  const handleRunOperation = (
    operation: "polish" | "expand" | "compress" | "emotion" | "conflict" | "custom",
    customInstruction?: string,
  ) => {
    if (!chapter || !selection) {
      return;
    }
    const request = buildRewritePreviewRequest({
      operation,
      customInstruction,
      selection,
      content: contentDraft,
      goalSummary,
      chapterSummary: derivedChapterSummary,
      styleSummary,
      characterStateSummary,
      worldConstraintSummary: worldInjectionSummary,
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    });
    previewMutation.mutate(request);
  };

  const handleRegenerate = () => {
    if (!lastPreviewRequestRef.current) {
      return;
    }
    previewMutation.mutate(lastPreviewRequestRef.current);
  };

  const handleReject = () => {
    setSession(EMPTY_SESSION);
  };

  const headerSaveLabel = getSaveStatusLabel(saveStatus, isDirty);
  const previewPayload = session.status === "loading" && session.targetRange.text
    ? {
      mode: "loading" as const,
      from: session.targetRange.from,
      to: session.targetRange.to,
      originalText: session.targetRange.text,
    }
    : session.status === "ready" && activeCandidate
      ? {
        mode: session.viewMode,
        from: session.targetRange.from,
        to: session.targetRange.to,
        diffChunks: activeCandidate.diffChunks,
        originalText: session.targetRange.text,
        candidateText: activeCandidate.content,
      }
      : null;

  if (!chapter) {
    return (
      <div className="rounded-3xl border border-dashed border-border/70 bg-muted/10 p-10 text-center text-sm text-muted-foreground">
        请选择一个章节后开始编辑正文。
      </div>
    );
  }

  const gridClassName = "xl:grid-cols-[280px_minmax(0,1fr)_360px]";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0 rounded-3xl border border-border/70 bg-background px-4 py-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {onBack ? (
                <Button size="sm" variant="outline" onClick={onBack}>
                  返回章节执行页
                </Button>
              ) : null}
              <span className="text-lg font-semibold text-foreground">
                第 {chapter.order} 章 · {chapter.title?.trim() || "未命名章节"}
              </span>
              <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                {wordCount} 字
              </span>
              <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                {session.status === "idle" ? "编辑模式" : "修订模式"}
              </span>
              <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                {headerSaveLabel}
              </span>
              <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                问题 {openAuditIssues.length}
              </span>
            </div>
            {styleSummary ? (
              <div className="text-sm leading-6 text-muted-foreground">
                当前写法资产：{styleSummary}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setIsContextOpen((current) => !current)}>
              {isContextOpen ? "收起上下文" : "展开上下文"}
            </Button>
            {onOpenVersionHistory ? (
              <Button size="sm" variant="outline" onClick={onOpenVersionHistory}>
                版本入口
              </Button>
            ) : null}
            <Button size="sm" onClick={() => saveMutation.mutate(contentDraft)} disabled={!isDirty || saveMutation.isPending}>
              {saveMutation.isPending ? "保存中..." : "保存"}
            </Button>
          </div>
        </div>
      </div>

      <div className={`grid min-h-0 flex-1 gap-4 overflow-hidden ${gridClassName}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1">
            <div className="shrink-0 rounded-3xl border border-border/70 bg-background p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium text-foreground">章节上下文</div>
                <span className="text-xs text-muted-foreground">轻侧区</span>
              </div>

              {isContextOpen ? (
                <div className="space-y-4 text-sm leading-6">
                  <div>
                    <div className="mb-1 font-medium text-foreground">本章目标</div>
                    <div className="text-muted-foreground">{goalSummary || "暂无"}</div>
                  </div>
                  <div>
                    <div className="mb-1 font-medium text-foreground">本章摘要</div>
                    <div className="whitespace-pre-wrap text-muted-foreground">{derivedChapterSummary || "暂无"}</div>
                  </div>
                  <div>
                    <div className="mb-1 font-medium text-foreground">角色状态</div>
                    <div className="whitespace-pre-wrap text-muted-foreground">{characterStateSummary || "暂无"}</div>
                  </div>
                  <div>
                    <div className="mb-1 font-medium text-foreground">上下文摘要</div>
                    <div className="whitespace-pre-wrap text-muted-foreground">{worldInjectionSummary || "暂无"}</div>
                  </div>
                </div>
              ) : (
                <div className="text-sm leading-6 text-muted-foreground">
                  保持正文居中。需要时再展开本章目标、角色状态和世界约束。
                </div>
              )}
            </div>

            <div className="shrink-0 rounded-3xl border border-border/70 bg-background p-4 shadow-sm">
              <div className="mb-3 text-sm font-medium text-foreground">问题与入口</div>
              <div className="space-y-3 text-sm leading-6 text-muted-foreground">
                <div>当前开放问题：{openAuditIssues.length}</div>
                {openAuditIssues.slice(0, 3).map((issue) => (
                  <div key={issue.id} className="rounded-2xl bg-muted/15 p-3">
                    <div className="font-medium text-foreground">{issue.auditType} · {issue.code}</div>
                    <div>{issue.evidence}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {onRunFullAudit ? (
                  <Button size="sm" variant="outline" onClick={onRunFullAudit} disabled={isRunningFullAudit}>
                    {isRunningFullAudit ? "审校中..." : "运行审校"}
                  </Button>
                ) : null}
                {onGenerateChapterPlan ? (
                  <Button size="sm" variant="outline" onClick={onGenerateChapterPlan} disabled={isGeneratingChapterPlan}>
                    {isGeneratingChapterPlan ? "生成中..." : "章节计划"}
                  </Button>
                ) : null}
                {onReplanChapter ? (
                  <Button size="sm" variant="outline" onClick={onReplanChapter} disabled={isReplanningChapter}>
                    {isReplanningChapter ? "重规划中..." : "重新规划"}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="relative min-h-0 overflow-hidden">
          <ChapterTextEditor
            value={contentDraft}
            readOnly={session.status !== "idle"}
            onChange={(next) => {
              setContentDraft(next);
              setSaveStatus("idle");
            }}
            onSelectionChange={(nextSelection, position) => {
              setSelection(nextSelection);
              setSelectionToolbarPosition(position);
            }}
            preview={previewPayload}
          />
          <SelectionAIFloatingToolbar
            visible={Boolean(selection && session.status === "idle")}
            position={selectionToolbarPosition}
            disabled={previewMutation.isPending}
            onRunOperation={handleRunOperation}
          />
        </div>

        <div className="min-h-0 overflow-hidden">
          <AIDiffPanel
            session={session}
            activeCandidate={activeCandidate}
            isApplying={acceptMutation.isPending}
            onSelectCandidate={(candidateId) => setSession((current) => ({ ...current, activeCandidateId: candidateId }))}
            onChangeViewMode={(mode) => setSession((current) => ({ ...current, viewMode: mode }))}
            onAccept={() => acceptMutation.mutate()}
            onReject={handleReject}
            onRegenerate={handleRegenerate}
          />
        </div>
      </div>
    </div>
  );
}
