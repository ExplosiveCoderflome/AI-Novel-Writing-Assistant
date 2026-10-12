import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DirectorIdeaConstellationOption,
  DirectorIdeaConstellationSelection,
} from "@ai-novel/shared/types/novelDirector";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  IDEA_CONSTELLATION_CATEGORY_LABELS,
  orderIdeaConstellationOptions,
  selectRotatingFoundationOptions,
  toggleIdeaConstellationSelection,
  type FoundationConstellationOption,
} from "./ideaConstellationState";
import { buildConstellationLayout } from "./constellationLayout";

interface StoryConstellationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: DirectorIdeaConstellationOption[];
  genreOptions: FoundationConstellationOption[];
  storyModeOptions: FoundationConstellationOption[];
  selectedGenreId: string;
  selectedStoryModeId: string;
  isUpdatingFoundation: boolean;
  isGenerating: boolean;
  isComposing: boolean;
  onGenerate: () => void;
  onSelectGenre: (genreId: string) => Promise<boolean>;
  onSelectStoryMode: (storyModeId: string) => Promise<boolean>;
  onCompose: (selected: DirectorIdeaConstellationSelection[]) => Promise<string>;
  onUseIdea: (idea: string) => void;
}

const CATEGORY_ACCENTS = {
  protagonist: "bg-sky-400",
  setting: "bg-emerald-400",
  advantage: "bg-cyan-400",
  opening_crisis: "bg-rose-400",
  core_goal: "bg-amber-400",
  story_variable: "bg-violet-400",
  relationship: "bg-pink-400",
} as const;

const RELEVANCE_CLASSES = {
  high: "text-lg font-semibold tracking-tight",
  medium: "text-sm font-medium",
  low: "text-xs font-medium text-muted-foreground",
} as const;

