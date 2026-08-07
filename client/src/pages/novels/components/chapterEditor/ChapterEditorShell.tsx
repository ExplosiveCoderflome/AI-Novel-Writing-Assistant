import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ChapterEditorDiagnosticCard,
  ChapterEditorOperation,
  ChapterEditorRecommendedTask,
  ChapterEditorRevisionScope,
  ChapterEditorTargetRange,
} from "@ai-novel/shared/types/novel";
import { createNovelSnapshot, previewChapterAiRevision, updateNovelChapter } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
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
    onOpenVersionHistory,
  } = props;
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const lastPreviewRequestRef = useRef<ReturnType<typeof buildAiRevisionRequest> | null>(null);
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
        throw new Error("No chapters are currently selected.");
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
      toast.success("Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.");
    },
    onError: (error) => {
      setSaveStatus("error");
      toast.error(error instanceof Error ? error.message : "Chapter saving failed.");
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (request: ReturnType<typeof buildAiRevisionRequest>) => {
      if (!chapter) {
        throw new Error("No chapters are currently selected.");
      }
      return previewChapterAiRevision(novelId, chapter.id, request);
    },
    onMutate: (request) => {
      lastPreviewRequestRef.current = request;
      const label = request.source === "freeform"
        ? (request.scope === "chapter" ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.")
        : request.presetOperation
          ? `正在生成${CHAPTER_EDITOR_OPERATION_LABELS[request.presetOperation]}方案`
          : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
      setSession((current) => ({
        ...current,
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
          errorMessage: "The AI ​​did not return a rewritten result. Please try again.",
        }));
        return;
      }
      setSession((current) => ({
        ...data,
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
        errorMessage: error instanceof Error ? error.message : "AI correction failed, please try again.",
      }));
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!chapter || !activeCandidate || !session.targetRange) {
        throw new Error("There are currently no applicable release candidates.");
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
      toast.success("The release candidate is applied and a pre-AI snapshot is created.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Applying the release candidate failed.");
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
        Please select a chapter and start editing the text.
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
      toast.error("Please select the text fragment first, or locate the corresponding fragment from the question card first.");
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
    runRevision("preset", card.recommendedScope, {
      presetOperation: card.recommendedAction,
      selectionOverride: toSelectionFromRange(contentDraft, card.anchorRange ?? null),
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
    ? "Whole chapter text"
    : selection
      ? "The text fragment you manually selected"
      : selectedDiagnosticCard?.paragraphLabel
        ? `${selectedDiagnosticCard.paragraphLabel} 对应片段`
        : workspace?.recommendedTask?.paragraphLabel
          ? `${workspace.recommendedTask.paragraphLabel} corresponds to the fragment`
          : "No clip selected yet";
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
          onOpenVersionHistory={onOpenVersionHistory}
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
    </div>
  );
}
