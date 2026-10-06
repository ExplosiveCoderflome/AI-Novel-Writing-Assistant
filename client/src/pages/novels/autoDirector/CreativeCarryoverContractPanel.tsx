import { Link } from "react-router-dom";
import type { CreativeCarryoverContract } from "@ai-novel/shared/types/creativeCarryoverContract";
import { Button } from "@/components/ui/button";

export type CreativeCarryoverPanelState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
    kind: "insufficient";
    bookAnalysisId: string;
    analysisTitle: string;
    missingSectionTitles: string[];
  }
  | { kind: "error"; message: string; hasPrevious: boolean }
  | { kind: "ready"; contract: CreativeCarryoverContract };

interface CreativeCarryoverContractPanelProps {
  modeLabel: string;
  referenceTitle: string;
  state: CreativeCarryoverPanelState;
  onAdopt: () => void;
  onRegenerate: () => void;
  isGenerating: boolean;
}

function TraitColumn(props: { title: string; items: string[] }) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="text-xs font-medium text-muted-foreground">{props.title}</div>
      <ul className="space-y-1.5 text-sm leading-6 text-foreground">
        {props.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function CreativeCarryoverContractPanel({
  modeLabel,
  referenceTitle,
  state,
  onAdopt,
  onRegenerate,
  isGenerating,
}: CreativeCarryoverContractPanelProps) {
  const title = referenceTitle ? `《${referenceTitle}》` : "参考作品";

  return (
    <section className="space-y-3 border-y border-border/60 py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">
            创作承接方案 · {modeLabel}
            {referenceTitle ? ` · ${referenceTitle}` : ""}
          </div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            先看清原书特点、本书怎么实现，以及前三章往哪走，再决定是否采用。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {state.kind === "ready" && !state.contract.adopted ? (
            <Button type="button" size="sm" onClick={onAdopt} disabled={isGenerating}>
              采用推荐方案
            </Button>
          ) : null}
          {state.kind === "ready" || state.kind === "error" ? (
            <Button type="button" size="sm" variant="ghost" onClick={onRegenerate} disabled={isGenerating}>
              {isGenerating ? "正在生成…" : "重新生成"}
            </Button>
          ) : null}
        </div>
      </div>

      {state.kind === "loading" ? (
        <div className="text-sm text-muted-foreground">正在根据拆书结论整理承接方案。</div>
      ) : null}

      {state.kind === "insufficient" ? (
        <div className="space-y-2 text-sm leading-6">
          <p className="text-foreground">
            还不能开书：{title}的拆书还缺少
            {state.missingSectionTitles.map((item, index) => (
              <span key={item}>
                {index > 0 ? "、" : ""}
                <span className="font-medium">{item}</span>
              </span>
            ))}
            。
          </p>
          <p className="text-muted-foreground">
            请回到这份拆书补齐结论后再回来；系统不会静默改成普通开书。
          </p>
          <Button type="button" size="sm" variant="secondary" asChild>
            <Link to={`/book-analysis?analysisId=${encodeURIComponent(state.bookAnalysisId)}`}>
              去补做拆书
            </Link>
          </Button>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className="space-y-2 text-sm leading-6">
          <p className="text-foreground">{state.message}</p>
          <p className="text-muted-foreground">
            {state.hasPrevious ? "上一份成功方案仍保留，可直接重试。" : "参考关系仍保留，可直接重试生成。"}
          </p>
          <Button type="button" size="sm" onClick={onRegenerate} disabled={isGenerating}>
            {isGenerating ? "正在重试…" : "重试生成"}
          </Button>
        </div>
      ) : null}

      {state.kind === "ready" ? (
        <div className="space-y-4">
          {state.contract.adopted ? (
            <div className="text-xs text-muted-foreground">已采用推荐方案，可继续完成开书设置。</div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-3">
            <TraitColumn title="原书特点" items={state.contract.sourceTraits} />
            <TraitColumn title="本书实现" items={state.contract.bookRealization} />
            <div className="min-w-0 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">开篇方向</div>
              <ul className="space-y-1.5 text-sm leading-6 text-foreground">
                {state.contract.openingChapters
                  .slice()
                  .sort((a, b) => a.chapterNumber - b.chapterNumber)
                  .map((item) => (
                    <li key={item.chapterNumber}>
                      <span className="font-medium">第{item.chapterNumber}章</span>
                      {" · "}
                      {item.direction}
                    </li>
                  ))}
              </ul>
            </div>
          </div>
          {state.contract.mode === "continuation" && state.contract.continuationFocus ? (
            <div className="space-y-1 text-sm leading-6 text-muted-foreground">
              <div>终局人物：{state.contract.continuationFocus.finalCharacterStates.join("；")}</div>
              <div>未完线索：{state.contract.continuationFocus.unfinishedThreads.join("；")}</div>
            </div>
          ) : null}
          {state.contract.mode === "adaptation" && state.contract.adaptationFocus ? (
            <div className="space-y-1 text-sm leading-6 text-muted-foreground">
              <div>钩子：{state.contract.adaptationFocus.hooks.join("；")}</div>
              <div>冲突循环：{state.contract.adaptationFocus.conflictLoops.join("；")}</div>
              <div>爽点节奏：{state.contract.adaptationFocus.payoffRhythm.join("；")}</div>
              <div>新书转换：{state.contract.adaptationFocus.conversionPlan}</div>
            </div>
          ) : null}
          <div className="text-xs text-muted-foreground">
            来源版本 v{state.contract.documentVersionNumber}
            {state.contract.documentTitle ? ` · ${state.contract.documentTitle}` : ""}
          </div>
        </div>
      ) : null}
    </section>
  );
}
