import type { SimpleCreationShelfProjection } from "@ai-novel/shared/types/novel";
import type { ReactNode } from "react";
import { BookMarked, Boxes, ChevronDown, Globe2, Sparkles, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SimpleCreationMaterialsPanelProps {
  materials: SimpleCreationShelfProjection["materials"];
}

function ResourceCard(props: {
  icon: typeof Sparkles;
  title: string;
  meta: string;
  children: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <article className="rounded-2xl border border-border/70 bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <Badge variant="secondary">{props.meta}</Badge>
      </div>
      <h3 className="mt-3 text-sm font-semibold text-foreground">{props.title}</h3>
      <div className="mt-2 text-sm leading-6 text-muted-foreground">{props.children}</div>
    </article>
  );
}

export default function SimpleCreationMaterialsPanel({
  materials,
}: SimpleCreationMaterialsPanelProps) {
  const sellingPoint = materials.story.coreSellingPoint
    || materials.description
    || "AI 正在沉淀整书方向。";
  const readingPromise = materials.story.readingPromise
    || materials.story.protagonistFantasy;
  const displayedCharacters = materials.characters.slice(0, 6);
  const displayedVolumes = materials.volumes.slice(0, 5);

  return (
    <details
      className="group overflow-hidden rounded-2xl border border-border bg-muted/[0.12]"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
            <Boxes className="h-4 w-4" />
          </span>
          <div>
            <div className="font-medium text-foreground">AI 已准备的创作资源</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              只读查看故事承诺、世界、角色和分卷成果；AI 会继续用这些资源保持后续章节一致。
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden flex-wrap gap-2 text-xs sm:flex">
            <Badge variant="outline">{materials.characterCount} 位角色</Badge>
            <Badge variant="outline">{materials.volumeCount} 卷规划</Badge>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </div>
      </summary>

      <div className="grid gap-3 border-t border-border/60 p-4 md:grid-cols-2 xl:grid-cols-4">
        <ResourceCard icon={Sparkles} title="整书方向" meta="故事承诺">
          <p className="text-foreground">{sellingPoint}</p>
          {readingPromise ? <p className="mt-2">{readingPromise}</p> : null}
          {materials.story.first30ChapterPromise ? (
            <p className="mt-2">前期兑现：{materials.story.first30ChapterPromise}</p>
          ) : null}
        </ResourceCard>

        <ResourceCard
          icon={Globe2}
          title="故事世界"
          meta={materials.world ? "准备完成" : "准备中"}
        >
          {materials.world ? (
            <>
              <p className="font-medium text-foreground">{materials.world.name}</p>
              <p className="mt-1">{materials.world.summary || "核心世界规则已纳入章节生产。"}</p>
            </>
          ) : (
            <p>世界规则完成后会在这里显示摘要。</p>
          )}
        </ResourceCard>

        <ResourceCard icon={Users} title="角色阵容" meta={`${materials.characterCount} 位`}>
          {materials.characters.length > 0 ? (
            <div className="space-y-2">
              {displayedCharacters.map((character) => (
                <div key={character.id}>
                  <span className="font-medium text-foreground">{character.name}</span>
                  <span> · {character.storyFunction || character.role}</span>
                  {character.currentGoal ? <div className="text-xs leading-5">当前目标：{character.currentGoal}</div> : null}
                </div>
              ))}
              {materials.characterCount > displayedCharacters.length ? (
                <div className="text-xs">另有 {materials.characterCount - displayedCharacters.length} 位角色已纳入生产。</div>
              ) : null}
            </div>
          ) : (
            <p>角色阵容准备完成后会在这里显示。</p>
          )}
        </ResourceCard>

        <ResourceCard icon={BookMarked} title="分卷路线" meta={`${materials.volumeCount} 卷`}>
          {materials.volumes.length > 0 ? (
            <div className="space-y-2">
              {displayedVolumes.map((volume) => (
                <div key={volume.id}>
                  <span className="font-medium text-foreground">第 {volume.order} 卷 · {volume.title}</span>
                  <div className="text-xs leading-5">
                    {volume.chapterCount} 章{volume.mainPromise ? ` · ${volume.mainPromise}` : ""}
                  </div>
                </div>
              ))}
              {materials.volumeCount > displayedVolumes.length ? <div className="text-xs">其余分卷已纳入全书生产。</div> : null}
            </div>
          ) : (
            <p>卷战略与章节路线完成后会在这里显示。</p>
          )}
        </ResourceCard>
      </div>
    </details>
  );
}