export default function StoryConstellationDialog({
  open,
  onOpenChange,
  options,
  genreOptions,
  storyModeOptions,
  selectedGenreId,
  selectedStoryModeId,
  isUpdatingFoundation,
  isGenerating,
  isComposing,
  onGenerate,
  onSelectGenre,
  onSelectStoryMode,
  onCompose,
  onUseIdea,
}: StoryConstellationDialogProps) {
  const reducedMotion = useReducedMotion();
  const [selected, setSelected] = useState<DirectorIdeaConstellationSelection[]>([]);
  const [activeHint, setActiveHint] = useState("");
  const [foundationPage, setFoundationPage] = useState(0);
  const [layoutSize, setLayoutSize] = useState({ width: 0, height: 0 });
  const desktopFieldRef = useRef<HTMLDivElement | null>(null);
  const orderedOptions = useMemo(() => orderIdeaConstellationOptions(options), [options]);
  const plotOptions = orderedOptions;
  const visibleGenreOptions = useMemo(
    () => selectRotatingFoundationOptions(genreOptions, foundationPage, selectedGenreId, 8),
    [foundationPage, genreOptions, selectedGenreId],
  );
  const visibleStoryModeOptions = useMemo(
    () => selectRotatingFoundationOptions(storyModeOptions, foundationPage, selectedStoryModeId, 8),
    [foundationPage, selectedStoryModeId, storyModeOptions],
  );
  const foundationGroups = [
    {
      kind: "genre",
      label: "故事类型",
      options: visibleGenreOptions,
      selectedId: selectedGenreId,
      onSelect: onSelectGenre,
      colorClass: "text-sky-600 dark:text-sky-300",
    },
    {
      kind: "story-mode",
      label: "推进方式",
      options: visibleStoryModeOptions,
      selectedId: selectedStoryModeId,
      onSelect: onSelectStoryMode,
      colorClass: "text-violet-600 dark:text-violet-300",
    },
  ] as const;
  const foundationCloudItems = foundationGroups.flatMap((group) => (
    group.options.map((option) => ({ ...group, option }))
  ));
  const constellationLayout = useMemo(() => buildConstellationLayout([
    ...plotOptions.map((option) => ({
      id: `plot-${option.id}`,
      label: option.label,
      kind: "plot" as const,
      emphasis: option.relevance,
    })),
    ...visibleGenreOptions.map((option) => ({
      id: `foundation-genre-${option.id}`,
      label: option.label,
      kind: "foundation" as const,
    })),
    ...visibleStoryModeOptions.map((option) => ({
      id: `foundation-story-mode-${option.id}`,
      label: option.label,
      kind: "foundation" as const,
    })),
  ], layoutSize.width || 1440, layoutSize.height || 620), [
    layoutSize.height,
    layoutSize.width,
    plotOptions,
    visibleGenreOptions,
    visibleStoryModeOptions,
  ]);

  useEffect(() => {
    if (!open || !desktopFieldRef.current) return;
    const field = desktopFieldRef.current;
    const updateSize = () => {
      const bounds = field.getBoundingClientRect();
      setLayoutSize((current) => (
        current.width === bounds.width && current.height === bounds.height
          ? current
          : { width: bounds.width, height: bounds.height }
      ));
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(field);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    setSelected([]);
    setActiveHint("");
  }, [options]);

  const handleToggle = (option: DirectorIdeaConstellationOption) => {
    setSelected((current) => toggleIdeaConstellationSelection(current, option));
    setActiveHint(option.hint);
  };

  const handleRegenerate = () => {
    setSelected([]);
    setActiveHint("");
    setFoundationPage((current) => current + 1);
    onGenerate();
  };

  const handleConfirm = async () => {
    if (selected.length === 0) {
      onOpenChange(false);
      return;
    }
    try {
      const idea = await onCompose(selected);
      if (idea.trim()) {
        onUseIdea(idea.trim());
        onOpenChange(false);
      }
    } catch {
      // The controller presents the request error and selections stay available for retry.
    }
  };

  const statusText = selected.length === 0
    ? "可以只调整故事类型与推进方式，也可以选择具体开书素材。"
    : `已选 ${selected.length}/7 类开书素材，确认后 AI 会整理并回填。`;

  const footer = (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 rounded-2xl border border-border/60 bg-background/80 px-4 py-3 shadow-[0_18px_70px_rgba(15,23,42,0.12)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:rounded-full sm:px-5">
      <div className="min-w-0 text-xs text-muted-foreground" aria-live="polite">{statusText}</div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isComposing}>取消</Button>
        <Button
          type="button"
          className="rounded-full px-5"
          onClick={() => void handleConfirm()}
          disabled={isComposing || isUpdatingFoundation}
        >
          {isComposing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {isComposing ? "正在确认..." : "确认"}
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        title="故事星图"
        description="选择主角、金手指、首章爆点和推进素材，确认后会回到开书页继续修改。"
        className="left-0 top-0 h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-background/95 shadow-none backdrop-blur-2xl"
        headerClassName="border-0 bg-transparent px-6 pb-2 pt-5 pr-16 sm:px-8 sm:pt-6 lg:px-10"
        bodyClassName="relative overflow-hidden p-0"
        footerClassName="border-0 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-5 pt-8 sm:px-8 lg:px-10"
        footer={footer}
      >
        <div className="absolute left-6 top-3 z-20 hidden items-center gap-2 text-xs text-muted-foreground sm:flex lg:left-10">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          类型和推进方式可直接切换；每类开书素材最多选择一个。
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="absolute right-5 top-1 z-20 rounded-full sm:right-8 lg:right-10"
          onClick={handleRegenerate}
          disabled={isGenerating || isComposing}
        >
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          {isGenerating ? "正在换一组..." : "换一组"}
        </Button>

        {isGenerating ? (
          <div className="flex h-full min-h-[520px] flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <div className="absolute inset-0 animate-pulse rounded-full bg-primary/10 blur-xl" />
              <Loader2 className="relative h-7 w-7 animate-spin text-primary" />
            </div>
            <div className="text-sm font-medium text-foreground">AI 正在点亮你的故事星图</div>
            <div className="text-xs text-muted-foreground">会结合当前题材、推进方式和创作偏好。</div>
          </div>
        ) : orderedOptions.length === 0 ? (
          <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-4 px-6 text-center">
            <div>
              <div className="text-sm font-medium text-foreground">故事星图暂时没有生成成功</div>
              <div className="mt-2 text-xs text-muted-foreground">你的起始想法不会受到影响，可以重新尝试。</div>
            </div>
            <Button type="button" variant="outline" className="rounded-full" onClick={onGenerate}>
              <RotateCcw className="h-4 w-4" />重新生成
            </Button>
          </div>
        ) : (
          <>
            <div ref={desktopFieldRef} className="relative hidden h-full min-h-[560px] overflow-hidden lg:block">
              <div className="absolute left-[8%] top-[16%] h-64 w-64 rounded-full bg-sky-400/5 blur-[90px]" />
              <div className="absolute right-[8%] top-[20%] h-72 w-72 rounded-full bg-violet-400/5 blur-[100px]" />
              <div className="absolute bottom-[2%] left-[34%] h-64 w-96 rounded-full bg-emerald-400/5 blur-[110px]" />

              {plotOptions.map((option, index) => {
                const selectedOption = selected.some((item) => item.id === option.id);
                const position = constellationLayout[`plot-${option.id}`];
                return (
                  <div
                    key={option.id}
                    className="absolute z-10"
                    style={{
                      left: `${position?.left ?? 50}%`,
                      top: `${position?.top ?? 50}%`,
                      transform: `translate(-50%, -50%) rotate(${position?.rotate ?? 0}deg)`,
                    }}
                  >
                    <motion.button
                      type="button"
                      aria-pressed={selectedOption}
                      aria-label={`${IDEA_CONSTELLATION_CATEGORY_LABELS[option.category]}：${option.label}。${option.hint}`}
                      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.88 }}
                      animate={{ opacity: 1, scale: selectedOption ? 1.06 : 1 }}
                      transition={{ duration: reducedMotion ? 0 : 0.2, delay: reducedMotion ? 0 : index * 0.018 }}
                      className={cn(
                        "group max-w-[300px] whitespace-normal rounded-full border border-transparent bg-background/25 px-3 py-2 text-left leading-snug text-foreground backdrop-blur-sm transition-colors hover:border-border/55 hover:bg-background/75 hover:shadow-[0_10px_35px_rgba(15,23,42,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                        RELEVANCE_CLASSES[option.relevance],
                        selectedOption && "border-primary/30 bg-primary text-primary-foreground shadow-[0_12px_40px_hsl(var(--primary)/0.22)]",
                      )}
                      onClick={() => handleToggle(option)}
                      onFocus={() => setActiveHint(option.hint)}
                      onMouseEnter={() => setActiveHint(option.hint)}
                    >
                      <span className={cn("mr-2 inline-block h-1.5 w-1.5 rounded-full", selectedOption ? "bg-primary-foreground" : CATEGORY_ACCENTS[option.category])} />
                      {option.label}
                    </motion.button>
                  </div>
                );
              })}

              {foundationCloudItems.map((item) => {
                const position = constellationLayout[`foundation-${item.kind}-${item.option.id}`];
                const selectedOption = item.option.id === item.selectedId;
                return (
                  <div
                    key={`${item.kind}-${item.option.id}`}
                    className="absolute z-20"
                    style={{
                      left: `${position?.left ?? 50}%`,
                      top: `${position?.top ?? 50}%`,
                      transform: `translate(-50%, -50%) rotate(${position?.rotate ?? 0}deg)`,
                    }}
                  >
                    <motion.button
                      type="button"
                      disabled={isUpdatingFoundation}
                      aria-pressed={selectedOption}
                      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: selectedOption ? 1.08 : 1 }}
                      className={cn(
                        "group whitespace-nowrap text-left transition disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                        item.colorClass,
                      )}
                      onClick={() => void item.onSelect(item.option.id)}
                      onFocus={() => setActiveHint(item.option.hint)}
                      onMouseEnter={() => setActiveHint(item.option.hint)}
                    >
                      <span className="block text-[10px] font-medium tracking-[0.18em] opacity-65">{item.label}</span>
                      <span className={cn("block text-base font-semibold leading-7", selectedOption && "underline decoration-2 underline-offset-4")}>
                        {item.option.label}
                      </span>
                    </motion.button>
                  </div>
                );
              })}

              <div className="absolute left-1/2 top-1/2 flex h-[min(34vw,430px)] w-[min(34vw,430px)] -translate-x-1/2 -translate-y-1/2 items-center justify-center">
                <div className="absolute inset-[4%] rounded-full border border-primary/10" />
                <div className="absolute inset-[15%] rounded-full border border-primary/15" />
                <div className="absolute inset-[24%] rounded-full bg-primary/10 blur-2xl" />
                <div className="relative z-10 max-w-[290px] px-5 text-center">
                  <div className="text-[11px] font-medium tracking-[0.24em] text-muted-foreground">故事核心</div>
                  {selected.length > 0 ? (
                    <div className="mt-5 flex flex-wrap justify-center gap-2">
                      {selected.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                          onClick={() => {
                            const option = options.find((candidate) => candidate.id === item.id);
                            if (option) handleToggle(option);
                          }}
                          aria-label={`移除${item.label}`}
                        >
                          {item.label} ×
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 text-sm leading-7 text-muted-foreground">可以只调整创作方向<br />或选择具体的开书素材</div>
                  )}
                  <div className="mx-auto mt-5 line-clamp-3 max-w-[260px] text-xs leading-5 text-muted-foreground" aria-live="polite">
                    {activeHint || "把鼠标移到词语上，可以查看它会怎样落到开局和连载推进。"}
                  </div>
                </div>
              </div>
            </div>

            <div className="h-full overflow-y-auto px-4 pb-8 pt-12 sm:px-6 lg:hidden">
              <div className="mx-auto max-w-2xl space-y-6">
                {foundationGroups.map((group) => (
                  <section key={group.kind} aria-labelledby={`constellation-${group.kind}`}>
                    <h3 id={`constellation-${group.kind}`} className={cn("text-xs font-semibold tracking-wide", group.colorClass)}>{group.label}</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {group.options.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          disabled={isUpdatingFoundation}
                          aria-pressed={option.id === group.selectedId}
                          className={cn(
                            "rounded-full border border-border/60 bg-background/55 px-3 py-2 text-sm backdrop-blur-sm transition disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                            option.id === group.selectedId && "border-primary bg-primary text-primary-foreground",
                          )}
                          onClick={() => void group.onSelect(option.id)}
                          onFocus={() => setActiveHint(option.hint)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
                {Object.entries(IDEA_CONSTELLATION_CATEGORY_LABELS).map(([category, label]) => (
                  <section key={category} aria-labelledby={`constellation-${category}`}>
                    <h3 id={`constellation-${category}`} className="text-xs font-medium tracking-wide text-muted-foreground">{label}</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {plotOptions.filter((option) => option.category === category).map((option) => {
                        const selectedOption = selected.some((item) => item.id === option.id);
                        return (
                          <button
                            key={option.id}
                            type="button"
                            aria-pressed={selectedOption}
                            className={cn(
                              "rounded-full border border-border/60 bg-background/55 px-3 py-2 text-sm backdrop-blur-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                              selectedOption && "border-primary bg-primary text-primary-foreground",
                            )}
                            onClick={() => handleToggle(option)}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
                <div className="rounded-xl bg-muted/30 px-4 py-3 text-xs leading-5 text-muted-foreground" aria-live="polite">
                  {activeHint || "点击一项具体素材，可以查看并组合它带来的开书方向。"}
                </div>
              </div>
            </div>
          </>
        )}
      </AppDialogContent>
    </Dialog>
  );
}
