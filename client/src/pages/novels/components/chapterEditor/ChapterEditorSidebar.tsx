import type { Chapter, ChapterEditorDiagnosticCard, ChapterEditorWorkspaceResponse } from "@ai-novel/shared/types/novel";
import { Button } from "@/components/ui/button";
import { ChapterEditorDiagnosticList } from "./diagnostics";

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
  backLabel?: string;
  onOpenChapterVersions?: () => void;
  onOpenVersionHistory?: () => void;
  onRefreshWorkspace?: () => void;
  isRefreshingWorkspace?: boolean;
  onSave: () => void;
  onFocusDiagnostic: (card: ChapterEditorDiagnosticCard) => void;
  onRunDiagnostic: (card: ChapterEditorDiagnosticCard) => void;
  onResolveDiagnostic: (card: ChapterEditorDiagnosticCard) => void;
  isResolvingDiagnostic?: boolean;
  diagnosticsDisabled?: boolean;
}

function MetaChip({ label }: { label: string }) {
  return <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{label}</span>;
}

export default function ChapterEditorSidebar(props: ChapterEditorSidebarProps) {
  const { chapter, workspace } = props;
  const macro = workspace?.macroContext;
  const loading = props.workspaceStatus === "loading";
  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto px-3 py-2">
      <section className="space-y-4">
        {props.onBack ? <Button size="sm" variant="outline" onClick={props.onBack}>{props.backLabel ?? "返回章节执行页"}</Button> : null}
        <h2 className="text-lg font-semibold leading-7">第 {chapter.order} 章 · {chapter.title?.trim() || "未命名章节"}</h2>
        <div className="flex flex-wrap gap-2">
          <MetaChip label={props.wordCount + " 字"} />
          <MetaChip label={props.saveStatusLabel} />
          <MetaChip label={loading ? "AI 分析中" : "待处理 " + (workspace?.diagnosticCards.length ?? 0) + " 项"} />
        </div>
        <div className="grid gap-2">
          <Button size="sm" onClick={props.onSave} disabled={!props.isDirty || props.isSaving} title="保存正文（Ctrl/Cmd+S）" aria-keyshortcuts="Control+S Meta+S">
            {props.isSaving ? "保存中..." : "保存 · Ctrl/Cmd+S"}
          </Button>
          {props.onOpenChapterVersions ? <Button size="sm" variant="outline" onClick={props.onOpenChapterVersions}>查看本章版本</Button>
            : props.onOpenVersionHistory ? <Button size="sm" variant="outline" onClick={props.onOpenVersionHistory}>版本入口</Button> : null}
          {props.onRefreshWorkspace ? <Button size="sm" variant="ghost" onClick={props.onRefreshWorkspace} disabled={props.isRefreshingWorkspace || props.diagnosticsDisabled}>
            {props.isRefreshingWorkspace ? "分析中..." : "重新分析本章"}
          </Button> : null}
        </div>
      </section>
      <section className="space-y-3 border-t border-border/50 pt-5">
        <h3 className="text-sm font-medium">本章目标</h3>
        <p className="text-sm leading-6 text-muted-foreground">{macro?.chapterMission || (loading ? "AI 正在梳理本章目标，你可以继续编辑。" : "结合本章正文选择需要修改的位置。")}</p>
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">章节背景与写法</summary>
          <div className="mt-3 space-y-3 text-sm leading-6 text-muted-foreground">
            {macro ? <>
              <div><div className="font-medium text-foreground">卷内位置</div>{macro.volumeTitle} · {macro.volumePositionLabel} · {macro.volumePhaseLabel}</div>
              <div><div className="font-medium text-foreground">节奏建议</div>{macro.paceDirective}</div>
              <div><div className="font-medium text-foreground">前后承接</div><p>上一章：{macro.previousChapterBridge}</p><p>下一章：{macro.nextChapterBridge}</p></div>
            </> : <p>{loading ? "正在分析章节背景。" : "章节背景暂时不可用，可继续手动编辑。"}</p>}
            {workspace?.chapterMeta.styleSummary ? <p>写法：{workspace.chapterMeta.styleSummary}</p> : null}
          </div>
        </details>
      </section>
      <ChapterEditorDiagnosticList workspace={workspace} status={props.workspaceStatus} selectedId={props.selectedDiagnosticId}
        disabled={props.diagnosticsDisabled ?? false} isDirty={props.isDirty} isResolving={props.isResolvingDiagnostic ?? false}
        onFocus={props.onFocusDiagnostic} onRun={props.onRunDiagnostic} onResolve={props.onResolveDiagnostic} />
    </div>
  );
}
