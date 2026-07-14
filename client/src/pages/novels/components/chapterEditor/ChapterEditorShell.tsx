import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import type {
  ChapterEditorDiagnosticCard,
  ChapterEditorOperation,
  ChapterEditorRecommendedTask,
  ChapterEditorRevisionScope,
  ChapterEditorTargetRange,
} from "@ai-novel/shared/types/novel";
import { createNovelSnapshot, previewChapterAiRevision, updateNovelChapter, previewChapterContinue, previewChapterIssueFix, listNovelSnapshots, restoreNovelSnapshot } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
import { Dialog, AppDialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import ChapterEditorDirectorPanel from "./ChapterEditorDirectorPanel";
import ChapterEditorSidebar from "./ChapterEditorSidebar";
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
  buildAiRevisionRequest,
  countEditorWords,
  getSaveStatusLabel,
  normalizeChapterContent,
  getParagraphWindow,
} from "./chapterEditorUtils";

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
};

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
  } = props;
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const lastPreviewRequestRef = useRef<{
    actionType: "ai_revision" | "continue" | "issue_fix";
    issueId?: string;
    revisionRequest?: any;
    continueRequest?: any;
    issueFixRequest?: any;
  } | null>(null);
  const normalizedChapterContent = useMemo(() => normalizeChapterContent(chapter?.content ?? ""), [chapter?.content]);

  const [contentDraft, setContentDraft] = useState(normalizedChapterContent);
  const [savedContent, setSavedContent] = useState(normalizedChapterContent);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [selection, setSelection] = useState<ChapterEditorSelectionRange | null>(null);
  const [selectionToolbarPosition, setSelectionToolbarPosition] = useState<SelectionToolbarPosition | null>(null);
  const [session, setSession] = useState<ChapterEditorSessionState>(EMPTY_SESSION);
  const [revisionScope, setRevisionScope] = useState<ChapterEditorRevisionScope>("selection");
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [selectedDiagnosticId, setSelectedDiagnosticId] = useState<string | null>(null);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);

  const snapshotsQuery = useQuery({
    queryKey: queryKeys.novels.snapshots(novelId),
    queryFn: () => listNovelSnapshots(novelId),
    enabled: isVersionHistoryOpen,
  });

  const restoreSnapshotMutation = useMutation({
    mutationFn: (snapshotId: string) => restoreNovelSnapshot(novelId, snapshotId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(novelId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterEditorWorkspace(novelId, chapter?.id ?? "none") });
      setIsVersionHistoryOpen(false);
      toast.success("已恢复到选定的历史版本。");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "恢复版本失败，请重试。");
    },
  });

  useEffect(() => {
    const nextContent = normalizedChapterContent;
    setContentDraft(nextContent);
    setSavedContent(nextContent);
    setSaveStatus("idle");
    setSelection(null);
    setSelectionToolbarPosition(null);
    setSession(EMPTY_SESSION);
    setRevisionInstruction("");
    setRevisionScope("selection");
    lastPreviewRequestRef.current = null;
  }, [chapter?.id, normalizedChapterContent]);

  useEffect(() => {
    if (!workspace) {
      setSelectedDiagnosticId(null);
      return;
    }
    if (selectedDiagnosticId && !workspace.diagnosticCards.some((card) => card.id === selectedDiagnosticId)) {
      setSelectedDiagnosticId(null);
    }
  }, [selectedDiagnosticId, workspace]);

  const isDirty = contentDraft !== savedContent;
  const wordCount = useMemo(() => countEditorWords(contentDraft), [contentDraft]);
  const activeCandidate = useMemo(
    () => session.candidates?.find((candidate) => candidate.id === session.activeCandidateId) ?? null,
    [session.activeCandidateId, session.candidates],
  );
  const selectedDiagnosticCard = useMemo(
    () => workspace?.diagnosticCards.find((card) => card.id === selectedDiagnosticId) ?? null,
    [selectedDiagnosticId, workspace],
  );
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
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterEditorWorkspace(novelId, chapter?.id ?? "none") }),
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
        throw new Error(t("gen.pages.novels.components.chapterEditor.ChapterEditorShell.gen_af1e4a3a"));
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
      toast.success(t("gen.pages.novels.components.chapterEditor.ChapterEditorShell.gen_eb725780"));
    },
    onError: (error) => {
      setSaveStatus("error");
      toast.error(error instanceof Error ? error.message : t("gen.pages.novels.components.chapterEditor.ChapterEditorShell.gen_91d500a5"));
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (action: {
      actionType: "ai_revision" | "continue" | "issue_fix";
      issueId?: string;
      revisionRequest?: any;
      continueRequest?: any;
      issueFixRequest?: any;
    }) => {
      if (!chapter) {
        throw new Error(t("gen.pages.novels.components.chapterEditor.ChapterEditorShell.gen_af1e4a3a"));
      }
      if (action.actionType === "continue") {
        return previewChapterContinue(novelId, chapter.id, action.continueRequest);
      }
      if (action.actionType === "issue_fix") {
        if (!action.issueId) {
          throw new Error("无法进行定位问题修复：未指定问题ID。");
        }
        return previewChapterIssueFix(novelId, chapter.id, action.issueId, action.issueFixRequest);
      }
      return previewChapterAiRevision(novelId, chapter.id, action.revisionRequest);
    },
    onMutate: (action) => {
      lastPreviewRequestRef.current = action;
      let label = "正在处理 AI 请求";
      let scope: any = "selection";
      let targetRange = {
        from: 0,
        to: contentDraft.length,
        text: contentDraft,
      };
      let instruction = "";

      if (action.actionType === "continue") {
        label = "正在生成 AI 续写内容";
        scope = "selection";
        const selectionRange = action.revisionRequest?.selection;
        if (selectionRange) {
          targetRange = {
            from: selectionRange.from,
            to: selectionRange.to,
            text: selectionRange.text,
          };
        }
        instruction = action.continueRequest?.customInstruction || "";
      } else if (action.actionType === "issue_fix") {
        label = "正在修复特定审校问题";
        scope = "selection";
        const selectionRange = action.revisionRequest?.selection;
        if (selectionRange) {
          targetRange = {
            from: selectionRange.from,
            to: selectionRange.to,
            text: selectionRange.text,
          };
        }
      } else {
        const req = action.revisionRequest;
        label = req.source === "freeform"
          ? (req.scope === "chapter" ? t("gen.pages.novels.components.chapterEditor.ChapterEditorShell.gen_d6e77a91") : t("gen.pages.novels.components.chapterEditor.ChapterEditorShell.gen_0bd855a0"))
          : req.presetOperation
            ? `正在生成${CHAPTER_EDITOR_OPERATION_LABELS[req.presetOperation as ChapterEditorOperation]}方案`
            : t("gen.pages.novels.components.chapterEditor.ChapterEditorShell.gen_f04a616c");
        scope = req.scope;
        if (req.selection) {
          targetRange = req.selection;
        }
        instruction = req.instruction || "";
      }

      setSession((current) => ({
        ...current,
        status: "loading",
        requestLabel: label,
        customInstruction: instruction,
        scope,
        targetRange,
        candidates: [],
        activeCandidateId: null,
        errorMessage: undefined,
      }));
    },
    onSuccess: (response, action) => {
      const data = response.data;
      if (!data) {
        setSession((current) => ({
          ...current,
          status: "error",
          errorMessage: t("gen.pages.novels.components.chapterEditor.ChapterEditorShell.aiNoRewriteResultRetry"),
        }));
        return;
      }

      let processedData = data;
      if (action.actionType === "continue") {
        const origText = action.revisionRequest?.selection?.text || "";
        processedData = {
          ...data,
          candidates: data.candidates.map((candidate: any) => {
            const continuation = candidate.content;
            const fullContent = origText + continuation;
            return {
              ...candidate,
              content: fullContent,
              diffChunks: [
                { id: "chunk-orig", type: "equal", text: origText },
                { id: "chunk-new", type: "insert", text: continuation },
              ],
            };
          }),
        };
      }

      setSession((current) => ({
        ...processedData,
        status: "ready",
        viewMode: "block",
        requestLabel: current.requestLabel,
        errorMessage: undefined,
      }));
      setSelection(null);
      setSelectionToolbarPosition(null);
    },
    onError: (error) => {
      setSession((current) => ({
        ...current,
        status: "error",
        errorMessage: error instanceof Error ? error.message : t("gen.pages.novels.components.chapterEditor.ChapterEditorShell.aiCorrectionFailedRetry"),
      }));
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!chapter || !activeCandidate || !session.targetRange) {
        throw new Error(t("gen.pages.novels.components.chapterEditor.ChapterEditorShell.gen_5aa9265f"));
      }
      const label = `chapter-editor:${chapter.order}:${session.scope}:${Date.now()}`;
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
      setRevisionInstruction("");
      await invalidateChapterQueries();
      toast.success(t("gen.pages.novels.components.chapterEditor.ChapterEditorShell.gen_32dd4115"));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("gen.pages.novels.components.chapterEditor.ChapterEditorShell.gen_d25bf6bd"));
    },
  });

  const previewPayload = session.status === "loading" && session.targetRange?.text
    ? {
      mode: "loading" as const,
      from: session.targetRange.from,
      to: session.targetRange.to,
      originalText: session.targetRange.text,
    }
    : session.status === "ready" && activeCandidate && session.targetRange
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
    },
  ) => {
    const resolvedSelection = scope === "selection"
      ? getSelectionTarget(options?.selectionOverride, options?.task)
      : null;

    if (scope === "selection" && !resolvedSelection) {
      toast.error(t("gen.pages.novels.components.chapterEditor.ChapterEditorShell.gen_d8ad2137"));
      return;
    }

    const request = buildAiRevisionRequest({
      source,
      scope,
      presetOperation: options?.presetOperation,
      instruction: options?.instruction,
      selection: resolvedSelection,
      content: contentDraft,
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    });
    previewMutation.mutate({
      actionType: "ai_revision",
      revisionRequest: request,
    });
  };

  const handleRunOperation = (operation: ChapterEditorOperation | "continue", customInstruction?: string) => {
    if (operation === "continue") {
      const resolvedSelection = selection ?? {
        from: contentDraft.length,
        to: contentDraft.length,
        text: "",
      };
      previewMutation.mutate({
        actionType: "continue",
        continueRequest: {
          textBefore: contentDraft.slice(0, resolvedSelection.to),
          textAfter: contentDraft.slice(resolvedSelection.to) || undefined,
          customInstruction: customInstruction?.trim() || undefined,
          provider: llm.provider,
          model: llm.model,
          temperature: llm.temperature,
        },
        revisionRequest: {
          selection: resolvedSelection,
        },
      });
      return;
    }

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

  const handleRegenerate = () => {
    if (!lastPreviewRequestRef.current) {
      return;
    }
    previewMutation.mutate(lastPreviewRequestRef.current);
  };

  const handleReject = () => {
    setSession(EMPTY_SESSION);
  };

  const handleFocusDiagnostic = (card: ChapterEditorDiagnosticCard) => {
    if (selectedDiagnosticId === card.id) {
      setSelectedDiagnosticId(null);
      return;
    }
    setSelectedDiagnosticId(card.id);
    setSelection(null);
    setSelectionToolbarPosition(null);
  };

  const handleRunDiagnostic = (card: ChapterEditorDiagnosticCard) => {
    setSelectedDiagnosticId(card.id);
    const resolvedSelection = toSelectionFromRange(contentDraft, card.anchorRange ?? null) ?? {
      from: 0,
      to: 0,
      text: "",
    };

    if (card.sourceIssueId) {
      const { beforeParagraphs, afterParagraphs } = getParagraphWindow(contentDraft, resolvedSelection);
      previewMutation.mutate({
        actionType: "issue_fix",
        issueId: card.sourceIssueId,
        issueFixRequest: {
          selectedText: resolvedSelection.text,
          beforeParagraphs,
          afterParagraphs,
          provider: llm.provider,
          model: llm.model,
          temperature: llm.temperature,
        },
        revisionRequest: {
          selection: resolvedSelection,
        },
      });
      return;
    }

    runRevision("preset", card.recommendedScope, {
      presetOperation: card.recommendedAction,
      selectionOverride: resolvedSelection,
    });
  };

  const handleRunRecommended = () => {
    if (!workspace?.recommendedTask) {
      return;
    }
    runRevision("preset", workspace.recommendedTask.recommendedScope, {
      presetOperation: workspace.recommendedTask.recommendedAction,
      task: workspace.recommendedTask,
    });
  };

  const handleRunSelectedDiagnostic = () => {
    if (!selectedDiagnosticCard) {
      return;
    }
    handleRunDiagnostic(selectedDiagnosticCard);
  };

  const handleRunFreeform = () => {
    runRevision("freeform", revisionScope, {
      instruction: revisionInstruction.trim(),
    });
  };

  const currentTargetDescription = revisionScope === "chapter"
    ? t("gen.pages.novels.components.chapterEditor.ChapterEditorShell.gen_cacb093a")
    : selection
      ? t("gen.pages.novels.components.chapterEditor.ChapterEditorShell.selectedTextManually")
      : selectedDiagnosticCard?.paragraphLabel
        ? `${selectedDiagnosticCard.paragraphLabel} 对应片段`
        : workspace?.recommendedTask?.paragraphLabel
          ? `${workspace.recommendedTask.paragraphLabel} 对应片段`
          : t("gen.pages.novels.components.chapterEditor.ChapterEditorShell.gen_d4e517ac");
  const canRunSelectionRevision = Boolean(getSelectionTarget());
  const headerSaveLabel = getSaveStatusLabel(saveStatus, isDirty);
  const gridClassName = "xl:grid-cols-[320px_minmax(0,1fr)_400px]";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className={`grid min-h-0 flex-1 gap-4 overflow-hidden ${gridClassName}`}>
        <ChapterEditorSidebar
          chapter={chapter}
          workspace={workspace}
          workspaceStatus={workspaceStatus}
          wordCount={wordCount}
          saveStatusLabel={headerSaveLabel}
          isDirty={isDirty}
          isSaving={saveMutation.isPending}
          selectedDiagnosticId={selectedDiagnosticId}
          onBack={onBack}
          onOpenVersionHistory={() => setIsVersionHistoryOpen(true)}
          onSave={() => saveMutation.mutate(contentDraft)}
          onFocusDiagnostic={handleFocusDiagnostic}
          onRunDiagnostic={handleRunDiagnostic}
        />

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
              if (nextSelection) {
                setSelectedDiagnosticId(null);
              }
            }}
            preview={previewPayload}
            focusRange={session.status === "idle"
              ? selection
                ? { from: selection.from, to: selection.to }
                : selectedDiagnosticCard?.anchorRange ?? null
              : null}
          />
          <SelectionAIFloatingToolbar
            visible={Boolean(selection && session.status === "idle")}
            position={selectionToolbarPosition}
            disabled={previewMutation.isPending}
            onRunOperation={handleRunOperation}
          />
        </div>

        <div className="min-h-0 overflow-hidden">
          <ChapterEditorDirectorPanel
            workspace={workspace}
            workspaceStatus={workspaceStatus}
            selectedDiagnosticCard={selectedDiagnosticCard}
            session={session}
            activeCandidate={activeCandidate}
            revisionScope={revisionScope}
            revisionInstruction={revisionInstruction}
            canRunSelectionRevision={canRunSelectionRevision}
            currentTargetDescription={currentTargetDescription}
            isGenerating={previewMutation.isPending}
            isApplying={acceptMutation.isPending}
            onInstructionChange={setRevisionInstruction}
            onScopeChange={setRevisionScope}
            onRunRecommended={handleRunRecommended}
            onRunSelectedDiagnostic={handleRunSelectedDiagnostic}
            onRunFreeform={handleRunFreeform}
            onSelectCandidate={(candidateId) => setSession((current) => ({ ...current, activeCandidateId: candidateId }))}
            onChangeViewMode={(mode) => setSession((current) => ({ ...current, viewMode: mode }))}
            onAccept={() => acceptMutation.mutate()}
            onReject={handleReject}
            onRegenerate={handleRegenerate}
          />
        </div>
      </div>

      <Dialog open={isVersionHistoryOpen} onOpenChange={setIsVersionHistoryOpen}>
        <AppDialogContent
          title="章节历史版本"
          description="选择并恢复之前保存的章节版本。恢复前系统会自动备份当前状态。"
        >
          {snapshotsQuery.isLoading ? (
            <div className="space-y-4">
              <div className="h-12 w-full animate-pulse rounded-xl bg-muted" />
              <div className="h-12 w-full animate-pulse rounded-xl bg-muted" />
            </div>
          ) : snapshotsQuery.data?.data && snapshotsQuery.data.data.length > 0 ? (
            <div className="space-y-4">
              {snapshotsQuery.data.data.map((snapshot) => {
                const isRestoring = restoreSnapshotMutation.isPending && restoreSnapshotMutation.variables === snapshot.id;
                return (
                  <div key={snapshot.id} className="flex items-center justify-between rounded-2xl border border-border/70 p-4">
                    <div className="space-y-1">
                      <div className="font-medium text-sm">
                        {snapshot.label || `版本记录 ${new Date(snapshot.createdAt).toLocaleTimeString()}`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {snapshot.triggerType === "manual" ? "手动保存" : snapshot.triggerType === "auto_milestone" ? "里程碑自动保存" : "流水线前保存"} · {new Date(snapshot.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={restoreSnapshotMutation.isPending}
                      onClick={() => {
                        if (confirm("确定要恢复到此版本吗？当前未保存的修改将被覆盖。")) {
                          restoreSnapshotMutation.mutate(snapshot.id);
                        }
                      }}
                    >
                      {isRestoring ? "恢复中..." : "恢复此版本"}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-6 text-center text-sm text-muted-foreground">
              暂无历史版本记录。
            </div>
          )}
        </AppDialogContent>
      </Dialog>
    </div>
  );
}
