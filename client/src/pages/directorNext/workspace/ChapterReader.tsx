import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookMarked, Lock, LockOpen, Pencil, Sparkles } from "lucide-react";
import type { ChapterEditorCandidate } from "@ai-novel/shared/types/novel";
import type { HumanStyleIssueTag } from "@ai-novel/shared/types/styleEngine";
import { Button } from "@/components/ui/button";
import {
  getNovelHumanStyleFeedback,
  previewChapterAiRevision,
  recordNovelHumanStyleFeedback,
  removeNovelHumanStyleFeedback,
  setNovelChapterProvenance,
  updateNovelChapter,
} from "@/api/novel/chapters";
import type { WorkspaceBook, WorkspaceChapter } from "./model";
import type { DirectorGenerationSnapshot } from "@ai-novel/shared/types/director/generation";
import { ReadingDisplaySettings, readingTextStyle, type ReadingDisplayPreferences } from "./reading";
import { InlineChapterBodyEditor } from "./editing/InlineChapterBodyEditor";
import { SelectionFeedbackPanel } from "./editing/SelectionFeedbackPanel";
import { BookFeedbackRulesDrawer } from "./editing/BookFeedbackRulesDrawer";
import { provenanceHint, provenanceLabel, resolveWorkspaceChapterProvenance } from "./chapterProvenance";
import {
  buildHumanFeedbackInstruction,
  buildHumanFeedbackRepairBrief,
  buildParagraphWindowFromRange,
  resolveSelectedProseRange,
  splitParagraphRanges,
  type SelectedProseRange,
} from "./selectionRange";

