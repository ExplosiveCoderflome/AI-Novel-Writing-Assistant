import type { SimpleCreationShelfProjection } from "@ai-novel/shared/types/novel";
import type { ReactNode } from "react";
import { BookMarked, Boxes, Globe2, Sparkles, Users } from "lucide-react";
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
    || "AI is shaping the direction of the entire book.";
  const readingPromise = materials.story.readingPromise
    || materials.story.protagonistFantasy;
  const displayedCharacters = materials.characters.slice(0, 6);
  const displayedVolumes = materials.volumes.slice(0, 5);

  return (
    <details
      open
      className="group overflow-hidden rounded-2xl border border-border bg-muted/[0.12]"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
            <Boxes className="h-4 w-4" />
          </span>
          <div>
            <div className="font-medium text-foreground">AI prepared creative resources</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              Read-only view of story commitments, world, characters, and volume outcomes; AI will continue to use these resources to keep subsequent chapters consistent.
                                      </div>
          </div>
        </div>
        <div className="hidden shrink-0 flex-wrap gap-2 text-xs sm:flex">
          <Badge variant="outline">{materials.characterCount} role</Badge>
          <Badge variant="outline">{materials.volumeCount} Volume planning</Badge>
        </div>
      </summary>

      <div className="grid gap-3 border-t border-border/60 p-4 md:grid-cols-2 xl:grid-cols-4">
        <ResourceCard icon={Sparkles} title="book direction" meta="story promise">
          <p className="text-foreground">{sellingPoint}</p>
          {readingPromise ? <p className="mt-2">{readingPromise}</p> : null}
          {materials.story.first30ChapterPromise ? (
            <p className="mt-2">Early redemption:{materials.story.first30ChapterPromise}</p>
          ) : null}
        </ResourceCard>

        <ResourceCard
          icon={Globe2}
          title="story world"
          meta={materials.world ? "Ready to complete" : "In preparation"}
        >
          {materials.world ? (
            <>
              <p className="font-medium text-foreground">{materials.world.name}</p>
              <p className="mt-1">{materials.world.summary || "Core world rules have been incorporated into chapter production."}</p>
            </>
          ) : (
            <p>A summary of the world rules will be displayed here when completed.</p>
          )}
        </ResourceCard>

        <ResourceCard icon={Users} title="Cast of characters" meta={`${materials.characterCount} 位`}>
          {materials.characters.length > 0 ? (
            <div className="space-y-2">
              {displayedCharacters.map((character) => (
                <div key={character.id}>
                  <span className="font-medium text-foreground">{character.name}</span>
                  <span> · {character.storyFunction || character.role}</span>
                  {character.currentGoal ? <div className="text-xs leading-5">Current goals:{character.currentGoal}</div> : null}
                </div>
              ))}
              {materials.characterCount > displayedCharacters.length ? (
                <div className="text-xs">Also {materials.characterCount - displayedCharacters.length} characters have been incorporated into production.</div>
              ) : null}
            </div>
          ) : (
            <p>The character lineup will be displayed here when it is ready.</p>
          )}
        </ResourceCard>

        <ResourceCard icon={BookMarked} title="reel route" meta={`${materials.volumeCount} 卷`}>
          {materials.volumes.length > 0 ? (
            <div className="space-y-2">
              {displayedVolumes.map((volume) => (
                <div key={volume.id}>
                  <span className="font-medium text-foreground">Section {volume.order} roll · {volume.title}</span>
                  <div className="text-xs leading-5">
                    {volume.chapterCount} chapter{volume.mainPromise ? ` · ${volume.mainPromise}` : ""}
                  </div>
                </div>
              ))}
              {materials.volumeCount > displayedVolumes.length ? <div className="text-xs">The remaining volumes have been incorporated into the production of the entire book.</div> : null}
            </div>
          ) : (
            <p>Volume strategies and chapter routes will be displayed here when completed.</p>
          )}
        </ResourceCard>
      </div>
    </details>
  );
}
