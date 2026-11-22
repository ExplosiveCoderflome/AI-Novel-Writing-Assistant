import { useId, useState, type CSSProperties, type ReactElement } from "react";
import { candidateAnchor } from "../autoDirector/candidateReview/candidateScope";
import { candidateFieldLabel, type CandidateStoryField } from "@ai-novel/shared/types/director/candidateReview";
import type { TitleFactorySuggestion } from "@ai-novel/shared/types/title";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, ChevronDown, MessageCircle, RefreshCw, Wand2 } from "lucide-react";
import {
  DIRECTOR_CORRECTION_PRESETS,
  type DirectorCandidate,
  type DirectorCandidateBatch,
  type DirectorRunMode,
} from "@ai-novel/shared/types/novelDirector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

const openingLabels = { auto_to_ready: "选用并自动准备", stage_review: "选用并逐阶段确认" };

interface NovelAutoDirectorCandidateBatchesProps {
  batches: DirectorCandidateBatch[];
  discussionKey?: string;
  titlePatchFeedbacks: Record<string, string>;
  onTitlePatchFeedbackChange: (candidateId: string, value: string) => void;
  isRefiningTitle: boolean;
  isConfirming: boolean;
  isApplying: boolean;
  onApplyCandidateTitleOption: (batchId: string, candidateId: string, option: TitleFactorySuggestion) => void;
  onRefineTitle: (batchId: string, candidate: DirectorCandidate, feedback: string) => void;
  openingMode?: keyof typeof openingLabels;
  onConfirmCandidate: (candidate: DirectorCandidate, batch: DirectorCandidateBatch, mode?: DirectorRunMode) => void | Promise<void>;
}

function buildFallbackTitleOption(candidate: DirectorCandidate): TitleFactorySuggestion {
  return {
    title: candidate.workingTitle,
    clickRate: 60,
    style: "high_concept",
    angle: "当前方案书名",
    reason: "当前沿用导演候选方案的书名。",
  };
}

function resolveCandidateTitleOptions(candidate: DirectorCandidate): TitleFactorySuggestion[] {
  if (Array.isArray(candidate.titleOptions) && candidate.titleOptions.length > 0) {
    return candidate.titleOptions;
  }
  return [buildFallbackTitleOption(candidate)];
}

interface StoryField {
  row: CandidateStoryField | "plannedDirection" | "platform" | "foundation";
  value?: string | null;
}

const fieldLabels = {
  ...candidateFieldLabel, plannedDirection: "本案方向", coreConflict: "冲突展开",
  hookStrategy: "开篇看什么", progressionLoop: "后面追什么", platform: "平台建议", foundation: "创作基础",
};

// Typeset the saved conflict without rewriting the candidate or clipping a sentence.
const sentenceBreaks = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("zh", { granularity: "sentence" }) : null;
function conflictExcerpt(value?: string) {
  const text = value?.trim() ?? "";
  const first = sentenceBreaks?.segment(text)[Symbol.iterator]().next().value?.segment ?? text;
  return { lead: first.trimEnd(), rest: text.slice(first.length).trimStart() };
}

function StoryFields({ fields, id, hidden }: { fields: StoryField[]; id?: string; hidden?: boolean }) {
  return <dl className="candidate-fields" id={id} hidden={hidden}>
    {fields.filter(field => field.value?.trim()).map(field =>
      <div key={field.row} data-field={field.row} style={{ "--candidate-field-row": field.row } as CSSProperties}>
        <dt>{fieldLabels[field.row]}</dt><dd>{field.value}</dd>
      </div>
    )}
  </dl>;
}

function CandidateStoryNotes({ fields }: { fields: StoryField[] }) {
  const [open, setOpen] = useState(true);
  const id = useId();
  return <section className="candidate-story-notes">
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      完整设定与推荐理由<ChevronDown size={15} />
    </button>
    <StoryFields id={id} hidden={!open} fields={fields} />
  </section>;
}

function CandidatePairs({ children }: { children: ReactElement[] }) {
  if (children.length < 2) return children;
  const pairs: ReactElement[] = [];
  for (let index = 0; index < children.length; index += 2) {
    pairs.push(<div className="candidate-comparison" key={children[index].key}>
      {children.slice(index, index + 2)}
    </div>);
  }
  return pairs;
}

