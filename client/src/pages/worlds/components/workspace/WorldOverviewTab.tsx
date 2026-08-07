import {
  BookOpen,
  Castle,
  Clock3,
  GitBranch,
  Map,
  MapPinned,
  Network,
  Pencil,
  ShieldAlert,
  Sparkles,
  WandSparkles,
  Workflow,
} from "lucide-react";
import type { WorldStructuredData, WorldVisualizationPayload } from "@ai-novel/shared/types/world";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { featureFlags } from "@/config/featureFlags";
import WorldVisualizationBoard from "../WorldVisualizationBoard";

interface WorldOverviewTabProps {
  summary?: string;
  sections: Array<{ key: string; title: string; content: string }>;
  structure?: WorldStructuredData;
  visualization?: WorldVisualizationPayload;
  onOpenStructure?: () => void;
  onOpenLayers?: () => void;
}

function compactText(value: string | null | undefined, fallback: string, limit = 120) {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) {
    return fallback;
  }
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function listText(items: Array<string | null | undefined>, fallback: string, limit = 3) {
  const visible = items.map((item) => compactText(item, "", 96)).filter(Boolean).slice(0, limit);
  return visible.length > 0 ? visible : [fallback];
}

function HandbookBlock({
  icon: Icon,
  title,
  items,
  accent = "default",
}: {
  icon: typeof BookOpen;
  title: string;
  items: string[];
  accent?: "default" | "primary";
}) {
  return (
    <div className={accent === "primary" ? "rounded-md border border-primary/30 bg-primary/5 p-3" : "rounded-md border bg-background p-3"}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        {title}
      </div>
      <div className="mt-2 space-y-2 text-sm leading-6 text-muted-foreground">
        {items.map((item) => (
          <div key={item} className="line-clamp-3">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyHandbookBlock({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof BookOpen;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-md border border-dashed bg-background p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        {title}
      </div>
      <div className="mt-2 text-sm leading-6 text-muted-foreground">{description}</div>
    </div>
  );
}

function WorldAssetPreviewBlock({
  icon: Icon,
  title,
  description,
  status,
}: {
  icon: typeof BookOpen;
  title: string;
  description: string;
  status: string;
}) {
  return (
    <div className="rounded-md border border-dashed bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
        </div>
        <Badge variant="outline">{status}</Badge>
      </div>
      <div className="mt-2 text-xs leading-5 text-muted-foreground">{description}</div>
    </div>
  );
}

export default function WorldOverviewTab(props: WorldOverviewTabProps) {
  const { summary, sections, structure, visualization, onOpenStructure, onOpenLayers } = props;
  const profile = structure?.profile;
  const hasHandbook = Boolean(structure);
  const worldPromise = compactText(
    profile?.identity || profile?.summary,
    summary ?? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    120,
  );
  const coreRules = listText(
    structure?.rules?.axioms.map((rule) => [rule.name, rule.summary].filter(Boolean).join("：")) ?? [],
    "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  );
  const majorForces = listText(
    [
      ...(structure?.forces ?? []).map((force) => [force.name, force.summary || force.currentObjective].filter(Boolean).join("：")),
      ...(structure?.factions ?? []).map((faction) => [faction.name, faction.position || faction.doctrine].filter(Boolean).join("：")),
    ],
    "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  );
  const storyLocations = listText(
    structure?.locations.map((location) =>
      [location.name, location.narrativeFunction || location.risk || location.summary].filter(Boolean).join("："),
    ) ?? [],
    "Enter the manual to edit and add story locations suitable for the start, upgrades and transitions.",
  );
  const tensions = listText(
    [
      profile?.coreConflict,
      ...(structure?.relations.forceRelations ?? []).map((relation) =>
        [relation.relation, relation.tension || relation.detail].filter(Boolean).join("："), ), ...(structure?.rules.sharedConsequences ?? []), ], "Entering the world of contradictions that continuously create plot pressure through manual editing and supplementation." ); return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{featureFlags.worldVisEnabled ? "World Handbook and Visualization" : "World Handbook"}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={onOpenStructure}>
              <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
              Editing Manual
                                            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onOpenLayers}>
              <WandSparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              AI build
                                            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasHandbook ? (
          <>
            <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
              <div className="rounded-md border-l-2 border-primary bg-muted/30 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">World Sample</Badge>
                  {profile?.tone ? <Badge variant="outline">{profile.tone}</Badge> : null}
                  {profile?.themes?.slice(0, 4).map((theme) => (
                    <Badge key={theme} variant="outline">
                      {theme}
                    </Badge>
                  ))}
                </div>
                <div className="mt-3 text-lg font-semibold leading-7">
                  {worldPromise}
                </div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">
                  {compactText(profile?.summary, summary ?? "Add a summary of the world that creators can quickly understand.", 180)}
                </div>
                <div className="mt-3 text-sm leading-6">
                  {compactText(profile?.coreConflict, "By supplementing the core conflict, the system will more easily transform the world into a constant pressure to drive the plot.", 160)}
                </div>
              </div>

              <div className="rounded-md border bg-background p-4">
                <div className="text-sm font-medium">Available as world sample</div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                  <div>Character identity boundaries, power affiliation and taboo combinations.</div>
                  <div>Starting location, upgrade paths and sources of conflict.</div>
                  <div>Rules to keep following while writing.</div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="text-lg font-semibold">{structure?.rules.axioms.length ?? 0}</div>
                <div className="text-muted-foreground">core rules</div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="text-lg font-semibold">{(structure?.forces.length ?? 0) + (structure?.factions.length ?? 0)}</div>
                <div className="text-muted-foreground">Forces and camps</div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="text-lg font-semibold">{structure?.locations.length ?? 0}</div>
                <div className="text-muted-foreground">story location</div>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="text-lg font-semibold">
                  {(structure?.relations.forceRelations.length ?? 0) + (structure?.relations.locationControls.length ?? 0)}
                </div>
                <div className="text-muted-foreground">Relationship clues</div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <HandbookBlock icon={Sparkles} title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." items={coreRules} accent="primary" />
              <HandbookBlock icon={Castle} title="main forces" items={majorForces} />
              <HandbookBlock icon={MapPinned} title="story stage" items={storyLocations} />
              <HandbookBlock icon={GitBranch} title="critical tension" items={tensions} />
            </div>

            <HandbookBlock
              icon={ShieldAlert}
              title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
              items={[
                compactText(structure?.rules.summary, "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", 150),
                ...listText(structure?.rules.taboo ?? [], "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", 2),
              ]}
            />
          </>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
              <div className="rounded-md border-l-2 border-primary bg-muted/30 p-4">
                <Badge variant="secondary">The world manual is waiting to be formed</Badge>
                <div className="mt-3 text-lg font-semibold leading-7">
                  {compactText(summary, "Let the AI ​​or manual editor organize the world skeleton first, and then use it as a reusable world sample.", 160)}
                </div>
                <div className="mt-2 text-sm leading-6 text-muted-foreground">
                  The World Manual will organize scattered settings into rules, forces, locations and plot pressures to facilitate the author's understanding and use of this book.
                                                            </div>
              </div>

              <div className="rounded-md border bg-background p-4">
                <div className="text-sm font-medium">Suggest next steps</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={onOpenLayers}>
                    <WandSparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                    AI builds the world
                                                                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={onOpenStructure}>
                    <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                    Editing Manual
                                                                  </Button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <EmptyHandbookBlock icon={Sparkles} title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." description="Record the underlying rules, costs and taboo combinations that cannot be broken casually in the world." />
              <EmptyHandbookBlock icon={Castle} title="main forces" description="Organize the organizations, factions, interest groups, and sources of pressure that will drive the plot." />
              <EmptyHandbookBlock icon={MapPinned} title="story stage" description="Mark key locations where openings, escalations, conflicts and transitions occur." />
              <EmptyHandbookBlock icon={GitBranch} title="critical tension" description="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." />
            </div>

            {sections.length > 0 ? (
              <div className="rounded-md border p-3">
                <div className="mb-2 text-sm font-medium">Already have a set fragment</div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {sections.map((section) => (
                    <div key={section.key} className="rounded-md border bg-background p-3 text-sm">
                      <div className="mb-1 font-medium">{section.title}</div>
                      <div className="line-clamp-4 whitespace-pre-wrap text-muted-foreground">{section.content}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
        {featureFlags.worldVisEnabled ? (
          <WorldVisualizationBoard payload={visualization} />
        ) : (
          <div className="rounded-md border p-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Map className="h-4 w-4 text-primary" aria-hidden="true" />
                  World Asset Portal
                                                            </div>
                <div className="mt-1 text-sm leading-6 text-muted-foreground">
                  Maps and atlases are visual assets of the World Manual and do not participate in automatic synchronization coverage, nor do they replace the source of the rules of the World Manual.
                                                            </div>
              </div>
              <Badge variant="outline">Reserve entrance</Badge>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <WorldAssetPreviewBlock
                icon={MapPinned}
                title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
                description="Carrying area, location connection, story place and conflict heat."
                status={(structure?.locations.length ?? 0) > 0 ? "Organizable" : "Waiting point"}
              />
              <WorldAssetPreviewBlock
                icon={Network}
                title="power map"
                description="Carrying power nodes, allies and enemies, control relationships and power balance."
                status={(structure?.forces.length ?? 0) + (structure?.factions.length ?? 0) > 0 ? "Organizable" : "Forces to be filled"}
              />
              <WorldAssetPreviewBlock
                icon={Clock3}
                title="world timeline"
                description="Carrying historical events, situation changes and world progress as the novel progresses."
                status={profile?.coreConflict ? "Organizable" : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}
              />
              <WorldAssetPreviewBlock
                icon={Workflow}
                title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
                description="Carrying levels, resources, costs, taboos and breaking boundaries."
                status={(structure?.rules.axioms.length ?? 0) > 0 ? "Organizable" : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
