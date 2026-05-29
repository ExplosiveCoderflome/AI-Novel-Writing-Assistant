import type { DirectorIdeaInspiration } from "@ai-novel/shared/types/novelDirector";
import { Check, Sparkles } from "lucide-react";
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
  return (
    <div className="mt-2 rounded-xl border bg-muted/15 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">可以参考的 5 个起始想法</div>
          <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            这些只是临时灵感，不会自动保存，也不会自动参与生成。选择使用后会填入上方输入框。
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onGenerate} disabled={isGenerating}>
          <Sparkles className="h-4 w-4" />
          {isGenerating ? "生成中..." : ideas.length > 0 ? "换一组" : "生成灵感"}
        </Button>
      </div>
      {ideas.length > 0 ? (
        <div className="mt-3 flex min-w-0 gap-2 overflow-x-auto pb-1">
          {ideas.map((idea) => (
            <div
              key={`${idea.angle}-${idea.text}`}
              className="flex min-h-[188px] min-w-[220px] flex-1 basis-0 flex-col justify-between rounded-lg border bg-background/80 p-3 lg:min-w-0"
            >
              <div className="min-w-0">
                <div className={`text-sm leading-6 text-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                  {idea.text}
                </div>
                {idea.tags.length > 0 ? (
                  <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
                    {idea.tags.map((tag) => (
                      <span key={tag} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-3 w-full justify-center"
                onClick={() => onUseIdea(idea.text)}
              >
                <Check className="h-4 w-4" />
                使用这个
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
