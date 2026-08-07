import { useEffect, useMemo, useState } from "react";
import { Castle, MapPinned, ShieldAlert, SlidersHorizontal } from "lucide-react";
import type { StoryWorldSliceOverrides, StoryWorldSliceView } from "@ai-novel/shared/types/storyWorldSlice";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DetailDisclosure } from "./workspaceShell";

export interface NovelWorldUsageCardProps {
  view?: StoryWorldSliceView | null;
  message: string;
  isRefreshing: boolean;
  isSaving: boolean;
  onRefresh: () => void;
  onSave: (patch: StoryWorldSliceOverrides) => void;
}

export interface NovelWorldUsageDraftState {
  primaryLocationId: string;
  setPrimaryLocationId: (value: string) => void;
  requiredForceIds: string[];
  setRequiredForceIds: (updater: (prev: string[]) => string[]) => void;
  requiredLocationIds: string[];
  setRequiredLocationIds: (updater: (prev: string[]) => string[]) => void;
  requiredRuleIds: string[];
  setRequiredRuleIds: (updater: (prev: string[]) => string[]) => void;
  scopeNote: string;
  setScopeNote: (value: string) => void;
  savePayload: StoryWorldSliceOverrides;
}

function toggleId(ids: string[], id: string, checked: boolean): string[] {
  const set = new Set(ids);
  if (checked) {
    set.add(id);
  } else {
    set.delete(id);
  }
  return Array.from(set);
}

function labelStoryInputSource(source: string | null | undefined): string {
  switch (source) {
    case "explicit":
      return "Story ideas from your manual input this time";
    case "story_macro":
      return "Story ideas from the story macro plan";
    case "novel_description":
      return "From the introduction of the novel";
    default:
      return "None yet";
  }
}

function namesLine(items: Array<{ name: string }>, fallback: string): string {
  if (!items.length) {
    return fallback;
  }
  return items.slice(0, 3).map((item) => item.name).join(" · ");
}

function findPrimaryLocation(view: StoryWorldSliceView | null | undefined, primaryLocationId: string): string {
  if (primaryLocationId === "__none__") {
    return view?.slice?.activeLocations[0]?.name ?? "not specified";
  }
  return view?.availableLocations.find((item) => item.id === primaryLocationId)?.name ?? "not specified";
}

function MetricItem(props: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-foreground">{props.value}</div>
      <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{props.detail}</div>
    </div>
  );
}

