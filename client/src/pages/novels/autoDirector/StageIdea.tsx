import type { DirectorIdeaInspiration } from "@ai-novel/shared/types/novelDirector";
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
  const useIdeaInspiration = (text: string) => {
    if (idea.trim()) {
      const confirmed = window.confirm("上方起始想法已有内容。确认使用这条灵感并覆盖原内容吗？");
      if (!confirmed) {
        return;
      }
    }
    onIdeaChange(text);
  };

  return (
    <section className="mx-auto flex min-h-[calc(100vh-220px)] w-full max-w-3xl flex-col justify-center py-8">
      <div className="rounded-xl border bg-background/95 p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-lg font-semibold text-foreground">起始想法</div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              先写一句你想看的故事，AI 会据此整理整本书方向。
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onGenerateIdeaInspirations}
            disabled={isGeneratingIdeaInspirations}
          >
            {isGeneratingIdeaInspirations ? "生成中..." : "没有想法？"}
          </Button>
        </div>
        <textarea
          className="mt-4 min-h-[180px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          value={idea}
          onChange={(event) => onIdeaChange(event.target.value)}
          placeholder="例如：普通女大学生误入异能组织，一边上学打工，一边调查父亲失踪真相。"
        />
        {(ideaInspirations.length > 0 || isGeneratingIdeaInspirations) ? (
          <NovelAutoDirectorIdeaInspirationPanel
            ideas={ideaInspirations}
            isGenerating={isGeneratingIdeaInspirations}
            onGenerate={onGenerateIdeaInspirations}
            onUseIdea={useIdeaInspiration}
          />
        ) : null}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onQuickGenerate} disabled={!canContinue || isGenerating}>
            {isGenerating ? "生成中..." : "用默认设置直接生成方向"}
          </Button>
          <Button type="button" onClick={onContinue} disabled={!canContinue}>
            继续完善设定
          </Button>
        </div>
      </div>
    </section>
  );
}

