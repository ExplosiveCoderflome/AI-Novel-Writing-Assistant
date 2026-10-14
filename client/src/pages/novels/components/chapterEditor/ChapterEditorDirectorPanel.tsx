import type { ChapterEditorCandidate, ChapterEditorWorkspaceResponse } from "@ai-novel/shared/types/novel";
import type { ChapterEditorDiffChange } from "@ai-novel/shared/types/chapterEditor/document";
import { Button } from "@/components/ui/button";
import type { ChapterEditorSessionState } from "./chapterEditorTypes";
import { ChapterEditorActions, type ChapterEditorActionsProps } from "./assistant";

interface ChapterEditorDirectorPanelProps extends ChapterEditorActionsProps {
  workspace: ChapterEditorWorkspaceResponse | null;
  workspaceStatus: "loading" | "ready" | "error";
  session: ChapterEditorSessionState;
  activeCandidate: ChapterEditorCandidate | null;
  diffChanges: ChapterEditorDiffChange[];
  selectedDiffChangeIds: ReadonlySet<string>;
  reviewError?: string | null;
  hasSelectedChanges: boolean;
  isApplying: boolean;
  onSelectCandidate: (candidateId: string) => void;
  onToggleDiffChange: (changeId: string) => void;
  onSelectAllChanges: (selected: boolean) => void;
  onChangeViewMode: (mode: "inline" | "block") => void;
  onAccept: () => void;
  onReject: () => void;
  onRegenerate: () => void;
}

