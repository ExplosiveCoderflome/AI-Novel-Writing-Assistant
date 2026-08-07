import { useEffect, useRef, useState } from "react";
import type { DirectorIdeaInspiration } from "@ai-novel/shared/types/novelDirector";
import type { NovelResourceRecommendationSource } from "@ai-novel/shared/types/novelResourceRecommendation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Layers3, Route, Sparkles, X } from "lucide-react";
import type { GenreTreeNode } from "@/api/genre";
import type { StoryModeTreeNode } from "@/api/storyMode";
import { Button } from "@/components/ui/button";
import NovelAutoDirectorIdeaInspirationPanel from "../components/NovelAutoDirectorIdeaInspirationPanel";
import OnboardingTip from "@/components/onboarding/OnboardingTip";
import CreationFoundationPickerDialog from "./CreationFoundationPickerDialog";

interface StageIdeaProps {
  idea: string;
  onIdeaChange: (value: string) => void;
  ideaInspirations: DirectorIdeaInspiration[];
  isGeneratingIdeaInspirations: boolean;
  onGenerateIdeaInspirations: () => void;
  onContinue: () => void;
  onQuickGenerate: () => void;
  canContinue: boolean;
  isGenerating: boolean;
  genreTree: GenreTreeNode[];
  storyModeTree: StoryModeTreeNode[];
  selectedGenreId: string;
  selectedGenreLabel: string;
  selectedGenreSource?: NovelResourceRecommendationSource;
  selectedStoryModeId: string;
  selectedStoryModeLabel: string;
  selectedStoryModeSource?: NovelResourceRecommendationSource;
  genreLoading: boolean;
  genreError: boolean;
  storyModeLoading: boolean;
  storyModeError: boolean;
  isUpdatingFoundation: boolean;
  onRetryGenres: () => void;
  onRetryStoryModes: () => void;
  onFoundationChange: (patch: Partial<{
    genreId: string;
    primaryStoryModeId: string;
  }>) => Promise<boolean>;
}

function sourceLabel(source: NovelResourceRecommendationSource | undefined): string | null {
  if (source === "user_selected") return "你的选择";
  if (source === "ai_recommended") return "AI 匹配";
  return null;
}

