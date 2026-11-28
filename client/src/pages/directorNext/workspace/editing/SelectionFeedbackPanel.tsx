import { useState } from "react";
import { BookmarkPlus, Check, Sparkles, X } from "lucide-react";
import type { ChapterEditorCandidate } from "@ai-novel/shared/types/novel";
import {
  HUMAN_STYLE_ISSUE_TAGS,
  type HumanStyleIssueTag,
} from "@ai-novel/shared/types/styleEngine";
import { Button } from "@/components/ui/button";
import type { SelectedProseRange } from "../selectionRange";

export function SelectionFeedbackPanel({
  selectedRange,
  issueTags,
  feedbackNote,
  canApplyRewrite,
  isLocked,
  rewriting,
  recordingFeedback,
  applyingCandidate,
  candidates,
  activeCandidateId,
  macroAlignmentNote,
  error,
  onToggleTag,
  onFeedbackNoteChange,
  onClearSelection,
  onRequestRewrite,
  onRecordOnly,
  onSelectCandidate,
  onApplyCandidate,
  onDismissCandidates,
}: {
  selectedRange: SelectedProseRange;
  issueTags: HumanStyleIssueTag[];
  feedbackNote: string;
  canApplyRewrite: boolean;
  isLocked: boolean;
  rewriting: boolean;
  recordingFeedback: boolean;
  applyingCandidate: boolean;
  candidates: ChapterEditorCandidate[];
  activeCandidateId: string | null;
  macroAlignmentNote: string | null;
  error: string | null;
  onToggleTag: (tag: HumanStyleIssueTag) => void;
  onFeedbackNoteChange: (note: string) => void;
  onClearSelection: () => void;
  onRequestRewrite: () => void;
  onRecordOnly: () => void;
  onSelectCandidate: (candidateId: string) => void;
  onApplyCandidate: (candidate: ChapterEditorCandidate, saveContrastPair: boolean) => void;
  onDismissCandidates: () => void;
}) {
  const [saveContrastOnApply, setSaveContrastOnApply] = useState(true);
  const hasFeedbackSignal = issueTags.length > 0 || feedbackNote.trim().length > 0;
  const activeCandidate = candidates.find((item) => item.id === activeCandidateId) ?? candidates[0] ?? null;
  const busy = rewriting || recordingFeedback || applyingCandidate;
  const previewQuote = selectedRange.text.trim().replace(/\s+/g, " ");

  return (
    <section
      aria-label="选段标注与 AI 改写"
      className="space-y-3 rounded-lg border border-border/80 bg-popover/95 px-4 py-3 text-sm shadow-lg backdrop-blur-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium text-foreground">已选中 {selectedRange.text.trim().length} 字片段</p>
          <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">“{previewQuote}”</p>
        </div>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onClearSelection} aria-label="清除选区">
          <X className="size-3.5" />
        </Button>
      </div>

      {candidates.length === 0 ? (
        <>
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">哪里不对劲？（可多选，也可直接写意见）</p>
            <div className="flex flex-wrap gap-1.5">
              {HUMAN_STYLE_ISSUE_TAGS.map((tag) => {
                const selected = issueTags.includes(tag.key);
                return (
                  <button
                    key={tag.key}
                    type="button"
                    disabled={busy}
                    title={tag.hint}
                    aria-pressed={selected}
                    onClick={() => onToggleTag(tag.key)}
                    className={
                      selected
                        ? "rounded-md border border-primary/60 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                        : "rounded-md bg-background/70 px-2.5 py-1 text-xs text-muted-foreground hover:bg-background hover:text-foreground"
                    }
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="reader-selection-feedback-note" className="sr-only">给 AI 的修改意见</label>
            <input
              id="reader-selection-feedback-note"
              type="text"
              value={feedbackNote}
              disabled={busy}
              onChange={(event) => onFeedbackNoteChange(event.target.value)}
              placeholder="补充意见（可选）：例如别直接写心情，改成他手上的动作和对话"
              className="w-full rounded-md border border-border/60 bg-background/80 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>

          {error ? <p role="alert" className="bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p> : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={busy || !hasFeedbackSignal || !canApplyRewrite || isLocked}
              title={
                isLocked
                  ? "本章已锁定定稿，解除锁定后可直接改写；也可先点右侧“记为本书反例”"
                  : !hasFeedbackSignal
                    ? "请先点选问题标签或填写一句意见"
                    : "根据你的标记生成局部改写候选"
              }
              onClick={onRequestRewrite}
            >
              <Sparkles aria-hidden="true" className="mr-1.5 size-3.5" />
              {rewriting ? "正在按意见改写…" : "AI 按意见改写这段"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !hasFeedbackSignal}
              title="把这段标为反例记入本书写法偏好，不改动当前章节内容"
              onClick={onRecordOnly}
            >
              <BookmarkPlus aria-hidden="true" className="mr-1.5 size-3.5" />
              {recordingFeedback ? "正在记住偏好…" : "记为本书反例（以后避开）"}
            </Button>
          </div>
          {isLocked ? (
            <p className="text-xs text-muted-foreground">
              当前章节已锁定定稿，仍可先“记为本书反例”供后续章节避开；如需原地替换片段，请先解除锁定。
            </p>
          ) : null}
        </>
      ) : (
        <div className="space-y-3 border-t border-border/50 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {candidates.map((candidate) => {
                const selected = candidate.id === activeCandidate?.id;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    disabled={applyingCandidate}
                    onClick={() => onSelectCandidate(candidate.id)}
                    className={
                      selected
                        ? "rounded-md border border-primary/60 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                        : "rounded-md bg-background/70 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                    }
                  >
                    {candidate.label}
                  </button>
                );
              })}
            </div>
            <Button size="sm" variant="ghost" disabled={applyingCandidate} onClick={onDismissCandidates}>
              保留原文
            </Button>
          </div>

          {activeCandidate ? (
            <div className="space-y-2.5">
              {activeCandidate.rationale ? (
                <p className="text-xs text-muted-foreground">{activeCandidate.rationale}</p>
              ) : null}
              {macroAlignmentNote ? (
                <p className="text-xs text-muted-foreground">衔接提示：{macroAlignmentNote}</p>
              ) : null}
              <div className="space-y-2 bg-background/70 px-3 py-2.5 text-sm leading-7">
                <p className="text-xs line-through text-muted-foreground/80">{selectedRange.text}</p>
                <p className="whitespace-pre-wrap break-words text-foreground">{activeCandidate.content}</p>
              </div>
              {activeCandidate.riskNotes && activeCandidate.riskNotes.length > 0 ? (
                <p className="text-xs text-muted-foreground">注意：{activeCandidate.riskNotes.join("；")}</p>
              ) : null}
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={saveContrastOnApply}
                  disabled={applyingCandidate}
                  onChange={(event) => setSaveContrastOnApply(event.target.checked)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                <span>采用时同步记入本书反例库（让后续章节与修文自动照着改）</span>
              </label>
              {error ? <p role="alert" className="bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p> : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  disabled={applyingCandidate}
                  onClick={() => onApplyCandidate(activeCandidate, saveContrastOnApply)}
                >
                  <Check aria-hidden="true" className="mr-1.5 size-3.5" />
                  {applyingCandidate ? "正在应用修改…" : "采用这个版本"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
