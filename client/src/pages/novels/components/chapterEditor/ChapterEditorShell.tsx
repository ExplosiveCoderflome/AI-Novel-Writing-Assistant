import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ChapterEditorDiagnosticCard,
  ChapterEditorCursorContinuationRequest,
  ChapterEditorCursorOperation,
  ChapterEditorOperation,
  ChapterEditorRecommendedTask,
  ChapterEditorRevisionScope,
  ChapterEditorTargetRange,
  ChapterEditorWorkspaceResponse,
} from "@ai-novel/shared/types/novel";
import { useCandidateAcceptance, useCandidateReview } from "./review";
import { applySavedRevisionToWorkspace, findRecommendedDiagnostic, removeCompletedDiagnostic } from "./diagnostics";
import {
  readChapterQualityDebtDetails,
  type ChapterQualityDebtDetails,
} from "@ai-novel/shared/types/chapterQualityLoop";
import { AlertTriangle, Loader2 } from "lucide-react";
import { createNovelSnapshot, previewChapterAiRevision, previewChapterCursorContinuation, resolveChapterAuditIssue, reviewNovelChapter, updateNovelChapter } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
import ChapterEditorDirectorPanel from "./ChapterEditorDirectorPanel";
import ChapterEditorSidebar from "./ChapterEditorSidebar";
import ChapterVersionDrawer from "./ChapterVersionDrawer";
import ChapterTextEditor from "./ChapterTextEditor";
import type {
  ChapterEditorSelectionRange,
  ChapterEditorSessionState,
  ChapterEditorShellProps,
} from "./chapterEditorTypes";
import {
  CHAPTER_EDITOR_CURSOR_OPERATION_LABELS,
  CHAPTER_EDITOR_OPERATION_LABELS,
  buildAiRevisionRequest,
  countEditorWords,
  getSaveStatusLabel,
  getParagraphWindow,
  getParagraphIndicesForRange,
  normalizeChapterContent,
  useChapterDraft,
} from "./document";

const EMPTY_SESSION: ChapterEditorSessionState = {
  sessionId: "",
  scope: "selection",
  targetRange: {
    from: 0,
    to: 0,
    text: "",
  },
  candidates: [],
  activeCandidateId: null,
  status: "idle",
  viewMode: "block",
  mode: "revision",
};

function formatQualityDebtSource(source: string | null): string {
  if (source === "repair_recheck") return "自动修复后的复审";
  if (source === "pipeline_review") return "AI 自动审校";
  if (source === "manual_review") return "手动审校";
  return "历史质量记录";
}

function formatQualityDebtAttempts(details: ChapterQualityDebtDetails): string {
  if (details.repairAttemptsUsed === null) {
    return "历史记录未保存自动修复次数";
  }
  if (details.repairAttemptsAllowed === 0) {
    return `${details.repairAttemptsUsed} 次，本次未启用自动修复`;
  }
  return `${details.repairAttemptsUsed}/${details.repairAttemptsAllowed} 次`;
}

function toSelectionFromRange(
  content: string,
  range?: Pick<ChapterEditorTargetRange, "from" | "to"> | null,
): ChapterEditorSelectionRange | null {
  if (!range) {
    return null;
  }
  if (range.from < 0 || range.to <= range.from || range.to > content.length) {
    return null;
  }
  const text = content.slice(range.from, range.to);
  if (!text.trim()) {
    return null;
  }
  return {
    from: range.from,
    to: range.to,
    text,
  };
}