function foundationSourceLabel(source: "user_selected" | "ai_recommended" | "market_recommended" | undefined): string {
  if (source === "user_selected") return "你的选择";
  if (source === "ai_recommended") return "AI 补充";
  if (source === "market_recommended") return "雷达推荐";
  return "创作基础";
}

export default function NovelAutoDirectorCandidateBatches(props: NovelAutoDirectorCandidateBatchesProps) {
  const {
    batches,
    discussionKey,
    titlePatchFeedbacks,
    onTitlePatchFeedbackChange,
    isRefiningTitle,
    isConfirming,
    isApplying,
    onApplyCandidateTitleOption,
    onRefineTitle,
    openingMode,
    onConfirmCandidate,
  } = props;
  const reducedMotion = useReducedMotion();
  const alternativeMode = openingMode === "stage_review" ? "auto_to_ready" : "stage_review";

  if (batches.length === 0) {
    return (
      <div className={`py-10 text-center text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
        先给 AI 一句灵感，它会先产出第一批整本书方向候选。
      </div>
    );
  }

  return (
    <div className="candidate-batches space-y-8">
      {batches.map((batch, batchIndex) => (
        <motion.section
          key={batch.id}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.18, delay: reducedMotion ? 0 : batchIndex * 0.04 }}
          className="min-w-0"
        >
          <header className="candidate-round">
            <h3 id={candidateAnchor(batch.id, "")} tabIndex={-1}>{batch.roundLabel} · {batch.candidates.length} 套方向</h3>
            {batch.refinementSummary?.trim() && <p>{batch.refinementSummary}</p>}
            {batch.presets.length > 0 && <p>{batch.presets.map(preset =>
              DIRECTOR_CORRECTION_PRESETS.find(item => item.value === preset)?.label
            ).filter(Boolean).join(" · ")}</p>}
            {batch.candidates.length > 1 && <nav aria-label={`${batch.roundLabel}方向目录`}>
              {batch.candidates.map((candidate, index) => {
                const anchor = candidateAnchor(batch.id, candidate.id);
                return <button key={candidate.id} type="button" onClick={() => {
                  document.getElementById(anchor + "-title")?.focus();
                }}>{index + 1}. {candidate.workingTitle}</button>;
              })}
            </nav>}
          </header>

          <CandidatePairs>{batch.candidates.map((candidate, candidateIndex) => {
            const anchor = candidateAnchor(batch.id, candidate.id);
            const titleOptions = resolveCandidateTitleOptions(candidate);
            const conflict = conflictExcerpt(candidate.coreConflict);
            const lead = conflict.lead || candidate.logline;
            const platform = candidate.recommendedWritingPlatform === "qidian_male" ? "起点男频"
              : candidate.recommendedWritingPlatform === "jinjiang_female" ? "晋江女频"
              : candidate.recommendedWritingPlatform === "fanqie_free" ? "番茄免费网文" : "";
            return (
              <article key={candidate.id} id={anchor} className="candidate-manuscript" aria-labelledby={anchor + "-title"}>
                <header>
                  <div className="candidate-byline">
                    <span className="candidate-number">方案 {candidateIndex + 1}</span>
                    {discussionKey === anchor && <span className="candidate-discussing"><MessageCircle size={14} />当前讨论方向</span>}
                    <span className="candidate-length">约 {candidate.targetChapterCount} 章</span>
                  </div>
                  <h4 className="candidate-book-title" id={anchor + "-title"} tabIndex={-1}>{candidate.workingTitle}</h4>
                  {lead && <dl className="candidate-lead">
                    <dt>{conflict.lead ? "核心冲突" : candidateFieldLabel.logline}</dt>
                    <dd>{lead}</dd>
                  </dl>}
                  {candidate.toneKeywords.length > 0 && <ul className="candidate-keywords" aria-label="故事关键词">
                    {candidate.toneKeywords.map((keyword, index) => <li key={index}>{keyword}</li>)}
                  </ul>}
                </header>
                <StoryFields fields={[
                  { row: "hookStrategy", value: candidate.hookStrategy },
                  { row: "progressionLoop", value: candidate.progressionLoop },
                ]} />

                <CandidateStoryNotes fields={[
                  { row: "plannedDirection", value: candidate.plannedDirection },
                  { row: "logline", value: conflict.lead ? candidate.logline : undefined },
                  { row: "coreConflict", value: conflict.rest },
                  { row: "sellingPoint", value: candidate.sellingPoint },
                  { row: "protagonistPath", value: candidate.protagonistPath },
                  { row: "positioning", value: candidate.positioning },
                  { row: "endingDirection", value: candidate.endingDirection },
                  { row: "whyItFits", value: candidate.whyItFits },
                  { row: "platform", value: [platform, candidate.writingPlatformReason].filter(Boolean).join(" · ") },
                  { row: "foundation", value: candidate.productionFoundation && [
                    `${candidate.productionFoundation.genre.path}（${foundationSourceLabel(candidate.productionFoundation.genre.source)}）`,
                    `${candidate.productionFoundation.primaryStoryMode.path}（${foundationSourceLabel(candidate.productionFoundation.primaryStoryMode.source)}）`,
                    candidate.productionFoundation.secondaryStoryMode &&
                      `${candidate.productionFoundation.secondaryStoryMode.path}（${foundationSourceLabel(candidate.productionFoundation.secondaryStoryMode.source)}）`,
                  ].filter(Boolean).join(" · ") },
                ]} />

                <details className="candidate-title-options group mt-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground">
                    调整书名
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
                  </summary>
                  <div className="mt-4 space-y-5">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground">可选书名</div>
                      <div className="mt-2 divide-y divide-border/45">
                        {titleOptions.map((option) => {
                          const active = option.title === candidate.workingTitle;
                          return (
                            <button
                              key={`${candidate.id}-${option.title}`}
                              type="button"
                              className={cn(
                                "flex w-full min-w-0 items-start justify-between gap-3 py-2 text-left text-sm transition",
                                active ? "text-primary" : "text-foreground hover:text-primary",
                              )}
                              onClick={() => onApplyCandidateTitleOption(batch.id, candidate.id, option)}
                            >
                              <span className="block min-w-0">
                                <span className="flex min-w-0 items-center gap-2">
                                  {active ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                                  <span className={`break-words font-medium [overflow-wrap:anywhere] ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                                    {option.title}
                                  </span>
                                </span>
                                <span className={`mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                                  {option.reason?.trim() || option.angle || "可直接作为这套方向的书名。"}
                                </span>
                              </span>
                              <span className={cn("shrink-0 text-xs tabular-nums", active ? "text-primary" : "text-muted-foreground")}>
                                {option.clickRate}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="max-w-xl">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <RefreshCw className="h-4 w-4 text-muted-foreground" />
                          重做标题组
                        </div>
                        <Input
                          className="mt-2 bg-background"
                          value={titlePatchFeedbacks[candidate.id] ?? ""}
                          onChange={(event) => onTitlePatchFeedbackChange(candidate.id, event.target.value)}
                          placeholder="例如：更偏都市冷感，不要像旧式升级文。"
                        />
                        <div className="mt-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}
                            disabled={isApplying || isRefiningTitle || !titlePatchFeedbacks[candidate.id]?.trim()}
                            onClick={() => onRefineTitle(batch.id, candidate, titlePatchFeedbacks[candidate.id] ?? "")}
                          >
                            <Wand2 className="h-4 w-4" />
                            {isRefiningTitle ? "重做中..." : "AI 重做标题组"}
                          </Button>
                        </div>
                      </div>

                    </div>
                  </div>
                </details>
                <footer className="candidate-decision">
                  {batch.candidates.length > 1 && <button type="button" className="text-sm text-muted-foreground hover:text-foreground"
                    onClick={() => document.getElementById(candidateAnchor(batch.id, ""))?.focus()}>返回本轮目录</button>}
                  {openingMode && <Button type="button" size="sm" variant="secondary" disabled={isConfirming || isApplying}
                    onClick={() => void onConfirmCandidate(candidate, batch, alternativeMode)}>
                    {openingLabels[alternativeMode]}
                  </Button>}
                  <Button type="button" size="sm" disabled={isConfirming || isApplying}
                    onClick={() => void onConfirmCandidate(candidate, batch, openingMode)}>
                    {isConfirming ? "创建中…" : openingMode ? openingLabels[openingMode] : "选用这套"}<ArrowRight size={15} />
                  </Button>
                </footer>
              </article>
            );
          })}</CandidatePairs>
        </motion.section>
      ))}
    </div>
  );
}
