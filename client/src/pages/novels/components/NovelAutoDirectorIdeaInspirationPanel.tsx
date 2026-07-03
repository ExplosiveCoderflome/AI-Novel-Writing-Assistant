import type { DirectorIdeaInspiration } from "@ai-novel/shared/types/novelDirector";
import { motion, useReducedMotion } from "framer-motion";
import { Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

interface NovelAutoDirectorIdeaInspirationPanelProps {
  ideas: DirectorIdeaInspiration[];
  isGenerating: boolean;
  onGenerate: () => void;
  onUseIdea: (text: string) => void;
}

export default function NovelAutoDirectorIdeaInspirationPanel({
  ideas,
  isGenerating,
  onGenerate,
  onUseIdea,
}: NovelAutoDirectorIdeaInspirationPanelProps) {
  const reducedMotion = useReducedMotion();

  return (
    <div className="mt-5 w-full">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          这些只是临时灵感，使用后仍可继续改。
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onGenerate} disabled={isGenerating}>
          <RefreshCw className="h-4 w-4" />
          {isGenerating ? "生成中..." : ideas.length > 0 ? "换一组" : "生成灵感"}
        </Button>
      </div>
      {ideas.length > 0 ? (
        <div className="mt-2 space-y-1">
          {ideas.map((idea, index) => (
            <motion.button
              key={`${idea.angle}-${idea.text}`}
              type="button"
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.16, delay: reducedMotion ? 0 : index * 0.04 }}
              className="group flex w-full min-w-0 items-start justify-between gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-muted/45"
              onClick={() => onUseIdea(idea.text)}
            >
              <div className="min-w-0">
                <div className={`line-clamp-2 text-sm leading-6 text-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                  {idea.text}
                </div>
                {idea.tags.length > 0 ? (
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {idea.tags.join(" · ")}
                  </div>
                ) : null}
              </div>
              <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-primary opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                <Check className="h-4 w-4" />
                使用
              </span>
            </motion.button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
