import type { ChapterEditorDiagnosticCard, ChapterEditorWorkspaceResponse } from "@ai-novel/shared/types/novel";
import { Button } from "@/components/ui/button";
import { findRecommendedDiagnostic } from "./workspaceState";

interface Props {
  workspace: ChapterEditorWorkspaceResponse | null;
  status: "loading" | "ready" | "error";
  selectedId: string | null;
  disabled: boolean;
  isDirty: boolean;
  isResolving: boolean;
  onFocus: (card: ChapterEditorDiagnosticCard) => void;
  onRun: (card: ChapterEditorDiagnosticCard) => void;
  onResolve: (card: ChapterEditorDiagnosticCard) => void;
}

function DiagnosticRow({ card, props }: { card: ChapterEditorDiagnosticCard; props: Props }) {
  const selected = card.id === props.selectedId;
  return (
    <div className={`space-y-3 rounded-xl px-3 py-3 ${selected ? "bg-primary/5 ring-1 ring-primary/20" : "bg-muted/20"}`}>
      <div>
        <div className="text-sm font-medium">{card.title}</div>
        <div className="mt-1 text-xs text-muted-foreground">{card.paragraphLabel || "整章"}</div>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{card.problemSummary}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={props.disabled} onClick={() => props.onFocus(card)}>
          {selected ? "取消定位" : "定位到正文"}
        </Button>
        <Button size="sm" disabled={props.disabled} onClick={() => props.onRun(card)}>直接用 AI 处理</Button>
        {card.sourceIssueId ? (
          <Button size="sm" variant="ghost" disabled={props.disabled || props.isDirty || props.isResolving} onClick={() => props.onResolve(card)}>
            {props.isResolving ? "确认中..." : props.isDirty ? "保存后确认已处理" : "确认问题已处理"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export default function ChapterEditorDiagnosticList(props: Props) {
  const { workspace, status } = props;
  const primary = workspace ? findRecommendedDiagnostic(workspace) ?? workspace.diagnosticCards[0] : null;
  const others = workspace?.diagnosticCards.filter((card) => card.id !== primary?.id) ?? [];
  return (
    <div className="space-y-5 border-t border-border/50 pt-5">
      <section aria-label="首要问题" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">首要问题</h3>
          {primary ? <span className="text-xs text-muted-foreground">推荐先处理</span> : null}
        </div>
        {status === "loading" ? (
          <p className="text-sm leading-6 text-muted-foreground">AI 正在结合本章目标梳理问题，你可以继续编辑正文。</p>
        ) : primary ? <DiagnosticRow card={primary} props={props} /> : (
          <p className="text-sm leading-6 text-muted-foreground">
            {status === "error" ? "问题分析暂时失败，你仍可选段修改或填写要求。" : "暂无待处理问题，可继续编辑正文或填写修改要求。"}
          </p>
        )}
      </section>
      {others.length ? (
        <details className="border-t border-border/40 pt-4">
          <summary className="cursor-pointer text-sm text-muted-foreground">其余问题（{others.length}）</summary>
          <div className="mt-3 space-y-3">{others.map((card) => <DiagnosticRow key={card.id} card={card} props={props} />)}</div>
        </details>
      ) : null}
    </div>
  );
}