export function ChapterReader({
  novelId,
  chapter,
  characters,
  onCharacter,
  onChapter,
  chapters,
  generation = null,
  followGeneration = false,
  readingDisplay,
  onReadingDisplayChange,
  onEdit,
  canInlineEdit = false,
  onInlineSaved,
  onInlineEditingChange,
}: {
  novelId: string;
  chapter: WorkspaceChapter;
  characters: WorkspaceBook["materials"]["characters"];
  onCharacter: (id: string) => void;
  onChapter: (id: string) => void;
  chapters: WorkspaceChapter[];
  generation?: DirectorGenerationSnapshot | null;
  followGeneration?: boolean;
  readingDisplay: ReadingDisplayPreferences;
  onReadingDisplayChange: (next: ReadingDisplayPreferences) => void;
  onEdit?: (chapterId: string) => void;
  canInlineEdit?: boolean;
  onInlineSaved?: (chapterId: string) => Promise<void> | void;
  onInlineEditingChange?: (active: boolean) => void;
}) {
  // Keep the opened edition while polling. Updating prose is an explicit reader action.
  const queryClient = useQueryClient();
  const [edition, setEdition] = useState(chapter);
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(chapter.title);
  const [draftContent, setDraftContent] = useState(chapter.content ?? "");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lockError, setLockError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<SelectedProseRange | null>(null);
  const [issueTags, setIssueTags] = useState<HumanStyleIssueTag[]>([]);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [selectionCandidates, setSelectionCandidates] = useState<ChapterEditorCandidate[]>([]);
  const [activeCandidateId, setActiveCandidateId] = useState<string | null>(null);
  const [macroAlignmentNote, setMacroAlignmentNote] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [selectionAnchor, setSelectionAnchor] = useState<{ top: number; placement: "below" | "above" } | null>(null);
  const [showRulesDrawer, setShowRulesDrawer] = useState(false);
  const proseContainerRef = useRef<HTMLDivElement>(null);
  const proseRef = useRef<HTMLDivElement>(null);
  const feedbackPanelRef = useRef<HTMLDivElement>(null);
  const interactingWithFeedbackPanelRef = useRef(false);

  const isPreview = novelId === "preview";
  const feedbackQuery = useQuery({
    queryKey: ["directorBookHumanFeedback", novelId],
    queryFn: () => getNovelHumanStyleFeedback(novelId),
    enabled: !isPreview && Boolean(novelId),
    retry: false,
  });

  useEffect(() => {
    if (followGeneration && !isEditing) setEdition(chapter);
  }, [chapter, followGeneration, isEditing]);

  useEffect(() => {
    onInlineEditingChange?.(isEditing);
    return () => {
      if (isEditing) onInlineEditingChange?.(false);
    };
  }, [isEditing, onInlineEditingChange]);

  const live = followGeneration && generation?.chapterId === chapter.id ? generation : null;
  const isWriting = live?.state === "writing";
  const content = live?.content ?? edition.content;
  const paragraphs = useMemo(() => (content ? splitParagraphRanges(content) : []), [content]);
  const changed = !followGeneration && (edition.updatedAt !== chapter.updatedAt || edition.content !== chapter.content);
  const provenance = resolveWorkspaceChapterProvenance(edition);
  const provenanceText = provenanceLabel(provenance);
  const isLocked = provenance === "human_locked";
  const dirty = isEditing && (draftTitle.trim() !== edition.title.trim() || draftContent !== (edition.content ?? ""));

  function clearSelectionFeedback() {
    setSelectedRange(null);
    setSelectionAnchor(null);
    setIssueTags([]);
    setFeedbackNote("");
    setSelectionCandidates([]);
    setActiveCandidateId(null);
    setMacroAlignmentNote(null);
    setSelectionError(null);
  }

  function computeSelectionAnchor(range: Range): { top: number; placement: "below" | "above" } {
    const container = proseContainerRef.current;
    if (!container) {
      return { top: 8, placement: "below" };
    }
    const rect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const viewport = container.closest<HTMLElement>("[data-chapter-scroll-viewport]");
    const viewportBottom = viewport ? viewport.getBoundingClientRect().bottom : window.innerHeight;
    const viewportTop = viewport ? viewport.getBoundingClientRect().top : 0;
    const spaceBelow = viewportBottom - rect.bottom;
    const spaceAbove = rect.top - viewportTop;
    if (spaceBelow < 260 && spaceAbove > spaceBelow) {
      return {
        top: Math.max(8, rect.top - containerRect.top - 8),
        placement: "above",
      };
    }
    return {
      top: Math.max(8, rect.bottom - containerRect.top + 8),
      placement: "below",
    };
  }

  function syncProseSelection(clearWhenEmpty: boolean) {
    if (isEditing || isWriting || isPreview || !edition.content) return;
    if (selectionRewriteMutation.isPending || applyCandidateMutation.isPending || recordFeedbackMutation.isPending) return;
    if (selectionCandidates.length > 0) return;
    const domSelection = window.getSelection();
    const nextRange = resolveSelectedProseRange(
      proseRef.current,
      edition.content,
      paragraphs,
      domSelection,
    );
    if (nextRange && domSelection && domSelection.rangeCount > 0) {
      setSelectedRange(nextRange);
      setSelectionAnchor(computeSelectionAnchor(domSelection.getRangeAt(0)));
      setSelectionError(null);
      return;
    }
    if (clearWhenEmpty) {
      clearSelectionFeedback();
    }
  }

  function handleProseSelectionCapture() {
    syncProseSelection(true);
  }

  const tail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (live?.state !== "writing" || !tail.current) return;
    const viewport = tail.current.closest<HTMLElement>("[data-chapter-scroll-viewport]");
    if (!viewport) return;
    // Follow only within the reader; scrollIntoView also moves outer page containers.
    viewport.scrollTop += Math.max(0, tail.current.getBoundingClientRect().bottom - viewport.getBoundingClientRect().bottom);
  }, [live?.executionId, live?.revision]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedTitle = draftTitle.trim();
      if (!trimmedTitle) {
        throw new Error("章节标题不能为空。");
      }
      const titleChanged = trimmedTitle !== edition.title;
      const payload = titleChanged
        ? { title: trimmedTitle, content: draftContent, expectedUpdatedAt: edition.updatedAt }
        : { content: draftContent, expectedContent: edition.content ?? "", expectedUpdatedAt: edition.updatedAt };
      return updateNovelChapter(novelId, edition.id, payload);
    },
    onSuccess: async (response) => {
      const saved = response.data;
      if (saved) {
        const savedText = saved.content?.trim() ? saved.content : null;
        setEdition((prev) => ({
          ...prev,
          title: saved.title ?? draftTitle.trim(),
          content: savedText,
          wordCount: savedText ? Array.from(savedText.trim()).length : 0,
          updatedAt: saved.updatedAt ?? prev.updatedAt,
          authorProvenance: saved.authorProvenance ?? (prev.authorProvenance === "human_locked" ? "human_locked" : "human_edited"),
          humanEditedAt: saved.humanEditedAt ?? prev.humanEditedAt,
        }));
      }
      setSaveError(null);
      setConfirmCancel(false);
      setIsEditing(false);
      setSavedNotice("已保存修改，本章已标记为“人工修订”。");
      await onInlineSaved?.(edition.id);
    },
    onError: (error) => {
      setSaveError(error instanceof Error ? error.message : "保存章节失败，请稍后重试。");
    },
  });

  const lockMutation = useMutation({
    mutationFn: (locked: boolean) => setNovelChapterProvenance(novelId, edition.id, {
      locked,
      expectedUpdatedAt: edition.updatedAt,
    }),
    onSuccess: async (response, locked) => {
      const updated = response.data;
      setLockError(null);
      setSavedNotice(locked ? "已锁定定稿，自动创作不会改写本章。" : "已解除锁定，可继续修改本章正文。");
      setEdition((prev) => ({
        ...prev,
        updatedAt: updated?.updatedAt ?? prev.updatedAt,
        authorProvenance: updated?.authorProvenance ?? (locked ? "human_locked" : prev.humanEditedAt ? "human_edited" : "ai_generated"),
      }));
      await onInlineSaved?.(edition.id);
    },
    onError: (error) => {
      setLockError(error instanceof Error ? error.message : "调整锁定状态失败，请刷新后重试。");
    },
  });

  const selectionRewriteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRange || !edition.content) {
        throw new Error("请先选中需要改写的正文片段。");
      }
      const contextWindow = buildParagraphWindowFromRange(paragraphs, selectedRange.from, selectedRange.to);
      return previewChapterAiRevision(novelId, edition.id, {
        source: "freeform",
        scope: "selection",
        instruction: buildHumanFeedbackInstruction(issueTags, feedbackNote),
        repairBrief: buildHumanFeedbackRepairBrief(issueTags, feedbackNote),
        contentSnapshot: edition.content,
        selection: selectedRange,
        context: contextWindow,
        constraints: {
          keepFacts: true,
          keepPov: true,
          noUnauthorizedSetting: true,
          preserveCoreInfo: true,
        },
      });
    },
    onSuccess: (response) => {
      const data = response.data;
      if (!data?.candidates?.length) {
        setSelectionError("AI 暂未返回可用候选版本，请稍后重试。");
        return;
      }
      setSelectionError(null);
      setSelectionCandidates(data.candidates);
      setActiveCandidateId(data.activeCandidateId ?? data.candidates[0]?.id ?? null);
      setMacroAlignmentNote(data.macroAlignmentNote ?? null);
    },
    onError: (error) => {
      setSelectionError(error instanceof Error ? error.message : "局部改写请求失败，请稍后重试。");
    },
  });

  const recordFeedbackMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRange) {
        throw new Error("请先选中正文片段再标记。");
      }
      return recordNovelHumanStyleFeedback(novelId, edition.id, {
        excerpt: selectedRange.text,
        issueTags,
        feedbackNote: feedbackNote.trim() || undefined,
      });
    },
    onSuccess: async (response) => {
      const count = response.data?.contrastPairs.length ?? 0;
      clearSelectionFeedback();
      setSavedNotice(`已记入本书写法反例库（当前共 ${count} 条），后续创作与修文会自动避开这类写法。`);
      await queryClient.invalidateQueries({ queryKey: ["directorBookHumanFeedback", novelId] });
    },
    onError: (error) => {
      setSelectionError(error instanceof Error ? error.message : "记录反例失败，请稍后重试。");
    },
  });

  const applyCandidateMutation = useMutation({
    mutationFn: async ({ candidate, saveContrastPair }: { candidate: ChapterEditorCandidate; saveContrastPair: boolean }) => {
      if (!selectedRange || edition.content == null) {
        throw new Error("选区已失效，请重新选中后再试。");
      }
      const nextContent =
        edition.content.slice(0, selectedRange.from)
        + candidate.content
        + edition.content.slice(selectedRange.to);
      const saved = await updateNovelChapter(novelId, edition.id, {
        content: nextContent,
        expectedContent: edition.content,
        expectedUpdatedAt: edition.updatedAt,
      });
      let recordedCount: number | null = null;
      if (saveContrastPair) {
        const recorded = await recordNovelHumanStyleFeedback(novelId, edition.id, {
          excerpt: selectedRange.text,
          preferredText: candidate.content,
          issueTags,
          feedbackNote: feedbackNote.trim() || undefined,
        }).catch(() => null);
        recordedCount = recorded?.data?.contrastPairs.length ?? null;
      }
      return { saved: saved.data, recordedCount };
    },
    onSuccess: async ({ saved, recordedCount }) => {
      if (saved) {
        const savedText = saved.content?.trim() ? saved.content : null;
        setEdition((prev) => ({
          ...prev,
          title: saved.title ?? prev.title,
          content: savedText,
          wordCount: savedText ? Array.from(savedText.trim()).length : 0,
          updatedAt: saved.updatedAt ?? prev.updatedAt,
          authorProvenance: saved.authorProvenance ?? (prev.authorProvenance === "human_locked" ? "human_locked" : "human_edited"),
          humanEditedAt: saved.humanEditedAt ?? prev.humanEditedAt,
        }));
      }
      clearSelectionFeedback();
      setSavedNotice(
        recordedCount != null
          ? `已替换选中片段为“人工修订”，并同步记入本书写法对照（当前共 ${recordedCount} 条）。`
          : "已替换选中片段，本章已标记为“人工修订”。",
      );
      if (recordedCount != null) {
        await queryClient.invalidateQueries({ queryKey: ["directorBookHumanFeedback", novelId] });
      }
      await onInlineSaved?.(edition.id);
    },
    onError: (error) => {
      setSelectionError(error instanceof Error ? error.message : "应用改写失败，请刷新后重试。");
    },
  });

  const removeFeedbackMutation = useMutation({
    mutationFn: (aiPattern: string) => removeNovelHumanStyleFeedback(novelId, aiPattern),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["directorBookHumanFeedback", novelId] });
    },
  });

  useEffect(() => {
    if (isEditing || isWriting || isPreview || !edition.content) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      const insidePanel = Boolean(target && feedbackPanelRef.current?.contains(target));
      interactingWithFeedbackPanelRef.current = insidePanel;
      if (
        !insidePanel
        && target
        && !proseRef.current?.contains(target)
        && selectionCandidates.length === 0
        && !selectionRewriteMutation.isPending
        && !applyCandidateMutation.isPending
        && !recordFeedbackMutation.isPending
      ) {
        clearSelectionFeedback();
      }
    };
    const handleMouseUp = () => {
      if (!feedbackPanelRef.current?.contains(document.activeElement)) {
        interactingWithFeedbackPanelRef.current = false;
      }
    };
    const handleSelectionChange = () => {
      if (
        interactingWithFeedbackPanelRef.current
        || (document.activeElement && feedbackPanelRef.current?.contains(document.activeElement))
      ) {
        return;
      }
      syncProseSelection(true);
    };
    document.addEventListener("mousedown", handleMouseDown, true);
    window.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true);
      window.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [
    isEditing,
    isWriting,
    isPreview,
    edition.content,
    paragraphs,
    selectionCandidates.length,
    selectionRewriteMutation.isPending,
    applyCandidateMutation.isPending,
    recordFeedbackMutation.isPending,
  ]);

  function startInlineEdit() {
    if (!canInlineEdit || isWriting || isLocked) return;
    clearSelectionFeedback();
    setDraftTitle(edition.title);
    setDraftContent(edition.content ?? "");
    setSaveError(null);
    setLockError(null);
    setSavedNotice(null);
    setConfirmCancel(false);
    setIsEditing(true);
  }

  function handleSaveInline() {
    if (!dirty) {
      setIsEditing(false);
      return;
    }
    setSaveError(null);
    saveMutation.mutate();
  }

  function handleRequestCancel() {
    if (dirty) {
      setConfirmCancel(true);
      return;
    }
    setConfirmCancel(false);
    setSaveError(null);
    setIsEditing(false);
  }

  const displayWordCount = isEditing
    ? draftContent.replace(/\s/g, "").length
    : live
      ? live.content.replace(/\s/g, "").length
      : edition.wordCount;
  const index = chapters.findIndex(row => row.id === chapter.id);
  const readingStyle = readingTextStyle(readingDisplay);

  return <article className="mx-auto max-w-[42rem] px-2 pb-10 sm:px-6" aria-label="章节正文">
    <div className="mb-9 space-y-3 border-b border-border/50 pb-6">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tracking-widest text-muted-foreground">
        <span>第 {edition.order} 章 · {displayWordCount.toLocaleString()} 字</span>
        {provenanceText ? (
          <>
            <span aria-hidden="true">·</span>
            <span
              title={provenanceHint(provenance) ?? undefined}
              className={isLocked ? "inline-flex items-center gap-1 font-medium text-primary" : "text-foreground/75"}
            >
              {isLocked ? <Lock aria-hidden="true" className="size-3" /> : null}
              {provenanceText}
            </span>
          </>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!isEditing ? <h2 className="min-w-0 text-2xl font-semibold tracking-wide">{edition.title}</h2> : <span className="text-xs font-medium text-muted-foreground">正在直接编辑本章</span>}
        <div className="flex flex-wrap items-center gap-2">
          {isEditing ? (
            <>
              <Button size="sm" disabled={!dirty || saveMutation.isPending} onClick={handleSaveInline}>
                {saveMutation.isPending ? "正在保存…" : "保存修改"}
              </Button>
              <Button size="sm" variant="ghost" disabled={saveMutation.isPending} onClick={handleRequestCancel}>
                取消
              </Button>
            </>
          ) : (
            <>
              {canInlineEdit ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isWriting || isLocked || lockMutation.isPending}
                  title={isLocked ? "本章已锁定定稿，请先解除锁定后再修改" : "直接在阅读页修改标题与正文"}
                  onClick={startInlineEdit}
                >
                  <Pencil aria-hidden="true" className="mr-1.5 size-3.5" />
                  直接编辑
                </Button>
              ) : null}
              {canInlineEdit && (content?.trim() || isLocked) ? (
                <Button
                  size="sm"
                  variant={isLocked ? "outline" : "ghost"}
                  disabled={isWriting || lockMutation.isPending}
                  title={isLocked ? "解除定稿锁定后可重新编辑或由 AI 修改" : "锁定为人工定稿，防止自动创作改写本章"}
                  onClick={() => lockMutation.mutate(!isLocked)}
                >
                  {isLocked ? <LockOpen aria-hidden="true" className="mr-1.5 size-3.5" /> : <Lock aria-hidden="true" className="mr-1.5 size-3.5" />}
                  {lockMutation.isPending ? "处理中…" : isLocked ? "解除锁定" : "锁定定稿"}
                </Button>
              ) : null}
              {onEdit ? (
                <Button size="sm" variant="ghost" disabled={isWriting} title="打开完整 AI 精修、差异对比与质量检查" onClick={() => onEdit(chapter.id)}>
                  <Sparkles aria-hidden="true" className="mr-1.5 size-3.5" />
                  编辑正文
                </Button>
              ) : null}
            </>
          )}
          <ReadingDisplaySettings preferences={readingDisplay} onChange={onReadingDisplayChange} previewText={isEditing ? draftContent : content}/>
        </div>
      </div>
      {live ? <p role="status" className="text-xs text-muted-foreground">{live.state === "writing" ? "正在生成正文 · 实时预览" : live.state === "checking" ? "正文生成完成，正在检查与保存" : live.state === "saved" ? "正文已保存" : "生成已中断，请查看导演台的处理提示。正文以保存版为准。"}</p> : null}
      {savedNotice && !isEditing ? <p role="status" className="text-xs text-muted-foreground">{savedNotice}</p> : null}
      {lockError ? <p role="alert" className="bg-destructive/5 px-3 py-2 text-xs text-destructive">{lockError}</p> : null}
      {changed ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status">
          {isEditing ? "后台保存了新版本；继续保存可能触发版本冲突提示。" : "本章有新保存的内容"}
          {!isEditing ? <Button size="sm" variant="outline" onClick={() => { setEdition(chapter); setSavedNotice(null); }}>查看新内容</Button> : null}
        </div>
      ) : null}
      {chapter.qualityDebt ? <div className="space-y-1 bg-muted/40 px-3 py-2 text-sm" role="status">
        <p className="font-medium">正文已保存，仍有待复查事项</p>
        <p className="text-muted-foreground">{chapter.qualityDebt.reason}</p>
        <p className="text-xs text-muted-foreground">可在“编辑正文”中查看问题并使用 AI 检查或修文，或点击“直接编辑”手动调整；后续章节可以继续创作。</p>
      </div> : null}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-2 text-xs text-muted-foreground">快速查看角色</span>
        {characters.map(character => <Button key={character.id} size="sm" variant="ghost" onClick={() => onCharacter(character.id)}>{character.name}</Button>)}
        {characters.length === 0 ? <span className="text-xs text-muted-foreground">暂无角色资料</span> : null}
        {!isPreview && (feedbackQuery.data?.data?.contrastPairs.length ?? 0) > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-xs text-muted-foreground"
            onClick={() => setShowRulesDrawer((open) => !open)}
          >
            <BookMarked aria-hidden="true" className="mr-1.5 size-3.5" />
            本书避坑偏好（{feedbackQuery.data!.data!.contrastPairs.length}）
          </Button>
        ) : null}
      </div>
      {!isPreview && showRulesDrawer && feedbackQuery.data?.data ? (
        <BookFeedbackRulesDrawer
          summary={feedbackQuery.data.data}
          removingPattern={removeFeedbackMutation.isPending ? (removeFeedbackMutation.variables ?? null) : null}
          onRemove={(aiPattern) => removeFeedbackMutation.mutate(aiPattern)}
        />
      ) : null}
      {!isEditing && !isWriting && !isPreview && content?.trim() && !selectedRange ? (
        <p className="text-xs text-muted-foreground">提示：在正文里用鼠标划选任意句子或段落，可让 AI 按意见局部重改，或记为本书避坑反例。</p>
      ) : null}
    </div>
    {isEditing ? (
      <InlineChapterBodyEditor
        title={draftTitle}
        content={draftContent}
        readingStyle={readingStyle}
        dirty={dirty}
        saving={saveMutation.isPending}
        confirmCancel={confirmCancel}
        error={saveError}
        onTitleChange={setDraftTitle}
        onContentChange={setDraftContent}
        onSave={handleSaveInline}
        onRequestCancel={handleRequestCancel}
        onConfirmCancel={() => { setConfirmCancel(false); setSaveError(null); setIsEditing(false); }}
        onContinueEditing={() => setConfirmCancel(false)}
      />
    ) : content?.trim() ? (
      <div ref={proseContainerRef} className="relative">
        <div
          ref={proseRef}
          onMouseUp={handleProseSelectionCapture}
          onKeyUp={handleProseSelectionCapture}
          className="space-y-6 leading-[2.15] tracking-wide text-foreground/90"
          style={readingStyle}
        >
          {paragraphs.map((paragraph) => (
            <p
              key={paragraph.index}
              data-paragraph-index={paragraph.index}
              className="whitespace-pre-wrap break-words"
            >
              {paragraph.text}
            </p>
          ))}
          {isWriting ? <span aria-hidden="true" className="inline-block h-5 w-1 animate-pulse bg-primary"/> : null}
        </div>
        {!isEditing && !isWriting && selectedRange ? (
          <div
            ref={feedbackPanelRef}
            style={{
              top: selectionAnchor?.top ?? 8,
              transform: selectionAnchor?.placement === "above" ? "translateY(-100%)" : undefined,
            }}
            className="absolute inset-x-0 z-20 mx-auto max-w-xl"
            onMouseDown={() => { interactingWithFeedbackPanelRef.current = true; }}
          >
            <SelectionFeedbackPanel
              selectedRange={selectedRange}
              issueTags={issueTags}
              feedbackNote={feedbackNote}
              canApplyRewrite={canInlineEdit}
              isLocked={isLocked}
              rewriting={selectionRewriteMutation.isPending}
              recordingFeedback={recordFeedbackMutation.isPending}
              applyingCandidate={applyCandidateMutation.isPending}
              candidates={selectionCandidates}
              activeCandidateId={activeCandidateId}
              macroAlignmentNote={macroAlignmentNote}
              error={selectionError}
              onToggleTag={(tag) => setIssueTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]))}
              onFeedbackNoteChange={setFeedbackNote}
              onClearSelection={() => {
                window.getSelection()?.removeAllRanges();
                clearSelectionFeedback();
              }}
              onRequestRewrite={() => selectionRewriteMutation.mutate()}
              onRecordOnly={() => recordFeedbackMutation.mutate()}
              onSelectCandidate={setActiveCandidateId}
              onApplyCandidate={(candidate, saveContrastPair) => applyCandidateMutation.mutate({ candidate, saveContrastPair })}
              onDismissCandidates={() => {
                setSelectionCandidates([]);
                setActiveCandidateId(null);
                setMacroAlignmentNote(null);
                setSelectionError(null);
              }}
            />
          </div>
        ) : null}
      </div>
    ) : isWriting ? (
      <p className="py-16 text-center text-sm text-muted-foreground">正在准备正文输出…</p>
    ) : (
      <div className="py-16 text-center space-y-3">
        <p className="text-lg font-medium">这一章等待写作</p>
        <p className="text-sm text-muted-foreground">正文保存后可在这里阅读。你可以先查看故事规划和角色资料，也可以直接动手写。</p>
        {canInlineEdit && !isLocked ? (
          <Button size="sm" variant="outline" onClick={startInlineEdit}>开始直接写作</Button>
        ) : null}
      </div>
    )}
    <div ref={tail}/>
    <footer className="mt-12 flex justify-between gap-3 border-t border-border/50 pt-5">
      <Button variant="ghost" disabled={index <= 0 || isEditing} onClick={() => onChapter(chapters[index - 1].id)}>上一章</Button>
      <Button variant="ghost" disabled={index < 0 || index >= chapters.length - 1 || isEditing} onClick={() => onChapter(chapters[index + 1].id)}>下一章</Button>
    </footer>
  </article>;
}
