import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { Chapter, ChapterEditorDiagnosticCard, ChapterEditorWorkspaceResponse } from "@ai-novel/shared/types/novel";
import { Button } from "@/components/ui/button";

interface ChapterEditorSidebarProps {
  chapter: Chapter;
  workspace: ChapterEditorWorkspaceResponse | null;
  workspaceStatus: "loading" | "ready" | "error";
  wordCount: number;
  saveStatusLabel: string;
  isDirty: boolean;
  isSaving: boolean;
  selectedDiagnosticId: string | null;
  onBack?: () => void;
  onOpenVersionHistory?: () => void;
  onSave: () => void;
  onFocusDiagnostic: (card: ChapterEditorDiagnosticCard) => void;
  onRunDiagnostic: (card: ChapterEditorDiagnosticCard) => void;
}

function MetaChip(props: { label: string }) {
  return (
    <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
      {props.label}
    </span>
  );
}

function LoadingBar(props: { widthClassName?: string }) {
  return (
    <div className={`h-3 animate-pulse rounded-full bg-muted ${props.widthClassName ?? "w-full"}`} />
  );
}

export default function ChapterEditorSidebar(props: ChapterEditorSidebarProps) {
  const {
    chapter,
    workspace,
    workspaceStatus,
    wordCount,
    saveStatusLabel,
    isDirty,
    isSaving,
    selectedDiagnosticId,
    onBack,
    onOpenVersionHistory,
    onSave,
    onFocusDiagnostic,
    onRunDiagnostic,
  } = props;

  const recommendedTask = workspace?.recommendedTask ?? null;
  const macroContext = workspace?.macroContext ?? null;
  const isWorkspaceLoading = workspaceStatus === "loading";
  const isWorkspaceError = workspaceStatus === "error";

  return (
    <div className="min-h-0 overflow-hidden">
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        <div className="shrink-0 rounded-3xl border border-border/70 bg-background p-4 shadow-sm">
          <div className="flex flex-col gap-4">
            {onBack ? (
              <div>
                <Button size="sm" variant="outline" onClick={onBack}>
                  返回章节执行页
                </Button>
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="text-lg font-semibold leading-7 text-foreground">
                第 {chapter.order} 章 · {chapter.title?.trim() || t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.gen_db55d102")}
              </div>

              <div className="flex flex-wrap gap-2">
                <MetaChip label={`${wordCount} 字`} />
                <MetaChip label={saveStatusLabel} />
                <MetaChip label={isWorkspaceLoading ? t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.gen_LLM分析中_rwti") : `问题 ${workspace?.chapterMeta.openIssueCount ?? 0}`} />
              </div>

              {isWorkspaceLoading ? (
                <div className="space-y-2 pt-1">
                  <LoadingBar widthClassName="w-full" />
                  <LoadingBar widthClassName="w-4/5" />
                </div>
              ) : workspace?.chapterMeta.styleSummary ? (
                <div className="text-sm leading-6 text-muted-foreground">
                  当前写法资产：{workspace.chapterMeta.styleSummary}
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-2">
              <Button
                size="sm"
                onClick={onSave}
                disabled={!isDirty || isSaving}
                className="w-full"
              >
                {isSaving ? t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.savingInProgressDotDotDot") : t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.save")}
              </Button>
              {onOpenVersionHistory ? (
                <Button size="sm" variant="outline" onClick={onOpenVersionHistory} className="w-full">
                  版本入口
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="shrink-0 rounded-3xl border border-border/70 bg-background p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.gen_ba318561")}</div>
            <span className="text-xs text-muted-foreground">
              {isWorkspaceLoading ? t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.aiAnalyzing") : workspace?.refreshReason ?? t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.gen_777439b5")}
            </span>
          </div>

          {isWorkspaceLoading ? (
            <div className="space-y-4 text-sm leading-6 text-muted-foreground">
              <div>{t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.aiAnalyzingChapterPlacement")}</div>
              <div className="space-y-3">
                <LoadingBar widthClassName="w-2/3" />
                <LoadingBar widthClassName="w-full" />
                <LoadingBar widthClassName="w-5/6" />
                <LoadingBar widthClassName="w-4/5" />
              </div>
            </div>
          ) : macroContext ? (
            <div className="space-y-4 text-sm leading-6">
              <div>
                <div className="mb-1 font-medium text-foreground">{t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.gen_f282ce0b")}</div>
                <div className="text-muted-foreground">
                  {macroContext.volumeTitle} · {macroContext.volumePositionLabel} · {macroContext.volumePhaseLabel}
                </div>
              </div>
              <div>
                <div className="mb-1 font-medium text-foreground">{t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.gen_2fedd0cf")}</div>
                <div className="text-muted-foreground">{macroContext.paceDirective}</div>
              </div>
              <div>
                <div className="mb-1 font-medium text-foreground">{t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.gen_d6a9f548")}</div>
                <div className="text-muted-foreground">{macroContext.chapterMission}</div>
              </div>
              <div>
                <div className="mb-1 font-medium text-foreground">{t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.gen_d572b319")}</div>
                <div className="space-y-2 text-muted-foreground">
                  <div>{t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.gen_b874224b")}</div>
                  <div>{t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.gen_04959dd5")}</div>
                </div>
              </div>
            </div>
          ) : isWorkspaceError ? (
            <div className="text-sm leading-6 text-muted-foreground">
              宏观定位暂时加载失败，你仍然可以先编辑正文或在右侧直接发起 AI 修正。
            </div>
          ) : (
            <div className="text-sm leading-6 text-muted-foreground">
              正在准备本章的卷内定位和节奏建议。
            </div>
          )}
        </div>

        <div className="min-h-0 shrink-0 rounded-3xl border border-border/70 bg-background p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.gen_6599e592")}</div>
            <span className="text-xs text-muted-foreground">
              {isWorkspaceLoading
                ? t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.aiOrganizing")
                : recommendedTask
                  ? `当前推荐：${recommendedTask.title}`
                  : t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.gen_f9c5b025")}
            </span>
          </div>

          <div className="space-y-3">
            {isWorkspaceLoading ? (
              <>
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-4 text-sm leading-6 text-muted-foreground">
                  AI 正在按章节问题、卷内位置和节奏目标梳理优先修正项，请稍候。
                </div>
                {[0, 1].map((item) => (
                  <div key={item} className="rounded-2xl border border-border/70 bg-muted/10 p-3">
                    <div className="space-y-3">
                      <LoadingBar widthClassName="w-2/5" />
                      <LoadingBar widthClassName="w-1/3" />
                      <LoadingBar widthClassName="w-full" />
                      <LoadingBar widthClassName="w-5/6" />
                      <div className="flex gap-2 pt-1">
                        <div className="h-8 w-24 animate-pulse rounded-full bg-muted" />
                        <div className="h-8 w-32 animate-pulse rounded-full bg-muted" />
                      </div>
                    </div>
                  </div>
                ))}
              </>
            ) : workspace && workspace.diagnosticCards.length > 0 ? workspace.diagnosticCards.map((card) => {
              const isSelected = selectedDiagnosticId === card.id;
              const isRecommended = recommendedTask?.title === card.title && recommendedTask.recommendedAction === card.recommendedAction;
              return (
                <div
                  key={card.id}
                  className={`rounded-2xl border p-3 transition ${
                    isSelected
                      ? "border-sky-300 bg-sky-50/70"
                      : isRecommended
                        ? "border-emerald-200 bg-emerald-50/60"
                        : "border-border/70 bg-muted/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">{card.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {card.paragraphLabel || t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.gen_d8766580")} · {card.severity}
                      </div>
                    </div>
                    {isRecommended ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] text-emerald-800">
                        推荐先修
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 text-sm leading-6 text-muted-foreground">{card.problemSummary}</div>
                  <div className="mt-2 text-sm leading-6 text-foreground/80">{card.whyItMatters}</div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={isSelected ? "default" : "outline"}
                      onClick={() => onFocusDiagnostic(card)}
                    >
                      {isSelected ? t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.gen_ed62f56e") : t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.gen_a8a96e49")}
                    </Button>
                    <Button size="sm" onClick={() => onRunDiagnostic(card)}>
                      直接用 AI 处理
                    </Button>
                  </div>
                </div>
              );
            }) : (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 p-4 text-sm leading-6 text-muted-foreground">
                {isWorkspaceError
                  ? t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.gen_d275646c")
                  : workspace
                  ? t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.aiNoClearIssuesYet")
                  : t("gen.pages.novels.components.chapterEditor.ChapterEditorSidebar.gen_8cae5a0f")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