export default function StageIdea({
  idea,
  onIdeaChange,
  ideaInspirations,
  isGeneratingIdeaInspirations,
  onGenerateIdeaInspirations,
  onContinue,
  onQuickGenerate,
  canContinue,
  isGenerating,
  genreTree,
  storyModeTree,
  selectedGenreId,
  selectedGenreLabel,
  selectedGenreSource,
  selectedStoryModeId,
  selectedStoryModeLabel,
  selectedStoryModeSource,
  genreLoading,
  genreError,
  storyModeLoading,
  storyModeError,
  isUpdatingFoundation,
  onRetryGenres,
  onRetryStoryModes,
  onFoundationChange,
}: StageIdeaProps) {
  const reducedMotion = useReducedMotion();
  const [showInspirations, setShowInspirations] = useState(false);
  const [genreDialogOpen, setGenreDialogOpen] = useState(false);
  const [storyModeDialogOpen, setStoryModeDialogOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const typingTimersRef = useRef<number[]>([]);

  useEffect(() => () => {
    typingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(180, textarea.scrollHeight)}px`;
  }, [idea]);

  const useIdeaInspiration = (text: string) => {
    if (idea.trim()) {
      const confirmed = window.confirm("上方起始想法已有内容。确认使用这条灵感并覆盖原内容吗？");
      if (!confirmed) {
        return;
      }
    }
    typingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    typingTimersRef.current = [];
    setShowInspirations(false);
    if (reducedMotion) {
      onIdeaChange(text);
      return;
    }
    onIdeaChange("");
    const steps = 12;
    for (let step = 1; step <= steps; step += 1) {
      const timer = window.setTimeout(() => {
        const end = Math.ceil((text.length * step) / steps);
        onIdeaChange(text.slice(0, end));
      }, step * 18);
      typingTimersRef.current.push(timer);
    }
  };

  const handleShowInspirations = () => {
    setShowInspirations(true);
    if (ideaInspirations.length === 0 && !isGeneratingIdeaInspirations) {
      onGenerateIdeaInspirations();
    }
  };

  return (
    <section className="mx-auto flex min-h-[calc(100vh-180px)] w-full max-w-4xl flex-col items-center justify-center px-1 py-10 sm:py-16">
      <motion.div
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.2 }}
        className="w-full text-center"
      >
        <h1 className="text-3xl font-semibold tracking-normal text-foreground sm:text-[32px]">
          用一句话，开始你的整本书
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
          写下你想看的故事，AI 会先帮你整理成可选择的整本书方向。
        </p>
      </motion.div>

      <div className="mt-6 w-full">
        <OnboardingTip
          storageKey="auto-director-idea"
          title="一句话不需要写成完整大纲"
          description="写清主角、处境或最想看的冲突即可。故事类型和推进方式可以交给 AI，也可以在下方先指定。"
          next="AI 生成两套差异明确的整书方向。"
        />
      </div>

      <motion.div
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.22, delay: reducedMotion ? 0 : 0.08 }}
        className="mt-8 w-full rounded-lg bg-muted/20 p-3 shadow-[0_14px_44px_rgba(15,23,42,0.06)] transition focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/30 sm:p-4"
      >
        <textarea
          ref={textareaRef}
          className="min-h-[180px] w-full resize-none bg-transparent px-1 py-1 text-base leading-7 text-foreground outline-none placeholder:text-muted-foreground/60 sm:text-lg sm:leading-8"
          value={idea}
          onChange={(event) => onIdeaChange(event.target.value)}
          placeholder="例如：普通女大学生误入异能组织，一边上学打工，一边调查父亲失踪真相。"
        />
        <div className="border-t border-border/60 pt-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">创作偏好（可选）</div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex min-w-0 flex-1 items-center rounded-md bg-background/65 ring-1 ring-border/70">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-muted/45 disabled:opacity-50"
                onClick={() => setGenreDialogOpen(true)}
                disabled={isGenerating || isUpdatingFoundation}
              >
                <Layers3 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {selectedGenreLabel || "故事类型：AI 自动匹配"}
                </span>
                {sourceLabel(selectedGenreSource) ? (
                  <span className="shrink-0 text-[11px] text-muted-foreground">{sourceLabel(selectedGenreSource)}</span>
                ) : null}
              </button>
              {selectedGenreId ? (
                <button
                  type="button"
                  className="mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="清除故事类型"
                  disabled={isGenerating || isUpdatingFoundation}
                  onClick={() => void onFoundationChange({ genreId: "" })}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            <div className="flex min-w-0 flex-1 items-center rounded-md bg-background/65 ring-1 ring-border/70">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-muted/45 disabled:opacity-50"
                onClick={() => setStoryModeDialogOpen(true)}
                disabled={isGenerating || isUpdatingFoundation}
              >
                <Route className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {selectedStoryModeLabel || "推进方式：AI 自动搭配"}
                </span>
                {sourceLabel(selectedStoryModeSource) ? (
                  <span className="shrink-0 text-[11px] text-muted-foreground">{sourceLabel(selectedStoryModeSource)}</span>
                ) : null}
              </button>
              {selectedStoryModeId ? (
                <button
                  type="button"
                  className="mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="清除推进方式"
                  disabled={isGenerating || isUpdatingFoundation}
                  onClick={() => void onFoundationChange({ primaryStoryModeId: "" })}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>
          {(genreError || storyModeError) ? (
            <div className="mt-2 text-xs text-muted-foreground">
              部分可选方向暂时未加载，你仍可交给 AI 自动搭配后继续。
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
            onClick={handleShowInspirations}
            disabled={isGeneratingIdeaInspirations}
          >
            <Sparkles className="h-4 w-4" />
            {isGeneratingIdeaInspirations ? "正在准备几个开头..." : "没有想法？看几个开头"}
          </button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              className="text-sm text-muted-foreground transition hover:text-foreground disabled:opacity-50"
              onClick={onQuickGenerate}
              disabled={!canContinue || isGenerating}
            >
              {isGenerating ? "生成中..." : "用默认设置直接生成方向"}
            </button>
            <Button type="button" onClick={onContinue} disabled={!canContinue}>
              继续完善设定
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>

      {showInspirations && (ideaInspirations.length > 0 || isGeneratingIdeaInspirations) ? (
        <motion.div
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
          className="w-full"
        >
          <NovelAutoDirectorIdeaInspirationPanel
            ideas={ideaInspirations}
            isGenerating={isGeneratingIdeaInspirations}
            onGenerate={onGenerateIdeaInspirations}
            onUseIdea={useIdeaInspiration}
          />
        </motion.div>
      ) : null}

      <CreationFoundationPickerDialog
        open={genreDialogOpen}
        onOpenChange={setGenreDialogOpen}
        title="选择故事类型"
        description="这个选择会约束后续方向、世界、人物与剧情规划；不确定时交给 AI 即可。"
        treeTitle="题材目录"
        nodes={genreTree}
        selectedId={selectedGenreId}
        autoLabel="交给 AI 匹配故事类型"
        emptyLabel="题材基底库暂时为空，可以先交给 AI 自动处理。"
        loading={genreLoading}
        error={genreError}
        applying={isUpdatingFoundation}
        onRetry={onRetryGenres}
        onApply={(genreId) => onFoundationChange({ genreId })}
      />

      <CreationFoundationPickerDialog
        open={storyModeDialogOpen}
        onOpenChange={setStoryModeDialogOpen}
        title="选择主要推进方式"
        description="它决定故事主要靠什么持续变精彩；辅助推进方式仍由 AI 自动补充。"
        treeTitle="推进模式目录"
        nodes={storyModeTree}
        selectedId={selectedStoryModeId}
        autoLabel="交给 AI 搭配推进方式"
        emptyLabel="推进模式库暂时为空，可以先交给 AI 自动处理。"
        loading={storyModeLoading}
        error={storyModeError}
        applying={isUpdatingFoundation}
        onRetry={onRetryStoryModes}
        onApply={(primaryStoryModeId) => onFoundationChange({ primaryStoryModeId })}
      />
    </section>
  );
}
