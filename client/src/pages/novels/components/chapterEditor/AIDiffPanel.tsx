import type { ChapterEditorCandidate } from "@ai-novel/shared/types/novel";
import { Button } from "@/components/ui/button";
import type { ChapterEditorSessionState } from "./chapterEditorTypes";

interface AIDiffPanelProps {
  session: ChapterEditorSessionState;
  activeCandidate: ChapterEditorCandidate | null;
  isApplying: boolean;
  onSelectCandidate: (candidateId: string) => void;
  onChangeViewMode: (mode: "inline" | "block") => void;
  onAccept: () => void;
  onReject: () => void;
  onRegenerate: () => void;
}

function renderBlockDiff(candidate: ChapterEditorCandidate | null, originalText: string) {
  if (!candidate) {
    return null;
  }
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/15 p-3">
        <div className="text-xs font-medium text-muted-foreground">原文</div>
        <div className="whitespace-pre-wrap text-sm leading-7 text-foreground">{originalText}</div>
      </div>
      <div className="space-y-2 rounded-2xl border border-border/70 bg-emerald-50/50 p-3">
        <div className="text-xs font-medium text-muted-foreground">候选版本</div>
        <div className="whitespace-pre-wrap text-sm leading-7 text-foreground">{candidate.content}</div>
      </div>
    </div>
  );
}

export default function AIDiffPanel(props: AIDiffPanelProps) {
  const {
    session,
    activeCandidate,
    isApplying,
    onSelectCandidate,
    onChangeViewMode,
    onAccept,
    onReject,
    onRegenerate,
  } = props;

  return (
    <div className="flex h-full flex-col rounded-3xl border border-border/70 bg-background shadow-sm">
      <div className="space-y-3 border-b border-border/70 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">AI 改写结果</div>
            <div className="text-xs text-muted-foreground">
              {session.status === "loading"
                ? "正在生成候选版本"
                : session.status === "error"
                  ? session.errorMessage || "生成失败"
                  : session.operationLabel || "查看待确认改写"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={session.viewMode === "inline" ? "default" : "outline"}
              onClick={() => onChangeViewMode("inline")}
            >
              沉浸视图
            </Button>
            <Button
              size="sm"
              variant={session.viewMode === "block" ? "default" : "outline"}
              onClick={() => onChangeViewMode("block")}
            >
              对比视图
            </Button>
          </div>
        </div>

        {session.status === "ready" ? (
          <div className="flex flex-wrap gap-2">
            {session.candidates.map((candidate) => (
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
        ) : null}
      </div>

      <div className="flex-1 space-y-4 overflow-auto px-4 py-4">
        {session.status === "loading" ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-4 text-sm text-muted-foreground">
            正在基于选中文本生成 2 到 3 个候选版本，请稍候。
          </div>
        ) : null}

        {session.status === "error" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            {session.errorMessage || "候选生成失败，请重试。"}
          </div>
        ) : null}

        {session.status === "ready" && activeCandidate ? (
          <>
            <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/10 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-foreground">{activeCandidate.label}</div>
                {activeCandidate.semanticTags && activeCandidate.semanticTags.length > 0 ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    {activeCandidate.semanticTags.map((tag) => (
                      <span key={tag} className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              {activeCandidate.summary ? (
                <div className="text-sm leading-6 text-muted-foreground">{activeCandidate.summary}</div>
              ) : null}
            </div>

            {session.viewMode === "block"
              ? renderBlockDiff(activeCandidate, session.targetRange.text)
              : (
                <div className="rounded-2xl border border-border/70 bg-muted/10 p-3 text-xs leading-6 text-muted-foreground">
                  当前正文区域正在显示行内 diff，便于直接判断是否采纳。
                </div>
              )}
          </>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/70 px-4 py-4">
        <Button size="sm" variant="outline" onClick={onReject} disabled={session.status === "loading" || isApplying}>
          拒绝全部
        </Button>
        <Button size="sm" variant="outline" onClick={onRegenerate} disabled={session.status === "loading" || isApplying}>
          再生成
        </Button>
        <Button size="sm" onClick={onAccept} disabled={session.status !== "ready" || !activeCandidate || isApplying}>
          {isApplying ? "应用中..." : "接受全部"}
        </Button>
      </div>
    </div>
  );
}
