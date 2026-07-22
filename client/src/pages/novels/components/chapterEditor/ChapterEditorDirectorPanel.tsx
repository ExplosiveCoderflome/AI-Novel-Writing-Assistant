import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type {
  ChapterEditorCandidate,
  ChapterEditorDiagnosticCard,
  ChapterEditorRevisionScope,
  ChapterEditorWorkspaceResponse,
} from "@ai-novel/shared/types/novel";
import { Button } from "@/components/ui/button";
import type { ChapterEditorSessionState } from "./chapterEditorTypes";

interface ChapterEditorDirectorPanelProps {
  workspace: ChapterEditorWorkspaceResponse | null;
  workspaceStatus: "loading" | "ready" | "error";
  selectedDiagnosticCard: ChapterEditorDiagnosticCard | null;
  session: ChapterEditorSessionState;
  activeCandidate: ChapterEditorCandidate | null;
  revisionScope: ChapterEditorRevisionScope;
  revisionInstruction: string;
  canRunSelectionRevision: boolean;
  currentTargetDescription: string;
  isGenerating: boolean;
  isApplying: boolean;
  onInstructionChange: (next: string) => void;
  onScopeChange: (scope: ChapterEditorRevisionScope) => void;
  onRunRecommended: () => void;
  onRunSelectedDiagnostic: () => void;
  onRunFreeform: () => void;
  onSelectCandidate: (candidateId: string) => void;
  onChangeViewMode: (mode: "inline" | "block") => void;
  onAccept: () => void;
  onReject: () => void;
  onRegenerate: () => void;
}

function LoadingBar(props: { widthClassName?: string; heightClassName?: string }) {
  return (
    <div className={`${props.heightClassName ?? "h-3"} animate-pulse rounded-full bg-muted ${props.widthClassName ?? "w-full"}`} />
  );
}

