import type { TitleFactorySuggestion } from "@ai-novel/shared/types/title";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, RefreshCw, Wand2 } from "lucide-react";
import {
  DIRECTOR_CORRECTION_PRESETS,
  type DirectorCandidate,
  type DirectorCandidateBatch,
  type DirectorCorrectionPreset,
} from "@ai-novel/shared/types/novelDirector";
import { Badge } from "@/components/ui/badge";
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

function renderCandidateDetails(candidate: DirectorCandidate) {
  return [
    { label: "作品定位", value: candidate.positioning },
    { label: "核心卖点", value: candidate.sellingPoint },
    { label: "主线冲突", value: candidate.coreConflict },
    { label: "主角路径", value: candidate.protagonistPath },
    { label: "主钩子", value: candidate.hookStrategy },
    { label: "推进循环", value: candidate.progressionLoop },
    { label: "结局方向", value: candidate.endingDirection },
    { label: "章节规模", value: `约 ${candidate.targetChapterCount} 章` },
  ];
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
      <div className={`rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground sm:p-8 ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
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
          <div className="flex flex-col gap-2 border-b border-border/70 pb-3 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <div className="break-words text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{batch.roundLabel}</div>
              <div className="mt-0.5 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {batch.refinementSummary?.trim() || "初始方案"}
              </div>
            </div>
            <div className="flex min-w-0 flex-wrap gap-2">
              {batch.presets.map((preset) => {
                const meta = DIRECTOR_CORRECTION_PRESETS.find((item) => item.value === preset);
                return meta ? <Badge key={preset} variant="secondary" className="border-transparent bg-muted/70">{meta.label}</Badge> : null;
              })}
            </div>
          </div>

          <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-2">
            {batch.candidates.map((candidate, candidateIndex) => {
              const titleOptions = resolveCandidateTitleOptions(candidate);
              return (
                <motion.article
                  key={candidate.id}
                  initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: reducedMotion ? 0 : 0.18,
                    delay: reducedMotion ? 0 : candidateIndex * 0.06,
                  }}
                  className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-border/80 bg-background p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md sm:p-5"
                >
                  <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-muted-foreground">方案 {candidateIndex + 1}</div>
                      <h3 className="mt-1 break-words text-xl font-semibold leading-7 text-foreground [overflow-wrap:anywhere]">
                        {candidate.workingTitle}
                      </h3>
                    </div>
                    <Button
                      type="button"
                      className={cn("shrink-0", AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction)}
                      onClick={() => void onConfirmCandidate(candidate)}
                      disabled={isConfirming}
                    >
                      {isConfirming ? "创建中..." : "选用这套"}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>

                  <p className="mt-4 break-words text-sm leading-7 text-muted-foreground [overflow-wrap:anywhere]">
                    {candidate.logline}
                  </p>

                  <div className="mt-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-foreground">书名候选</div>
                      <div className="text-xs text-muted-foreground">当前选用：{candidate.workingTitle}</div>
                    </div>
                    <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                      {titleOptions.map((option) => {
                        const active = option.title === candidate.workingTitle;
                        return (
                          <button
                            key={`${candidate.id}-${option.title}`}
                            type="button"
                            className={cn(
                              "inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-left text-xs transition",
                              active
                                ? "bg-foreground text-background shadow-sm"
                                : "bg-muted/70 text-foreground hover:bg-muted",
                            )}
                            onClick={() => onApplyCandidateTitleOption(batch.id, candidate.id, option)}
                          >
                            {active ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                            <span className={`font-medium ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{option.title}</span>
                            <span className={active ? "text-background/70" : "text-muted-foreground"}>预估 {option.clickRate}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className={`mt-2 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                      {titleOptions[0]?.reason?.trim() || "书名由标题工坊增强生成，你可以在这里切换当前方案名。"}
                    </div>
                  </div>

                  <div className="mt-5 rounded-md bg-muted/35 px-3 py-3 text-sm leading-6">
                    <div className="font-medium text-foreground">推荐理由</div>
                    <div className="mt-1 break-words text-muted-foreground [overflow-wrap:anywhere]">{candidate.whyItFits}</div>
                  </div>

                  <dl className="mt-5 grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
                    {renderCandidateDetails(candidate).map((item) => (
                      <div key={item.label} className={`min-w-0 ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                        <dt className="text-xs text-muted-foreground">{item.label}</dt>
                        <dd className="mt-1 break-words leading-6 text-foreground [overflow-wrap:anywhere]">{item.value}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="mt-4 flex min-w-0 flex-wrap gap-2">
                    {candidate.toneKeywords.map((keyword) => (
                      <span key={keyword} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {keyword}
                      </span>
                    ))}
                  </div>

                  <div className="mt-5 space-y-3 border-t border-border/70 pt-4">
                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <RefreshCw className="h-4 w-4 text-muted-foreground" />
                          重做标题组
                        </div>
                        <Input
                          className="mt-2 bg-background"
                          value={titlePatchFeedbacks[candidate.id] ?? ""}
                          onChange={(event) => onTitlePatchFeedbackChange(candidate.id, event.target.value)}
                          placeholder="例如：当前这组太土气了，想更偏都市冷感一点，别像旧式升级文。"
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
                          微调方案
                        </div>
                        <Input
                          className="mt-2 bg-background"
                          value={candidatePatchFeedbacks[candidate.id] ?? ""}
                          onChange={(event) => onCandidatePatchFeedbackChange(candidate.id, event.target.value)}
                          placeholder="例如：保留这套，但更偏都市异能，主角更主动一点。"
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
                            {isPatchingCandidate ? "修正中..." : "AI 微调方案"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </motion.section>
      ))}

      <section className="min-w-0 rounded-lg bg-muted/30 p-4 sm:p-5">
        <div className="break-words text-base font-semibold text-foreground [overflow-wrap:anywhere]">继续修正并生成下一轮</div>
        <div className="mt-1 max-w-3xl break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
          如果这几套还不够对味，可以点几个方向，再补一句你真正想要的感觉。系统会保留上一轮，再给你一轮新的方案。
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
                    ? "bg-foreground text-background shadow-sm"
                    : "bg-background text-foreground hover:bg-muted"
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