function OverrideGroup({
  icon: Icon,
  title,
  description,
  emptyText,
  items,
  selectedIds,
  onToggle,
}: {
  icon: typeof Castle;
  title: string;
  description: string;
  emptyText: string;
  items: Array<{ id: string; name: string; summary: string }>;
  selectedIds: string[];
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <div className="border-t border-border/60 pt-4">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
        <div>
          <div className="text-sm font-medium text-foreground">{title}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {items.length ? items.map((item) => (
          <label key={item.id} className="flex items-start gap-3 rounded-md bg-muted/20 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={selectedIds.includes(item.id)}
              onChange={(event) => onToggle(item.id, event.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block font-medium text-foreground">{item.name}</span>
              <span className="block leading-6 text-muted-foreground">{item.summary}</span>
            </span>
          </label>
        )) : <div className="text-sm text-muted-foreground">{emptyText}</div>}
      </div>
    </div>
  );
}

export function useNovelWorldUsageDraft(props: NovelWorldUsageCardProps): NovelWorldUsageDraftState {
  const [primaryLocationId, setPrimaryLocationId] = useState<string>("__none__");
  const [requiredForceIds, setRequiredForceIds] = useState<string[]>([]);
  const [requiredLocationIds, setRequiredLocationIds] = useState<string[]>([]);
  const [requiredRuleIds, setRequiredRuleIds] = useState<string[]>([]);
  const [scopeNote, setScopeNote] = useState("");

  useEffect(() => {
    setPrimaryLocationId(props.view?.overrides.primaryLocationId ?? "__none__");
    setRequiredForceIds(props.view?.overrides.requiredForceIds ?? []);
    setRequiredLocationIds(props.view?.overrides.requiredLocationIds ?? []);
    setRequiredRuleIds(props.view?.overrides.requiredRuleIds ?? []);
    setScopeNote(props.view?.overrides.scopeNote ?? "");
  }, [props.view]);

  const savePayload = useMemo<StoryWorldSliceOverrides>(() => ({
    primaryLocationId: primaryLocationId === "__none__" ? null : primaryLocationId,
    requiredForceIds,
    requiredLocationIds,
    requiredRuleIds,
    scopeNote: scopeNote.trim() || null,
  }), [primaryLocationId, requiredForceIds, requiredLocationIds, requiredRuleIds, scopeNote]);

  return {
    primaryLocationId,
    setPrimaryLocationId,
    requiredForceIds,
    setRequiredForceIds,
    requiredLocationIds,
    setRequiredLocationIds,
    requiredRuleIds,
    setRequiredRuleIds,
    scopeNote,
    setScopeNote,
    savePayload,
  };
}

export function NovelWorldUsageSummary(props: NovelWorldUsageCardProps & {
  draft: NovelWorldUsageDraftState;
  onOpenDetails?: () => void;
}) {
  const slice = props.view?.slice ?? null;
  const hasWorld = props.view?.hasWorld ?? false;
  const primaryLocation = findPrimaryLocation(props.view, props.draft.primaryLocationId);
  const boundaryText = props.draft.scopeNote.trim() || slice?.storyScopeBoundary || "After sorting, the usage boundaries of this book will be generated.";
  const canSave = hasWorld && Boolean(props.view);

  return (
    <section id="novel-world-usage" className="rounded-2xl bg-background/80 p-4 shadow-sm ring-1 ring-border/35">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Chapter generation usage scope
                                </div>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">
            {slice ? "These rules, factions, and locations will be prioritized for character, outline, and chapter generation." : hasWorld ? "First organize the world scope that this book will actually use to avoid chapter generation reading too many irrelevant settings." : "Create or import the world of this book first, then organize the scope that will be read by generation."}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={props.onRefresh} disabled={!hasWorld || props.isRefreshing}>
            {props.isRefreshing ? "In progress..." : "Refreshing the scope of this book"}
          </Button>
          <Button type="button" variant="ghost" onClick={props.onOpenDetails} disabled={!hasWorld}>
            <SlidersHorizontal className="size-4" />
            Adjust reservations
                                </Button>
        </div>
      </div>

      {props.message ? (
        <div className="mt-3 rounded-md bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
          {props.message}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <MetricItem label="main stage" value={primaryLocation} detail={props.view?.worldName ?? "Waiting for the book world"} />
        <MetricItem
          label="Active forces"
          value={`${slice?.activeForces.length ?? 0} 个`}
          detail={namesLine(slice?.activeForces ?? [], "Display after sorting")}
        />
        <MetricItem
          label="story location"
          value={`${slice?.activeLocations.length ?? 0} 处`}
          detail={namesLine(slice?.activeLocations ?? [], "Display after sorting")}
        />
        <MetricItem
          label="hard rules"
          value={`${slice?.appliedRules.length ?? 0} 条`}
          detail={namesLine(slice?.appliedRules ?? [], "Display after sorting")}
        />
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-border/50 pt-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 text-sm leading-6 text-muted-foreground">
          <span className="font-medium text-foreground">Border:</span>
          <span className="line-clamp-2">{boundaryText}</span>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!canSave || props.isSaving}
          onClick={() => props.onSave(props.draft.savePayload)}
        >
          {props.isSaving ? "Saving..." : "Saving reserved items"}
        </Button>
      </div>
    </section>
  );
}

export function NovelWorldUsageDetails(props: NovelWorldUsageCardProps & {
  draft: NovelWorldUsageDraftState;
}) {
  const slice = props.view?.slice ?? null;
  const hasWorld = props.view?.hasWorld ?? false;
  const hasSlice = Boolean(slice);
  const canSave = hasWorld && Boolean(props.view);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-lg font-semibold text-foreground">Generate usage scope</div>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            This confirms the rules, forces, and locations that chapter generation will actually load. You can specify only a few items that must be retained, and let the system trim the rest according to the direction of the book.
                                </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={props.onRefresh} disabled={!hasWorld || props.isRefreshing}>
            {props.isRefreshing ? "Refreshing..." : "Refreshing the scope of use"}
          </Button>
          <Button type="button" onClick={() => props.onSave(props.draft.savePayload)} disabled={!canSave || props.isSaving}>
            {props.isSaving ? "Saving..." : "Saving reserved items"}
          </Button>
        </div>
      </div>

      {props.message ? (
        <div className="rounded-md bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
          {props.message}
        </div>
      ) : null}

      {!hasWorld ? (
        <div className="rounded-md border border-dashed border-border/70 px-4 py-4 text-sm leading-6 text-muted-foreground">
          This novel does not yet have a book world. First import it from the world library, or generate a world based on the theme of this book, and then organize the rules, forces and locations that will be used in the current story.
                          </div>
      ) : null}

      {hasWorld ? (
        <div className="grid gap-4 md:grid-cols-2">
          <MetricItem label="book world" value={props.view?.worldName ?? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."} detail="Chapter generation reads a world copy of the book." />
          <MetricItem label="Source of story ideas" value={labelStoryInputSource(props.view?.storyInputSource)} detail="The usage range is tailored to the current story direction." />
        </div>
      ) : null}

      {slice ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
          <section className="space-y-5">
            <div>
              <div className="text-sm font-medium text-foreground">World background</div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">{slice.coreWorldFrame || "None available"}</div>
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">Organizations that will be used</div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                {namesLine(slice.activeForces, "None")}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">Places that will be used</div>
              <div className="mt-2 text-sm leading-6 text-muted-foreground">
                {namesLine(slice.activeLocations, "None")}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">core rules</div>
              <div className="mt-2 space-y-3">
                {slice.appliedRules.length > 0 ? slice.appliedRules.map((item) => (
                  <div key={item.id} className="border-t border-border/50 pt-3 text-sm">
                    <div className="font-medium text-foreground">{item.name}</div>
                    <div className="mt-1 leading-6 text-muted-foreground">{item.summary}</div>
                  </div>
                )) : <div className="text-sm text-muted-foreground">None yet</div>}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">Sources of pressure</div>
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                {slice.pressureSources.length > 0 ? slice.pressureSources.map((item) => (
                  <div key={item}>{item}</div>
                )) : <div>None yet</div>}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">Borders not to cross</div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">{slice.storyScopeBoundary || "None available"}</div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl bg-muted/15 p-4">
            <div>
              <div className="text-sm font-medium text-foreground">Manually reserved items</div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">
                Only a small amount of content is specified here that must appear or be adhered to. There is no need to refill the entire world.
                                            </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">main stage</label>
              <Select value={props.draft.primaryLocationId} onValueChange={props.draft.setPrimaryLocationId}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No additional specification</SelectItem>
                  {props.view?.availableLocations.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DetailDisclosure title="Organizations, places and rules that must be preserved" description="Suitable for starting locations, key allies, major enemies, and the cost of strength that cannot be breached.">
              <div className="space-y-4">
                <OverrideGroup
                  icon={Castle}
                  title="Organizations that must be retained"
                  description="The protagonist’s origin, main enemies, and key allies are forces that cannot be missed in the early stage."
                  emptyText="There are no optional organizations in the world of this book yet."
                  items={props.view?.availableForces ?? []}
                  selectedIds={props.draft.requiredForceIds}
                  onToggle={(id, checked) => props.draft.setRequiredForceIds((prev) => toggleId(prev, id, checked))}
                />
                <OverrideGroup
                  icon={MapPinned}
                  title="Places that must be reserved"
                  description="The starting point, the trial place, the place where conflict breaks out and the stage that readers need to remember again and again."
                  emptyText="There are no optional locations in this book's world yet."
                  items={props.view?.availableLocations ?? []}
                  selectedIds={props.draft.requiredLocationIds}
                  onToggle={(id, checked) => props.draft.setRequiredLocationIds((prev) => toggleId(prev, id, checked))}
                />
                <OverrideGroup
                  icon={ShieldAlert}
                  title="rules that must be followed"
                  description="The price of power, identity taboos and boundaries that cannot be broken through by the plot."
                  emptyText="There are no optional rules in the world of this book yet."
                  items={props.view?.availableRules ?? []}
                  selectedIds={props.draft.requiredRuleIds}
                  onToggle={(id, checked) => props.draft.setRequiredRuleIds((prev) => toggleId(prev, id, checked))}
                />
              </div>
            </DetailDisclosure>

            <div>
              <label className="text-sm font-medium text-foreground" htmlFor="story-world-scope-note">
                Boundary instructions not to cross the line in the early stage
                                            </label>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">
                You can add a boundary, such as "Keep the realistic urban base and don't turn it into a fantasy upgrade novel."
                                            </div>
              <textarea
                id="story-world-scope-note"
                value={props.draft.scopeNote}
                onChange={(event) => props.draft.setScopeNote(event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="For example: retain the realistic business environment and character oppression of the original work, and do not introduce a supernatural system."
              />
            </div>
          </section>
        </div>
      ) : null}

      {hasWorld && !hasSlice ? (
        <div className="rounded-md border border-dashed border-border/70 px-4 py-4 text-sm leading-6 text-muted-foreground">
          The book has not yet sorted out the scope of the world that the current story will use. After clicking "Organize the scope of use of this book", a confirmable version of the rules, forces, and location scope will be generated based on the book's world and story ideas.
                          </div>
      ) : null}
    </div>
  );
}

export default function NovelWorldUsageCard(props: NovelWorldUsageCardProps) {
  const draft = useNovelWorldUsageDraft(props);

  return (
    <div className="space-y-4">
      <NovelWorldUsageSummary {...props} draft={draft} />
      <DetailDisclosure title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." description="Review and adjust world constraints that must be preserved early in the book.">
        <NovelWorldUsageDetails {...props} draft={draft} />
      </DetailDisclosure>
    </div>
  );
}