export default function ChapterEditorDirectorPanel(props: ChapterEditorDirectorPanelProps) {
  const {
    workspace,
    workspaceStatus,
    selectedDiagnosticCard,
    session,
    activeCandidate,
    revisionScope,
    revisionInstruction,
    canRunSelectionRevision,
    currentTargetDescription,
    isGenerating,
    isApplying,
    onInstructionChange,
    onScopeChange,
    onRunRecommended,
    onRunSelectedDiagnostic,
    onRunFreeform,
    onSelectCandidate,
    onChangeViewMode,
    onAccept,
    onReject,
    onRegenerate,
  } = props;

  const isIdle = session.status === "idle";
  const recommendedTask = workspace?.recommendedTask ?? null;
  const isWorkspaceLoading = workspaceStatus === "loading";
  const statusText = isIdle
    ? isWorkspaceLoading
      ? t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.aiAnalyzingMacroPositionAndTasks")
      : t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.aiConsiderChapterPositionInVolume")
    : session.status === "loading"
      ? session.requestLabel || t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.gen_4ff96754")
      : session.status === "error"
        ? session.errorMessage || t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.gen_7f7de8a2")
        : session.resolvedIntent?.reasoningSummary || t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.gen_2c1db253");

  return (
    <div className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-3xl border border-border/70 bg-background shadow-sm xl:min-h-0">
      <div className="shrink-0 space-y-3 border-b border-border/70 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.aiCorrectDirectorPanel")}</div>
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

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={revisionScope === "selection" ? "default" : "outline"}
            onClick={() => onScopeChange("selection")}
          >
            片段模式
          </Button>
          <Button
            size="sm"
            variant={revisionScope === "chapter" ? "default" : "outline"}
            onClick={() => onScopeChange("chapter")}
          >
            整章模式
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {isIdle ? (
          <>
            {isWorkspaceLoading ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-4">
                <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.aiReviewingCurrentChapter")}</div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">
                  正在分析本章在卷中的位置、优先修正任务和可直接处理的片段，你可以稍等几秒再开始。
                </div>
                <div className="mt-4 space-y-3">
                  <LoadingBar widthClassName="w-2/3" />
                  <LoadingBar widthClassName="w-full" />
                  <LoadingBar widthClassName="w-5/6" />
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
              <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.gen_f2a2904e")}</div>
              {isWorkspaceLoading ? (
                <div className="mt-3 space-y-3">
                  <LoadingBar widthClassName="w-1/2" />
                  <LoadingBar widthClassName="w-full" />
                  <LoadingBar widthClassName="w-4/5" />
                  <div className="h-8 w-32 animate-pulse rounded-full bg-muted" />
                </div>
              ) : (
                <>
                  <div className="mt-2 text-sm leading-6 text-muted-foreground">
                    {recommendedTask
                      ? `${recommendedTask.title}。${recommendedTask.summary}`
                      : t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.aiNoRecommendedTask")}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={onRunRecommended} disabled={!recommendedTask || isGenerating}>
                      {isGenerating ? t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.gen_2fb90b05") : t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.gen_99ddac21")}
                    </Button>
                  </div>
                </>
              )}
            </div>

            {selectedDiagnosticCard ? (
              <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
                <div className="text-sm font-medium text-foreground">{selectedDiagnosticCard.title}</div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">
                  {selectedDiagnosticCard.problemSummary}
                </div>
                <div className="mt-2 text-sm leading-6 text-foreground/80">
                  {selectedDiagnosticCard.whyItMatters}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={onRunSelectedDiagnostic}
                    disabled={selectedDiagnosticCard.recommendedScope === "selection" && !canRunSelectionRevision}
                  >
                    直接用 AI 处理这张问题卡
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
              <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.gen_96b8f15f")}</div>
              {isWorkspaceLoading ? (
                <div className="mt-3 space-y-3">
                  <LoadingBar widthClassName="w-1/3" />
                  <div className="min-h-[140px] animate-pulse rounded-2xl border border-border bg-background" />
                  <LoadingBar widthClassName="w-full" />
                  <LoadingBar widthClassName="w-5/6" />
                </div>
              ) : (
                <>
                  <div className="mt-2 text-xs text-muted-foreground">
                    当前目标：{currentTargetDescription}
                  </div>
                  <textarea
                    className="mt-3 min-h-[140px] w-full resize-none rounded-2xl border border-border bg-background px-3 py-3 text-sm outline-none"
                    placeholder={revisionScope === "selection"
                      ? t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.exampleMakeThisPartMorePressuringNotChangePlotDetailAndMakeRhythmTighter")
                      : t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.exampleMakeChapterMorePressuringButNotChangePlotDetailCloserToMiddlePressureStage")}
                    value={revisionInstruction}
                    onChange={(event) => onInstructionChange(event.target.value)}
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      {revisionScope === "selection"
                        ? t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.gen_ec22d4ce")
                        : t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.gen_c0e9328a")}
                    </div>
                    <Button
                      size="sm"
                      onClick={onRunFreeform}
                      disabled={isGenerating || revisionInstruction.trim().length === 0 || (revisionScope === "selection" && !canRunSelectionRevision)}
                    >
                      {isGenerating ? t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.gen_4d020ba3") : t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.gen_ac6f0e0e")}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </>
        ) : null}

        {session.status === "loading" ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-4 text-sm text-muted-foreground">
            AI 正在结合章节宏观定位和你的修改要求生成 2 到 3 个候选版本。
          </div>
        ) : null}

        {session.status === "error" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            {session.errorMessage || t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.gen_319a5871")}
          </div>
        ) : null}

        {session.status === "ready" && activeCandidate ? (
          <>
            <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
              <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.aiUnderstoodRevisionGoal")}</div>
              <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                <div>{t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.gen_e60a3a56")}</div>
                <div>{t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.gen_365c185b")}</div>
                <div>{t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.gen_a33d806e")}</div>
                <div>{t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.gen_6bcaf650")}</div>
                <div>{t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.gen_4aacc342")}</div>
                <div>{t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.gen_9eb70cc8")}</div>
              </div>
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

            <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/10 p-4">
              <div className="text-sm font-medium text-foreground">{activeCandidate.label}</div>
              {activeCandidate.summary ? (
                <div className="text-sm leading-6 text-muted-foreground">{activeCandidate.summary}</div>
              ) : null}
              {activeCandidate.rationale ? (
                <div className="text-sm leading-6 text-foreground/80">{t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.whyChange")}</div>
              ) : null}
              {activeCandidate.riskNotes && activeCandidate.riskNotes.length > 0 ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-3 text-sm leading-6 text-amber-900">
                  需要注意：{activeCandidate.riskNotes.join("；")}
                </div>
              ) : null}
            </div>
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
          {isApplying ? t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.gen_e596edd9") : t("gen.pages.novels.components.chapterEditor.ChapterEditorDirectorPanel.gen_3f8a36ff")}
        </Button>
      </div>
    </div>
  );
}
