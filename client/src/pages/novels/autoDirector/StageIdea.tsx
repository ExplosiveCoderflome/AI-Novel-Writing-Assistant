import { useEffect, useRef, useState } from "react";
import type { DirectorIdeaInspiration } from "@ai-novel/shared/types/novelDirector";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import NovelAutoDirectorIdeaInspirationPanel from "../components/NovelAutoDirectorIdeaInspirationPanel";

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
}: StageIdeaProps) {
  const reducedMotion = useReducedMotion();
  const [showInspirations, setShowInspirations] = useState(false);
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
    </section>
  );
}