export default function ChapterEditorDirectorPanel(props: ChapterEditorDirectorPanelProps) {
  const { session, activeCandidate, diffChanges, selectedDiffChangeIds, reviewError, hasSelectedChanges, isApplying,
    onSelectCandidate, onToggleDiffChange, onSelectAllChanges, onChangeViewMode, onAccept, onReject, onRegenerate } = props;
  const isIdle = session.status === "idle";
  const selectedDiffCount = diffChanges.filter(change => selectedDiffChangeIds.has(change.id)).length;
  return (
    <div className="flex min-h-0 flex-col overflow-hidden bg-background xl:h-full">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="text-sm font-medium">AI 修改与续写</div>
        {!isIdle ? <div className="flex gap-2">
          <Button size="sm" variant={session.viewMode === "block" ? "default" : "outline"} onClick={() => onChangeViewMode("block")}>段落对比</Button>
          <Button size="sm" variant={session.viewMode === "inline" ? "default" : "outline"} onClick={() => onChangeViewMode("inline")}>细节标记</Button>
        </div> : null}
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {isIdle ? <>
          {props.workspaceStatus === "loading" ? <p className="text-xs leading-5 text-muted-foreground">AI 正在分析本章问题，你可以继续选段或填写修改要求。</p> : null}
          <ChapterEditorActions {...props} />
        </> : null}
        {session.status === "loading" ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-4 text-sm text-muted-foreground">
            AI 正在结合章节宏观定位和你的修改要求生成 2 到 3 个候选版本。
          </div>
        ) : null}

        {session.status === "error" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            {session.errorMessage || "候选生成失败，请重试。"}
          </div>
        ) : null}

        {session.status === "ready" && activeCandidate ? (
          <>
            <div className="rounded-xl bg-muted/10 p-4">
              <div className="text-sm font-medium text-foreground">
                {session.mode === "continuation" ? "AI 续写方向" : "AI 理解到的修改目标"}
              </div>
              {session.mode === "continuation" ? (
                <div className="mt-3 text-sm leading-6 text-muted-foreground">
                  光标处将插入一段“{session.continuationOperation === "continue" ? "自然续写" : session.requestLabel?.replace(/^正在生成|方案$/g, "") || "续写"}”。你可以先比较候选，再决定是否写回正文。
                </div>
              ) : (
                <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                  <div>目标：{session.resolvedIntent?.editGoal}</div>
                  <div>语气：{session.resolvedIntent?.toneShift}</div>
                  <div>节奏：{session.resolvedIntent?.paceAdjustment}</div>
                  <div>冲突：{session.resolvedIntent?.conflictAdjustment}</div>
                  <div>情绪：{session.resolvedIntent?.emotionAdjustment}</div>
                  <div>说明：{session.resolvedIntent?.reasoningSummary}</div>
                </div>
              )}
              {session.macroAlignmentNote ? (
                <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 p-3 text-sm leading-6 text-emerald-900">
                  与本章/本卷目标的对齐：{session.macroAlignmentNote}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {session.candidates?.map((candidate) => (
                <Button
                  key={candidate.id}
                  size="sm"
                  variant={candidate.id === session.activeCandidateId ? "default" : "outline"}
                  onClick={() => onSelectCandidate(candidate.id)}
                >
                  {candidate.label}
                </Button>
              ))}
            </div>

            <div className="space-y-2 rounded-xl bg-muted/10 p-4">
              <div className="text-sm font-medium text-foreground">{activeCandidate.label}</div>
              {activeCandidate.summary ? (
                <div className="text-sm leading-6 text-muted-foreground">{activeCandidate.summary}</div>
              ) : null}
              {activeCandidate.rationale ? (
                <div className="text-sm leading-6 text-foreground/80">为什么这样改：{activeCandidate.rationale}</div>
              ) : null}
              {activeCandidate.riskNotes && activeCandidate.riskNotes.length > 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-3 text-sm leading-6 text-amber-900">
                  需要注意：{activeCandidate.riskNotes.join("；")}
                </div>
              ) : null}
            </div>
            {reviewError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-900">
                {reviewError}
              </div>
            ) : null}
            <div className="space-y-3 rounded-xl bg-muted/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">选择要写回正文的改动</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {diffChanges.length > 0
                      ? `已选择 ${selectedDiffCount}/${diffChanges.length} 项，未选择的部分会保留原文。`
                      : "这份候选没有检测到可单独采纳的差异。"}
                  </div>
                </div>
                {diffChanges.length > 0 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onSelectAllChanges(selectedDiffCount !== diffChanges.length)}
                  >
                    {selectedDiffCount === diffChanges.length ? "全部取消" : "全部选择"}
                  </Button>
                ) : null}
              </div>
              {diffChanges.length > 0 ? (
                <div className="space-y-2">
                  {diffChanges.map((change, index) => {
                    const checked = selectedDiffChangeIds.has(change.id);
                    const before = change.originalText.trim() || "（新增内容）";
                    const after = change.candidateText.trim() || "（删除内容）";
                    return (
                      <label
                        key={change.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${checked ? "bg-emerald-50/80" : "bg-background/60 opacity-70"}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 accent-emerald-600"
                          checked={checked}
                          onChange={() => onToggleDiffChange(change.id)}
                        />
                        <span className="min-w-0 flex-1 text-xs leading-5">
                          <span className="font-medium text-foreground">改动 {index + 1} · {change.kind === "replace" ? "替换" : change.kind === "insert" ? "新增" : "删除"}</span>
                          <span className="mt-1 block break-words text-rose-800 line-through">{before}</span>
                          <span className="mt-1 block break-words text-emerald-800">{after}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
      {!isIdle ? (
      <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 border-t border-border/70 px-4 py-4">
        <Button size="sm" variant="outline" onClick={onReject} disabled={isIdle || session.status === "loading" || isApplying}>
          拒绝全部
        </Button>
        <Button size="sm" variant="outline" onClick={onRegenerate} disabled={isIdle || session.status === "loading" || isApplying}>
          再生成
        </Button>
        <Button size="sm" onClick={onAccept} disabled={session.status !== "ready" || !activeCandidate || isApplying || selectedDiffCount === 0 || !hasSelectedChanges}>
          {isApplying ? "保存中..." : session.mode === "continuation" ? (selectedDiffCount === diffChanges.length ? "插入正文" : "插入已选") : selectedDiffCount === diffChanges.length ? "接受全部" : "接受已选"}
        </Button>
      </div>
      ) : null}
    </div>
  );
}
