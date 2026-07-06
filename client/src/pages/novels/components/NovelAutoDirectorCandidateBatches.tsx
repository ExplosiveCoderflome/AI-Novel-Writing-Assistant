import type { TitleFactorySuggestion } from "@ai-novel/shared/types/title";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, ChevronDown, RefreshCw, Wand2 } from "lucide-react";
import {
  DIRECTOR_CORRECTION_PRESETS,
  type DirectorCandidate,
  type DirectorCandidateBatch,
  type DirectorCorrectionPreset,
} from "@ai-novel/shared/types/novelDirector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

interface NovelAutoDirectorCandidateBatchesProps {
  batches: DirectorCandidateBatch[];
  selectedPresets: DirectorCorrectionPreset[];
  feedback: string;
  onFeedbackChange: (value: string) => void;
  onTogglePreset: (preset: DirectorCorrectionPreset) => void;
  candidatePatchFeedbacks: Record<string, string>;
  onCandidatePatchFeedbackChange: (candidateId: string, value: string) => void;
  titlePatchFeedbacks: Record<string, string>;
  onTitlePatchFeedbackChange: (candidateId: string, value: string) => void;
  isGenerating: boolean;
  isPatchingCandidate: boolean;
  isRefiningTitle: boolean;
  isConfirming: boolean;
  onApplyCandidateTitleOption: (batchId: string, candidateId: string, option: TitleFactorySuggestion) => void;
  onPatchCandidate: (batchId: string, candidate: DirectorCandidate, feedback: string) => void;
  onRefineTitle: (batchId: string, candidate: DirectorCandidate, feedback: string) => void;
  onConfirmCandidate: (candidate: DirectorCandidate) => void | Promise<void>;
  onGenerateNext: () => void;
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

function renderPrimaryCandidateDetails(candidate: DirectorCandidate) {
  return [
    { label: "核心卖点", value: candidate.sellingPoint },
    { label: "主线冲突", value: candidate.coreConflict },
    { label: "主角路径", value: candidate.protagonistPath },
  ];
}

function renderSecondaryCandidateDetails(candidate: DirectorCandidate) {
  return [
    { label: "作品定位", value: candidate.positioning },
    { label: "主钩子", value: candidate.hookStrategy },
    { label: "推进循环", value: candidate.progressionLoop },
    { label: "结局方向", value: candidate.endingDirection },
    { label: "章节规模", value: `约 ${candidate.targetChapterCount} 章` },
  ];
}

function formatToneKeywords(candidate: DirectorCandidate): string {
  return candidate.toneKeywords.filter(Boolean).slice(0, 4).join(" · ");
}

export default function NovelAutoDirectorCandidateBatches(props: NovelAutoDirectorCandidateBatchesProps) {
  const {
    batches,
    selectedPresets,
    feedback,
    onFeedbackChange,
    onTogglePreset,
    candidatePatchFeedbacks,
    onCandidatePatchFeedbackChange,
    titlePatchFeedbacks,
    onTitlePatchFeedbackChange,
    isGenerating,
    isPatchingCandidate,
    isRefiningTitle,
    isConfirming,
    onApplyCandidateTitleOption,
    onPatchCandidate,
    onRefineTitle,
    onConfirmCandidate,
    onGenerateNext,
  } = props;
  const reducedMotion = useReducedMotion();

  if (batches.length === 0) {
    return (
      <div className={`py-10 text-center text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
        先给 AI 一句灵感，它会先产出第一批整本书方向候选。
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {batches.map((batch, batchIndex) => (
        <motion.section
          key={batch.id}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.18, delay: reducedMotion ? 0 : batchIndex * 0.04 }}
          className="min-w-0"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <div className="break-words text-xs font-medium text-muted-foreground [overflow-wrap:anywhere]">{batch.roundLabel}</div>
              <div className="mt-1 break-words text-base font-semibold text-foreground [overflow-wrap:anywhere]">
                {batch.refinementSummary?.trim() || "初始方案"}
              </div>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {batch.presets.map((preset) => {
                const meta = DIRECTOR_CORRECTION_PRESETS.find((item) => item.value === preset);
                return meta ? <span key={preset}>{meta.label}</span> : null;
              })}
            </div>
          </div>

          <div className="mt-5 divide-y divide-border/45">
            {batch.candidates.map((candidate, candidateIndex) => {
              const titleOptions = resolveCandidateTitleOptions(candidate);
              const toneSummary = formatToneKeywords(candidate);
              return (
                <motion.article
                  key={candidate.id}
                  initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: reducedMotion ? 0 : 0.18,
                    delay: reducedMotion ? 0 : candidateIndex * 0.06,
                  }}
                  className="group min-w-0 py-7 first:pt-2 last:pb-2"
                >
                  <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted-foreground">
                        <span>方案 {candidateIndex + 1}</span>
                        {candidateIndex === 0 ? (
                          <>
                            <span>·</span>
                            <span>推荐先看</span>
                          </>
                        ) : null}
                        <span>·</span>
                        <span>约 {candidate.targetChapterCount} 章</span>
                        {toneSummary ? (
                          <>
                            <span>·</span>
                            <span className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>{toneSummary}</span>
                          </>
                        ) : null}
                      </div>

                      <h3 className="mt-2 max-w-3xl break-words text-2xl font-semibold leading-9 text-foreground [overflow-wrap:anywhere]">
                        {candidate.workingTitle}
                      </h3>

                      <p className="mt-3 max-w-3xl break-words text-sm leading-7 text-muted-foreground [overflow-wrap:anywhere]">
                        {candidate.logline}
                      </p>

                      <dl className="mt-6 grid gap-x-8 gap-y-4 text-sm md:grid-cols-3">
                        {renderPrimaryCandidateDetails(candidate).map((item) => (
                          <div key={item.label} className={`min-w-0 ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                            <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
                            <dd className="mt-1 break-words leading-6 text-foreground [overflow-wrap:anywhere]">{item.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>

                    <aside className="flex min-w-0 flex-col gap-4 lg:pl-2">
                      <Button
                        type="button"
                        className={cn("h-11 justify-between", AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction)}
                        onClick={() => void onConfirmCandidate(candidate)}
                        disabled={isConfirming}
                      >
                        {isConfirming ? "创建中..." : "选用这套"}
                        <ArrowRight className="h-4 w-4" />
                      </Button>

                      <div className="space-y-4 text-sm">
                        <div className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
                          <div className="text-xs font-medium text-muted-foreground">为什么值得选</div>
                          <div className="mt-1 line-clamp-5 break-words leading-6 text-foreground/90 [overflow-wrap:anywhere]">{candidate.whyItFits}</div>
                        </div>
                        {toneSummary ? (
                          <div className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
                            <div className="text-xs font-medium text-muted-foreground">读感关键词</div>
                            <div className="mt-1 break-words leading-6 text-foreground [overflow-wrap:anywhere]">
                              {candidate.toneKeywords.join(" · ")}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </aside>
                  </div>

                  <details className="group mt-6">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground">
                      展开完整设定
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
                    </summary>
                    <dl className="mt-4 grid gap-x-8 gap-y-4 text-sm md:grid-cols-2">
                      {renderSecondaryCandidateDetails(candidate).map((item) => (
                        <div key={item.label} className={`min-w-0 ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                          <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
                          <dd className="mt-1 break-words leading-6 text-foreground [overflow-wrap:anywhere]">{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>

                  <details className="group mt-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground">
                      调整书名与方向
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
                    </summary>
                    <div className="mt-4 space-y-5">
                      <div>
                        <div className="text-xs font-medium text-muted-foreground">可选书名</div>
                        <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                          {titleOptions.map((option) => {
                            const active = option.title === candidate.workingTitle;
                            return (
                              <button
                                key={`${candidate.id}-${option.title}`}
                                type="button"
                                className={cn(
                                  "inline-flex max-w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs transition",
                                  active
                                    ? "bg-primary/10 text-primary"
                                    : "bg-background/70 text-foreground hover:bg-background",
                                )}
                                onClick={() => onApplyCandidateTitleOption(batch.id, candidate.id, option)}
                              >
                                {active ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                                <span className={`font-medium ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{option.title}</span>
                                <span className={active ? "text-primary/70" : "text-muted-foreground"}>预估 {option.clickRate}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div className={`mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                          {titleOptions[0]?.reason?.trim() || "你可以直接切换当前方案的书名。"}
                        </div>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
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
                              disabled={isRefiningTitle || !titlePatchFeedbacks[candidate.id]?.trim()}
                              onClick={() => onRefineTitle(batch.id, candidate, titlePatchFeedbacks[candidate.id] ?? "")}
                            >
                              <Wand2 className="h-4 w-4" />
                              {isRefiningTitle ? "重做中..." : "AI 重做标题组"}
                            </Button>
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <Wand2 className="h-4 w-4 text-muted-foreground" />
                            调整方向
                          </div>
                          <Input
                            className="mt-2 bg-background"
                            value={candidatePatchFeedbacks[candidate.id] ?? ""}
                            onChange={(event) => onCandidatePatchFeedbackChange(candidate.id, event.target.value)}
                            placeholder="例如：保留这套，但主角更主动一点。"
                          />
                          <div className="mt-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}
                              disabled={isPatchingCandidate || !candidatePatchFeedbacks[candidate.id]?.trim()}
                              onClick={() => onPatchCandidate(batch.id, candidate, candidatePatchFeedbacks[candidate.id] ?? "")}
                            >
                              <Wand2 className="h-4 w-4" />
                              {isPatchingCandidate ? "修正中..." : "AI 调整方向"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </details>
                </motion.article>
              );
            })}
          </div>
        </motion.section>
      ))}

      <section className="min-w-0 pt-4">
        <div className="break-words text-base font-semibold text-foreground [overflow-wrap:anywhere]">没有合适的方向</div>
        <div className="mt-1 max-w-3xl break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
          点几个修正方向，再补一句你想要的感觉。系统会保留上一轮，再生成一批新的方案。
        </div>

        <div className="mt-4 flex min-w-0 flex-wrap gap-2">
          {DIRECTOR_CORRECTION_PRESETS.map((preset) => {
            const active = selectedPresets.includes(preset.value);
            return (
              <button
                key={preset.value}
                type="button"
                className={`rounded-full px-3 py-1.5 text-sm transition ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "bg-muted/45 text-foreground hover:bg-muted"
                }`}
                onClick={() => onTogglePreset(preset.value)}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 space-y-2">
          <label htmlFor="director-refine-feedback" className="text-sm font-medium text-foreground">
            再补一句修正建议
          </label>
          <Input
            id="director-refine-feedback"
            value={feedback}
            onChange={(event) => onFeedbackChange(event.target.value)}
            placeholder="例如：我想要女频成长感更强一点，别太像纯爱文，也不要太黑。"
          />
        </div>

        <div className={AUTO_DIRECTOR_MOBILE_CLASSES.actionRow}>
          <Button
            type="button"
            className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}
            onClick={onGenerateNext}
            disabled={isGenerating}
          >
            <RefreshCw className="h-4 w-4" />
            {isGenerating ? "生成中..." : "带修正建议继续生成"}
          </Button>
        </div>
      </section>
    </div>
  );
}