export default function ChapterEditorShell(props: ChapterEditorShellProps) {
  const {
    novelId,
    chapter,
    workspace,
    workspaceStatus,
    onBack,
    onOpenVersionHistory,
    onRefreshWorkspace,
    isRefreshingWorkspace,
  } = props;
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const lastPreviewRequestRef = useRef<ReturnType<typeof buildAiRevisionRequest> | null>(null);
  const lastPreviewDiagnosticRef = useRef<ChapterEditorDiagnosticCard | undefined>(undefined);
  const lastContinuationRequestRef = useRef<ChapterEditorCursorContinuationRequest | null>(null);
  const qualityDebtDetails = useMemo(
    () => readChapterQualityDebtDetails(chapter?.riskFlags),
    [chapter?.riskFlags],
  );

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [selection, setSelection] = useState<ChapterEditorSelectionRange | null>(null);
  const [cursorOffset, setCursorOffset] = useState<number | null>(null);
  const [session, setSession] = useState<ChapterEditorSessionState>(EMPTY_SESSION);
  const [revisionScope, setRevisionScope] = useState<ChapterEditorRevisionScope>("selection");
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [selectedDiagnosticId, setSelectedDiagnosticId] = useState<string | null>(null);
  const [focusRequestKey, setFocusRequestKey] = useState(0);
  const [isVersionDrawerOpen, setIsVersionDrawerOpen] = useState(false);
  const [loadedSnapshotId, setLoadedSnapshotId] = useState<string | null>(null);

  const draft = useChapterDraft({
    novelId,
    chapter: chapter ? { id: chapter.id, content: chapter.content, updatedAt: String(chapter.updatedAt) } : undefined,
    busy: session.status !== "idle",
  });
  const { contentDraft, savedContent, isDirty, hasExternalChange, restored, storageError } = draft;

  useEffect(() => {
    setSaveStatus("idle");
    setSelection(null);
    setCursorOffset(null);
    setSession(EMPTY_SESSION);
    setRevisionInstruction("");
    setRevisionScope("selection");
    setIsVersionDrawerOpen(false);
    setLoadedSnapshotId(null);
    lastPreviewRequestRef.current = null;
    lastPreviewDiagnosticRef.current = undefined;
    setFocusRequestKey(0);
    lastContinuationRequestRef.current = null;
  }, [chapter?.id]);

  useEffect(() => {
    if (!workspace) {
      setSelectedDiagnosticId(null);
      return;
    }
    if (selectedDiagnosticId && !workspace.diagnosticCards.some((card) => card.id === selectedDiagnosticId)) {
      setSelectedDiagnosticId(null);
    }
  }, [selectedDiagnosticId, workspace]);

  const wordCount = useMemo(() => countEditorWords(contentDraft), [contentDraft]);
  const activeCandidate = useMemo(
    () => session.candidates?.find((candidate) => candidate.id === session.activeCandidateId) ?? session.candidates?.[0] ?? null,
    [session.activeCandidateId, session.candidates],
  );
  const selectedDiagnosticCard = useMemo(
    () => workspace?.diagnosticCards.find((card) => card.id === selectedDiagnosticId) ?? null,
    [selectedDiagnosticId, workspace],
  );
  const primaryDiagnosticCard = useMemo(
    () => workspace ? findRecommendedDiagnostic(workspace) ?? workspace.diagnosticCards[0] ?? null : null,
    [workspace],
  );
  const assistantDiagnosticCard = selectedDiagnosticCard
    ?? (!selection && cursorOffset === null && revisionScope === "selection" ? primaryDiagnosticCard : null);
  const actionContext = assistantDiagnosticCard ? "diagnostic" : selection ? "selection" : cursorOffset !== null ? "cursor" : "chapter";
  const selectedDiagnosticSelection = useMemo(
    () => toSelectionFromRange(contentDraft, selectedDiagnosticCard?.anchorRange ?? null),
    [contentDraft, selectedDiagnosticCard?.anchorRange],
  );
  const recommendedTaskSelection = useMemo(
    () => toSelectionFromRange(contentDraft, workspace?.recommendedTask?.anchorRange ?? null),
    [contentDraft, workspace?.recommendedTask?.anchorRange],
  );

  const invalidateChapterQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.simpleShelf(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.qualityReport(novelId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.snapshots(novelId) }),
      chapter?.id
        ? queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterPlan(novelId, chapter.id) })
        : Promise.resolve(),
      chapter?.id
        ? queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterSnapshots(novelId, chapter.id) })
        : Promise.resolve(),
      chapter?.id
        ? queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterAuditReports(novelId, chapter.id) })
        : Promise.resolve(),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.latestStateSnapshot(novelId) }),
    ]);
  };

  const leaveEditor = (action?: () => void) => {
    if (isBusy) {
      toast.error("请等待当前操作完成后再离开正文编辑。");
      return;
    }
    if ((isDirty || session.status === "ready") && !window.confirm("未保存的修改可从草稿恢复，未采纳的 AI 候选将被关闭。要离开正文编辑吗？")) {
      return;
    }
    action?.();
  };

  const saveMutation = useMutation({
    mutationFn: async (nextContent: string) => {
      if (!chapter) {
        throw new Error("当前未选中章节。");
      }
      if (loadedSnapshotId) {
        await createNovelSnapshot(novelId, {
          triggerType: "manual",
          label: `chapter-editor:before-version-load:${chapter.order}:${Date.now()}`,
        });
      }
      return updateNovelChapter(novelId, chapter.id, { content: nextContent, expectedUpdatedAt: draft.savedUpdatedAt, expectedContent: draft.savedContent });
    },
    onMutate: () => {
      setSaveStatus("saving");
    },
    onSuccess: async (response, nextContent) => {
      draft.acknowledgeSave(nextContent, { content: response.data?.content, updatedAt: String(response.data?.updatedAt ?? Date.now()) });
      setLoadedSnapshotId(null);
      setSaveStatus("saved");
      await invalidateChapterQueries();
      await props.onChapterSaved?.();
      toast.success("章节正文已保存。");
    },
    onError: (error) => {
      setSaveStatus("error");
      toast.error(error instanceof Error ? error.message : "章节保存失败。");
    },
  });

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") {
        return;
      }
      event.preventDefault();
      if (chapter && isDirty && !saveMutation.isPending) {
        saveMutation.mutate(contentDraft);
      }
    };
    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [chapter, contentDraft, isDirty, saveMutation]);

  const reviewMutation = useMutation({
    mutationFn: async () => {
      if (!chapter) {
        throw new Error("当前未选中章节。");
      }
      if (isDirty || saveMutation.isPending) {
        throw new Error("请先保存正文，再重新审校。");
      }
      return reviewNovelChapter(novelId, chapter.id, {
        provider: llm.provider,
        model: llm.model,
        temperature: 0.1,
        content: savedContent,
      });
    },
    onSuccess: async (response) => {
      await invalidateChapterQueries();
      const assessment = response.data?.qualityAssessment;
      toast.success(assessment?.recommendedAction === "continue"
        ? "重新审校通过，本章待优化项已关闭。"
        : "重新审校完成，AI 仍发现需要处理的内容。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "重新审校失败，请稍后重试。");
    },
  });

  const resolveDiagnosticMutation = useMutation({
    mutationFn: async (issueId: string) => resolveChapterAuditIssue(novelId, issueId),
    onSuccess: async (_response, issueId) => {
      if (chapter) {
        queryClient.setQueryData<ApiResponse<ChapterEditorWorkspaceResponse>>(
          queryKeys.novels.chapterEditorWorkspace(novelId, chapter.id),
          (cached) => {
            const card = cached?.data?.diagnosticCards.find((item) => item.sourceIssueId === issueId);
            return cached?.data && card ? { ...cached, data: removeCompletedDiagnostic(cached.data, card) } : cached;
          },
        );
      }
      setSelectedDiagnosticId(null);
      await invalidateChapterQueries();
      onRefreshWorkspace?.();
      toast.success("问题已标记为处理完成，重新分析后会确认正文状态。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "问题状态更新失败，请稍后重试。");
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (request: ReturnType<typeof buildAiRevisionRequest>) => {
      if (!chapter) {
        throw new Error("当前未选中章节。");
      }
      return previewChapterAiRevision(novelId, chapter.id, request);
    },
    onMutate: (request) => {
      lastPreviewRequestRef.current = request;
      const label = request.source === "freeform"
        ? (request.scope === "chapter" ? "正在生成整章自然语言修正方案" : "正在按你的意见改写片段")
        : request.presetOperation
          ? `正在生成${CHAPTER_EDITOR_OPERATION_LABELS[request.presetOperation]}方案`
          : "正在生成修正方案";
      setSession((current) => ({
        ...current,
        mode: "revision",
        diagnosticCard: lastPreviewDiagnosticRef.current,
        status: "loading",
        requestLabel: label,
        customInstruction: request.instruction,
        scope: request.scope,
        targetRange: request.selection ?? {
          from: 0,
          to: contentDraft.length,
          text: contentDraft,
        },
        candidates: [],
        activeCandidateId: null,
        errorMessage: undefined,
      }));
    },
    onSuccess: (response) => {
      const data = response.data;
      if (!data) {
        setSession((current) => ({
          ...current,
          status: "error",
          errorMessage: "AI 未返回改写结果，请重试。",
        }));
        return;
      }
      setSession((current) => ({
        ...data,
        mode: "revision",
        status: "ready",
        viewMode: "block",
        activeCandidateId: data.activeCandidateId ?? data.candidates[0]?.id ?? null,
        requestLabel: current.requestLabel,
        diagnosticCard: current.diagnosticCard,
        errorMessage: undefined,
      }));
      setSelection(null);
    },
    onError: (error) => {
      setSession((current) => ({
        ...current,
        status: "error",
        errorMessage: error instanceof Error ? error.message : "AI 修正失败，请重试。",
      }));
    },
  });

  const continuationMutation = useMutation({
    mutationFn: async (request: ChapterEditorCursorContinuationRequest) => {
      if (!chapter) {
        throw new Error("当前未选中章节。");
      }
      return previewChapterCursorContinuation(novelId, chapter.id, request);
    },
    onMutate: (request) => {
      lastContinuationRequestRef.current = request;
      setSession((current) => ({
        ...current,
        mode: "continuation",
        diagnosticCard: undefined,
        status: "loading",
        requestLabel: `正在生成${CHAPTER_EDITOR_CURSOR_OPERATION_LABELS[request.operation]}方案`,
        continuationOperation: request.operation,
        scope: "selection",
        targetRange: {
          from: request.cursorOffset,
          to: request.cursorOffset,
          text: "",
        },
        candidates: [],
        activeCandidateId: null,
        errorMessage: undefined,
      }));
    },
    onSuccess: (response) => {
      const data = response.data;
      if (!data) {
        setSession((current) => ({ ...current, status: "error", errorMessage: "AI 未返回续写结果，请重试。" }));
        return;
      }
      setSession((current) => ({
        ...current,
        ...data,
        mode: "continuation",
        continuationOperation: data.operation,
        status: "ready",
        viewMode: "block",
        activeCandidateId: data.activeCandidateId ?? data.candidates[0]?.id ?? null,
        errorMessage: undefined,
      }));
      setSelection(null);
      setCursorOffset(null);
    },
    onError: (error) => {
      setSession((current) => ({
        ...current,
        status: "error",
        errorMessage: error instanceof Error ? error.message : "AI 续写失败，请重试。",
      }));
    },
  });

  const review = useCandidateReview(session.sessionId ?? "", session.targetRange?.text ?? "", activeCandidate);
  const acceptMutation = useCandidateAcceptance({
    novelId, chapter, session, candidate: activeCandidate,
    selectedChangeIds: review.selectedChangeIds,
    content: contentDraft,
    sourceSnapshot: session.mode === "continuation"
      ? lastContinuationRequestRef.current?.contentSnapshot : lastPreviewRequestRef.current?.contentSnapshot,
    savedUpdatedAt: draft.savedUpdatedAt,
    savedContent: draft.savedContent,
    acknowledgeSave: draft.acknowledgeSave,
    onAccepted: async ({ nextContent, savedUpdatedAt, fullyAccepted }) => {
      let completedCard = fullyAccepted ? session.diagnosticCard : undefined;
      if (completedCard?.sourceIssueId) {
        try {
          const response = await resolveChapterAuditIssue(novelId, completedCard.sourceIssueId);
          if (!response.success) throw new Error(response.error || "问题状态更新失败。");
        } catch {
          completedCard = undefined;
          toast.error("正文已保存，但问题状态更新失败。请在问题卡中确认已处理。");
        }
      }
      if (chapter && session.targetRange) {
        queryClient.setQueryData<ApiResponse<ChapterEditorWorkspaceResponse>>(
          queryKeys.novels.chapterEditorWorkspace(novelId, chapter.id),
          (cached) => cached?.data ? {
            ...cached,
            data: applySavedRevisionToWorkspace(cached.data, {
              previousUpdatedAt: draft.savedUpdatedAt,
              savedUpdatedAt,
              previousContent: contentDraft,
              nextContent,
              targetRange: session.targetRange!,
              completedCard,
            }),
          } : cached,
        );
      }
      setSaveStatus("saved");
      setSession(EMPTY_SESSION);
      setRevisionInstruction("");
      setSelectedDiagnosticId(null);
      await invalidateChapterQueries();
      await props.onChapterSaved?.();
      setLoadedSnapshotId(null);
    },
  });

  const isBusy = saveMutation.isPending || previewMutation.isPending || continuationMutation.isPending
    || acceptMutation.isPending || reviewMutation.isPending || resolveDiagnosticMutation.isPending;
  useEffect(() => {
    props.onEditingStateChange?.({ isDirty, isBusy, hasCandidate: session.status === "ready" });
  }, [props.onEditingStateChange, isDirty, isBusy, session.status]);

  const previewPayload = session.status === "loading" && session.targetRange
    ? {
      mode: "loading" as const,
      from: session.targetRange.from,
      to: session.targetRange.to,
      originalText: session.targetRange.text,
    }
    : session.status === "ready" && activeCandidate && session.targetRange && !review.error
      ? {
        mode: session.viewMode,
        from: session.targetRange.from,
        to: session.targetRange.to,
        diffChunks: activeCandidate.diffChunks,
        selectedChangeIds: review.selectedChangeIds,
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

  const getSelectionTarget = (
    overrideSelection?: ChapterEditorSelectionRange | null,
    task?: ChapterEditorRecommendedTask | null,
  ) => overrideSelection
    ?? selection
    ?? selectedDiagnosticSelection
    ?? toSelectionFromRange(contentDraft, task?.anchorRange ?? null)
    ?? recommendedTaskSelection
    ?? null;

  const runRevision = (
    source: "preset" | "freeform",
    scope: ChapterEditorRevisionScope,
    options?: {
      presetOperation?: ChapterEditorOperation;
      instruction?: string;
      selectionOverride?: ChapterEditorSelectionRange | null;
      task?: ChapterEditorRecommendedTask | null;
      diagnosticCard?: ChapterEditorDiagnosticCard;
    },
  ) => {
    if (isBusy || session.status !== "idle") {
      toast.error("请先完成或拒绝当前候选，再处理其他问题。");
      return;
    }
    const resolvedSelection = scope === "selection"
      ? getSelectionTarget(options?.selectionOverride, options?.task)
      : null;

    if (scope === "selection" && !resolvedSelection) {
      toast.error("请先选中正文片段，或先从问题卡定位到对应片段。");
      return;
    }

    const selectedCardMatches = selectedDiagnosticCard?.anchorRange && resolvedSelection
      && selectedDiagnosticCard.anchorRange.from === resolvedSelection.from
      && selectedDiagnosticCard.anchorRange.to === resolvedSelection.to;
    const diagnosticCard = options?.diagnosticCard ?? (selectedCardMatches ? selectedDiagnosticCard! : undefined);
    const request = buildAiRevisionRequest({
      source,
      scope,
      presetOperation: options?.presetOperation,
      instruction: options?.instruction,
      repairBrief: diagnosticCard ? {
        title: diagnosticCard.title,
        problemSummary: diagnosticCard.problemSummary,
        whyItMatters: diagnosticCard.whyItMatters,
        repairGoal: diagnosticCard.repairGoal,
        repairApproach: diagnosticCard.repairApproach,
        mustPreserve: diagnosticCard.mustPreserve,
      } : undefined,
      selection: resolvedSelection,
      content: contentDraft,
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    });
    lastPreviewDiagnosticRef.current = diagnosticCard;
    previewMutation.mutate(request);
  };

  const handleRunOperation = (operation: ChapterEditorOperation, customInstruction?: string) => {
    runRevision(
      operation === "custom" ? "freeform" : "preset",
      "selection",
      {
        presetOperation: operation === "custom" ? undefined : operation,
        instruction: customInstruction,
        selectionOverride: selection,
      },
    );
  };

  const handleRunCursorOperation = (operation: ChapterEditorCursorOperation, instruction?: string) => {
    if (isBusy || session.status !== "idle") {
      toast.error("请先完成当前操作，再生成续写候选。");
      return;
    }
    if (cursorOffset === null) {
      toast.error("请先把光标放在正文中，再选择续写方向。");
      return;
    }
    const normalizedContent = normalizeChapterContent(contentDraft);
    const cursorRange: ChapterEditorSelectionRange = {
      from: cursorOffset,
      to: cursorOffset,
      text: "",
    };
    const request: ChapterEditorCursorContinuationRequest = {
      operation,
      contentSnapshot: normalizedContent,
      cursorOffset,
      context: getParagraphWindow(normalizedContent, cursorRange),
      instruction: instruction?.trim() || undefined,
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    };
    continuationMutation.mutate(request);
  };

  const handleRegenerate = () => {
    if (session.mode === "continuation" && lastContinuationRequestRef.current) {
      continuationMutation.mutate(lastContinuationRequestRef.current);
      return;
    }
    if (!lastPreviewRequestRef.current) {
      return;
    }
    previewMutation.mutate(lastPreviewRequestRef.current);
  };

  const handleReject = () => {
    setSession(EMPTY_SESSION);
  };

  const handleLoadSnapshotContent = (content: string, snapshotId: string) => {
    draft.setContentDraft(content);
    setLoadedSnapshotId(snapshotId);
    setSaveStatus("idle");
    setSession(EMPTY_SESSION);
    setSelection(null);
    setCursorOffset(null);
    setSelectedDiagnosticId(null);
  };

  const handleFocusDiagnostic = (card: ChapterEditorDiagnosticCard) => {
    if (isBusy || session.status !== "idle") return;
    setFocusRequestKey(0);
    if (selectedDiagnosticId === card.id) {
      setSelectedDiagnosticId(null);
      return;
    }
    setSelectedDiagnosticId(card.id);
    setRevisionScope(card.recommendedScope);
    setSelection(null);
    setCursorOffset(null);
  };

  const handleRunDiagnostic = (card: ChapterEditorDiagnosticCard) => {
    if (isBusy || session.status !== "idle") return;
    if (contentDraft !== savedContent || workspace?.chapterMeta.updatedAt !== draft.savedUpdatedAt) {
      toast.error("正文已变化，请先保存并重新分析本章，确认问题位置。");
      return;
    }
    const target = toSelectionFromRange(contentDraft, card.anchorRange ?? null);
    if (card.recommendedScope === "selection" && !target) {
      toast.error("问题卡的正文位置需要重新确认，请重新分析本章后再处理。");
      return;
    }
    flushSync(() => {
      setSelectedDiagnosticId(card.id);
      setSelection(target ?? toSelectionFromRange(contentDraft, { from: 0, to: contentDraft.length }));
      setCursorOffset(null);
      setRevisionScope(card.recommendedScope);
      setFocusRequestKey((current) => current + 1);
    });
    runRevision("preset", card.recommendedScope, {
      presetOperation: card.recommendedAction,
      selectionOverride: target,
      diagnosticCard: card,
      instruction: revisionInstruction.trim() || undefined,
    });
  };


  const handleRunSelectedDiagnostic = () => {
    if (!assistantDiagnosticCard) {
      return;
    }
    handleRunDiagnostic(assistantDiagnosticCard);
  };

  const handleRunFreeform = () => {
    runRevision("freeform", revisionScope, {
      instruction: revisionInstruction.trim(),
    });
  };

  const canRunSelectionRevision = Boolean(getSelectionTarget());
  const headerSaveLabel = getSaveStatusLabel(saveStatus, isDirty);
  const cursorParagraph = cursorOffset !== null
    ? getParagraphIndicesForRange(contentDraft, { from: cursorOffset, to: cursorOffset })
    : null;
  const cursorTargetLabel = cursorParagraph ? `第 ${cursorParagraph.startIndex + 1} 段的光标处` : "正文光标处";
  const gridClassName = "xl:grid-cols-[320px_minmax(0,1fr)_400px]";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {qualityDebtDetails ? (
        <div className="flex shrink-0 flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="min-w-0 text-sm leading-6">
              <div className="font-medium">本章正文可继续使用，但还有质量待优化项</div>
              <div className="text-xs text-amber-900/80">
                来源：{formatQualityDebtSource(qualityDebtDetails.source)} · {qualityDebtDetails.reason || "AI 审校发现了局部问题。"}
                {` · 自动修复：${formatQualityDebtAttempts(qualityDebtDetails)}`}
              </div>
              {isDirty ? <div className="mt-1 text-xs font-medium">请先保存正文，再让 AI 重新审校确认。</div> : null}
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 border-amber-300 bg-white/70 hover:bg-white"
            disabled={isDirty || saveMutation.isPending || reviewMutation.isPending}
            onClick={() => reviewMutation.mutate()}
          >
            {reviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            重新审校确认
          </Button>
        </div>
      ) : null}
      {(restored || hasExternalChange || storageError) ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span>{storageError ? "浏览器暂时无法保存本地草稿，请尽快保存到作品。" : hasExternalChange ? "本章已有新的保存版本，你的草稿仍保留。" : "已恢复未保存的正文草稿。"}</span>
          {hasExternalChange ? <Button size="sm" variant="outline" onClick={draft.loadSavedVersion}>加载新保存版本</Button> : null}
        </div>
      ) : null}
      <div className={`grid min-h-0 flex-1 gap-4 overflow-y-auto xl:overflow-hidden ${gridClassName}`}>
        <div className="order-1 min-h-0 overflow-y-auto xl:order-none">
          <ChapterEditorSidebar
            chapter={chapter}
            workspace={workspace}
            workspaceStatus={workspaceStatus}
            wordCount={wordCount}
            saveStatusLabel={headerSaveLabel}
            isDirty={isDirty}
            isSaving={saveMutation.isPending}
            selectedDiagnosticId={selectedDiagnosticId}
            onBack={onBack ? () => leaveEditor(onBack) : undefined}
            backLabel={props.backLabel}
            onOpenChapterVersions={() => setIsVersionDrawerOpen(true)}
            onOpenVersionHistory={onOpenVersionHistory ? () => leaveEditor(onOpenVersionHistory) : undefined}
            onRefreshWorkspace={onRefreshWorkspace}
            isRefreshingWorkspace={isRefreshingWorkspace}
            onSave={() => saveMutation.mutate(contentDraft)}
            onFocusDiagnostic={handleFocusDiagnostic}
            onRunDiagnostic={handleRunDiagnostic}
            onResolveDiagnostic={(card) => {
              if (card.sourceIssueId) {
                resolveDiagnosticMutation.mutate(card.sourceIssueId);
              }
            }}
            isResolvingDiagnostic={resolveDiagnosticMutation.isPending}
            diagnosticsDisabled={isBusy || session.status !== "idle"}
          />
        </div>

        <div className="relative order-3 min-h-0 overflow-hidden xl:order-none">
          <ChapterTextEditor
            value={contentDraft}
            readOnly={session.status !== "idle"}
            onChange={(next) => {
              draft.setContentDraft(next);
              setSaveStatus("idle");
            }}
            onSelectionChange={(nextSelection) => {
              setSelection(nextSelection);
              if (nextSelection) {
                setRevisionScope("selection");
                setFocusRequestKey(0);
                setCursorOffset(null);
                setSelectedDiagnosticId(null);
              }
            }}
            onCursorChange={(offset) => {
              setCursorOffset(offset);
              if (offset !== null) {
                setRevisionScope("selection");
                setFocusRequestKey(0);
                setSelection(null);
                setSelectedDiagnosticId(null);
              }
            }}
            preview={previewPayload}
            focusRequestKey={focusRequestKey}
            focusRange={session.status === "idle"
              ? selection
                ? { from: selection.from, to: selection.to }
                : selectedDiagnosticCard?.anchorRange ?? null
              : null}
          />
        </div>

        <div className="order-2 min-h-0 overflow-hidden xl:order-none">
            <ChapterEditorDirectorPanel
              workspace={workspace}
              workspaceStatus={workspaceStatus}
              selectedDiagnosticCard={assistantDiagnosticCard}
              actionContext={actionContext}
              cursorTargetDescription={cursorTargetLabel}
              selectionTargetDescription={selection ? `已选中 ${countEditorWords(selection.text)} 字` : ""}
              session={session}
              activeCandidate={activeCandidate}
              diffChanges={review.changes}
              selectedDiffChangeIds={review.selectedChangeIds}
              reviewError={review.error}
              hasSelectedChanges={review.resultText !== session.targetRange?.text}
              revisionScope={revisionScope}
              revisionInstruction={revisionInstruction}
              canRunSelectionRevision={canRunSelectionRevision}
              isGenerating={isBusy}
              isApplying={acceptMutation.isPending}
              onInstructionChange={setRevisionInstruction}
              onScopeChange={(scope) => {
                setRevisionScope(scope);
                if (scope === "chapter") {
                  setSelection(null);
                  setCursorOffset(null);
                  setSelectedDiagnosticId(null);
                  setFocusRequestKey(0);
                }
              }}
              onRunCursorOperation={(operation) => handleRunCursorOperation(operation, revisionInstruction)}
              onRunSelectionOperation={(operation) => handleRunOperation(operation, revisionInstruction.trim() || undefined)}
              onRunSelectedDiagnostic={handleRunSelectedDiagnostic}
              onRunFreeform={handleRunFreeform}
              onSelectCandidate={(candidateId) => setSession((current) => ({ ...current, activeCandidateId: candidateId }))}
              onSelectAllChanges={review.selectAll}
              onToggleDiffChange={review.toggleChange}
              onChangeViewMode={(mode) => setSession((current) => ({ ...current, viewMode: mode }))}
              onAccept={() => acceptMutation.mutate()}
              onReject={handleReject}
              onRegenerate={handleRegenerate}
            />
        </div>
      </div>
      <ChapterVersionDrawer
        novelId={novelId}
        chapterId={chapter.id}
        chapterTitle={chapter.title}
        open={isVersionDrawerOpen}
        onOpenChange={setIsVersionDrawerOpen}
        currentContent={contentDraft}
        isDirty={isDirty}
        onLoadContent={handleLoadSnapshotContent}
      />
    </div>
  );
}
