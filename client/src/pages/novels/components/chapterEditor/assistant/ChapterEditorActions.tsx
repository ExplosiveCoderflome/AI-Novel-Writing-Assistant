import type { ChapterEditorCursorOperation, ChapterEditorDiagnosticCard, ChapterEditorOperation, ChapterEditorRevisionScope } from "@ai-novel/shared/types/novel";
import { Button } from "@/components/ui/button";
import CursorAIToolbar from "../CursorAIToolbar";
import SelectionAIToolbar from "../SelectionAIToolbar";

export type ChapterEditorActionContext = "diagnostic" | "selection" | "cursor" | "chapter";

export interface ChapterEditorActionsProps {
  actionContext: ChapterEditorActionContext;
  selectedDiagnosticCard: ChapterEditorDiagnosticCard | null;
  cursorTargetDescription: string;
  selectionTargetDescription: string;
  revisionScope: ChapterEditorRevisionScope;
  revisionInstruction: string;
  canRunSelectionRevision: boolean;
  isGenerating: boolean;
  onInstructionChange: (next: string) => void;
  onScopeChange: (scope: ChapterEditorRevisionScope) => void;
  onRunSelectedDiagnostic: () => void;
  onRunFreeform: () => void;
  onRunCursorOperation: (operation: ChapterEditorCursorOperation) => void;
  onRunSelectionOperation: (operation: ChapterEditorOperation) => void;
}

export default function ChapterEditorActions(props: ChapterEditorActionsProps) {
  const { actionContext: context, selectedDiagnosticCard: card, isGenerating } = props;
  const title = context === "diagnostic" ? "修复这个问题" : context === "cursor" ? "在光标处续写"
    : context === "selection" ? "修改选中片段" : "正文修改";
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-medium">{title}</h3>
        <Button size="sm" variant="ghost" disabled={isGenerating} onClick={() => props.onScopeChange(props.revisionScope === "chapter" ? "selection" : "chapter")}>
          {props.revisionScope === "chapter" ? "返回片段" : "修改整章"}
        </Button>
      </div>
      {context === "diagnostic" && card ? (
        <div className="space-y-3 text-sm leading-6">
          <div className="font-medium">{card.title} <span className="ml-2 text-xs font-normal text-muted-foreground">{card.paragraphLabel || "整章"}</span></div>
          <div><div className="text-xs text-muted-foreground">问题在哪里</div><p>{card.problemSummary}</p></div>
          <div><div className="text-xs text-muted-foreground">影响阅读</div><p>{card.whyItMatters}</p></div>
          <div><div className="text-xs text-muted-foreground">准备这样改</div><p>{card.repairApproach || card.repairGoal || "围绕这个问题生成修文方案，保留剧情事实与前后承接。"}</p></div>
          {card.repairGoal ? <p className="text-muted-foreground">目标：{card.repairGoal}</p> : null}
          {card.mustPreserve?.length ? <div className="rounded-lg bg-muted/30 p-3"><div className="text-xs text-muted-foreground">保留这些内容</div><ul className="mt-1 list-inside list-disc">{card.mustPreserve.map((item, index) => <li key={index}>{item}</li>)}</ul></div> : null}
        </div>
      ) : context === "cursor" ? (
        <CursorAIToolbar visible targetLabel={props.cursorTargetDescription} disabled={isGenerating} onRunOperation={props.onRunCursorOperation} />
      ) : context === "selection" ? (
        <SelectionAIToolbar visible targetLabel={props.selectionTargetDescription} disabled={isGenerating} onRunOperation={props.onRunSelectionOperation} />
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">{props.revisionScope === "chapter" ? "修改范围：整章正文。生成后先比较候选，再决定是否采纳。" : "在正文中点击光标或选中片段，也可选择整章修改。"}</p>
      )}
      <div className="space-y-3 border-t border-border/50 pt-4">
        <label htmlFor="chapter-editor-instruction" className="text-sm font-medium">补充要求{context === "diagnostic" || context === "cursor" ? "（可选）" : ""}</label>
        <textarea id="chapter-editor-instruction" aria-label="补充要求" maxLength={800} className="min-h-[100px] w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/30"
          placeholder="例如：保留人物克制的语气，减少重复描写。" value={props.revisionInstruction} onChange={(event) => props.onInstructionChange(event.target.value)} />
        <div className="flex justify-end">
          {context === "diagnostic" ? <Button size="sm" disabled={isGenerating || !card} onClick={props.onRunSelectedDiagnostic}>生成修文方案</Button>
            : context === "cursor" ? <Button size="sm" disabled={isGenerating || !props.revisionInstruction.trim()} onClick={() => props.onRunCursorOperation("continue")}>按要求续写</Button>
              : <Button size="sm" disabled={isGenerating || !props.revisionInstruction.trim() || (props.revisionScope === "selection" && !props.canRunSelectionRevision)} onClick={props.onRunFreeform}>按要求修改</Button>}
        </div>
      </div>
    </div>
  );
}
