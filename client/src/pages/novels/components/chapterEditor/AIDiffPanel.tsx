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

  const isIdle = session.status === "idle";
  const statusText = isIdle
    ? "选中正文后可发起局部 AI 改写"
    : session.status === "loading"
      ? "正在生成候选版本"
      : session.status === "error"
        ? session.errorMessage || "生成失败"
        : session.operationLabel || "查看待确认改写";

  return (
    <div className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-3xl border border-border/70 bg-background shadow-sm xl:min-h-0">
      <div className="shrink-0 space-y-3 border-b border-border/70 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">AI 改写结果</div>
            <div className="text-xs text-muted-foreground">{statusText}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={session.viewMode === "block" ? "default" : "outline"}
              onClick={() => onChangeViewMode("block")}
              disabled={isIdle}
            >
              段落对比
            </Button>
            <Button
              size="sm"
              variant={session.viewMode === "inline" ? "default" : "outline"}
              onClick={() => onChangeViewMode("inline")}
              disabled={isIdle}
            >
              细节标记
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

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {isIdle ? (
          <>
            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-4 text-sm leading-6 text-muted-foreground">
              右侧结果面板已固定保留。你可以先在正文中选中一段，再从浮动工具条发起“优化表达、扩写、精简、强化情绪、强化冲突或自定义指令”。
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
              <div className="text-sm font-medium text-foreground">等待改写</div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                发起改写后，这里会展示 2 到 3 个候选版本、改写摘要和段落对比。
              </div>
            </div>
          </>
        ) : null}

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

            {session.viewMode === "block" ? (
              <div className="rounded-2xl border border-border/70 bg-muted/10 p-3 text-sm leading-6 text-muted-foreground">
                中间正文区正在显示段落 patch 对比。原文会以淡红块保留，改写会以浅绿块落在同一位置，便于按小说阅读顺序直接判断是否采纳。
              </div>
            ) : (
              <div className="rounded-2xl border border-border/70 bg-muted/10 p-3 text-sm leading-6 text-muted-foreground">
                中间正文区正在显示细节标记 diff，适合确认具体删改位置；如果更想顺着小说去读，切回“段落对比”会更轻松。
              </div>
            )}
          </>
        ) : null}
      </div>

      <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 border-t border-border/70 px-4 py-4">
        <Button size="sm" variant="outline" onClick={onReject} disabled={isIdle || session.status === "loading" || isApplying}>
          拒绝全部
        </Button>
        <Button size="sm" variant="outline" onClick={onRegenerate} disabled={isIdle || session.status === "loading" || isApplying}>
          再生成
        </Button>
        <Button size="sm" onClick={onAccept} disabled={session.status !== "ready" || !activeCandidate || isApplying}>
          {isApplying ? "应用中..." : "接受全部"}
        </Button>
      </div>
    </div>
  );
}
