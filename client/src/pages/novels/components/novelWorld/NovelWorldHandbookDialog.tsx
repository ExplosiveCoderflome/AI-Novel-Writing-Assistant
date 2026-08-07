import { Link } from "react-router-dom";
import { BookOpen, GitCompareArrows, GitFork, Library, Map, Network, Workflow } from "lucide-react";
import type {
  NovelWorldAssetSummary,
  NovelWorldHandbook,
  NovelWorldSummary,
  NovelWorldSyncDiff,
  NovelWorldSyncInput,
  NovelWorldSyncRecordSummary,
} from "@ai-novel/shared/types/novelWorld";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { DetailDisclosure } from "../workspaceShell";
import {
  NovelWorldUsageDetails,
  type NovelWorldUsageCardProps,
  type NovelWorldUsageDraftState,
} from "../NovelWorldUsageCard";
import NovelWorldSourcePanel, { type WorldOption } from "./NovelWorldSourcePanel";

export type NovelWorldDialogTab = "overview" | "rules" | "guidance" | "usage" | "sync";

interface NovelWorldHandbookDialogProps {
  open: boolean;
  activeTab: NovelWorldDialogTab;
  onOpenChange: (open: boolean) => void;
  onTabChange: (tab: NovelWorldDialogTab) => void;
  novelWorld: NovelWorldSummary | null;
  handbook: NovelWorldHandbook | null;
  worldAssets: NovelWorldAssetSummary[];
  syncHistory: NovelWorldSyncRecordSummary[];
  syncDiff: NovelWorldSyncDiff | null;
  activeWorldName: string;
  worldOptions: WorldOption[];
  selectedWorldId: string;
  isImporting: boolean;
  isGenerating: boolean;
  isCreatingManual: boolean;
  isSavingToLibrary: boolean;
  isLoadingSyncDiff: boolean;
  isSyncing: boolean;
  selectedSyncSections: NovelWorldSyncInput["sections"];
  onSelectedSyncSectionsChange: (sections: NovelWorldSyncInput["sections"]) => void;
  onImport: Parameters<typeof NovelWorldSourcePanel>[0]["onImport"];
  onCreateManual: Parameters<typeof NovelWorldSourcePanel>[0]["onCreateManual"];
  onGenerate: Parameters<typeof NovelWorldSourcePanel>[0]["onGenerate"];
  onSaveToLibrary: () => void;
  onSync: (payload: NovelWorldSyncInput) => void;
  usageProps: NovelWorldUsageCardProps;
  usageDraft: NovelWorldUsageDraftState;
}

const ASSET_ICON_BY_TYPE: Record<NovelWorldAssetSummary["assetType"], typeof BookOpen> = { map: Map, faction_diagram: Network, timeline: GitFork, character_network: GitCompareArrows, power_system_tree: Workflow, }; function labelSourceType(sourceType: string | null | undefined): string { switch (sourceType) { case "imported": return "from world repository"; case "generated": return "generated from this book"; case "manual": return "custom world"; default: return "not set"; } } function labelSyncDirection(direction: string | null | undefined): string { switch (direction) { case "push": return "push only to world repository"; case "pull": return "pull only from world repository"; case "bidirectional": return "bidirectional synchronization possible"; default: return "not synchronized"; } } function sectionLabel(section: string): string { switch (section) { case "profile": return "world overview"; case "rules": return "core rules"; case "factions": return "factions"; case "forces": return "forces"; case "locations": return "locations"; case "relations": return "relations network"; default: return section; } } function labelAssetStatus(status: string, hasRenderData: boolean): string { if (hasRenderData || status === "ready") { return "viewable"; } switch (status) { case "draft": return "drafting"; case "archived": return "archived"; default: return "to be generated"; } } function assetReadinessHint(assetType: NovelWorldAssetSummary["assetType"]): string { switch (assetType) { case "map": return "After adding story stage and location risks, the map can show the region and conflict landing point."; case "faction_diagram": return "After adding major forces, objectives and pressures, the map can show faction relationships."; case "timeline": return "After adding core conflicts and common consequences, the timeline can show the situation changes."; case "character_network": return "After supplementing faction affiliation and alignment pressure, character relationships will be more in line with the world."; case "power_system_tree": return "After supplementing core rules, costs, and boundaries, the system tree can avoid becoming a hierarchy table."; default: return "First supplement the world manual, then organize the visual assets."; } } function formatSyncTime(value: string | null | undefined): string | null { if (!value) { return null; } const date = new Date(value); if (Number.isNaN(date.getTime())) { return null; } return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", }); } function InlineMeta(props: { items: Array<string | null | undefined> }) {
  const items = props.items.filter((item): item is string => Boolean(item));
  if (!items.length) {
    return null;
  }
  return <div className="mt-3 text-xs leading-5 text-muted-foreground">{items.join(" · ")}</div>;
}

function SectionTitle(props: { title: string; description?: string }) {
  return (
    <div>
      <div className="text-base font-semibold text-foreground">{props.title}</div>
      {props.description ? <div className="mt-1 text-sm leading-6 text-muted-foreground">{props.description}</div> : null}
    </div>
  );
}

function EmptyLine(props: { children: string }) {
  return <div className="rounded-md border border-dashed border-border/70 px-3 py-2 text-sm text-muted-foreground">{props.children}</div>;
}

function WorldOverviewTab(props: {
  novelWorld: NovelWorldSummary | null;
  handbook: NovelWorldHandbook | null;
  activeWorldName: string;
}) {
  const { novelWorld, handbook } = props;

  return (
    <div className="space-y-8">
      <section>
        <SectionTitle title="world overview" description="This displays facade information about the book's world to help you determine whether it supports the current story." />
        <div className="mt-4 rounded-2xl bg-muted/15 p-5">
          <div className="text-xs text-muted-foreground">
            {novelWorld ? labelSourceType(novelWorld.sourceType) : "Source not set"} · {novelWorld?.hasStorySlice ? "Writing scope organized" : "Writing scope awaiting organization"}
          </div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{props.activeWorldName}</div>
          <div className="mt-3 max-w-4xl text-base leading-8 text-muted-foreground">
            {handbook?.summary ?? novelWorld?.coverSummary ?? "The world of this book is in preparation."}
          </div>
          <InlineMeta items={[
            handbook?.identity ? `身份：${handbook.identity}` : null,
            handbook?.tone ? `气质：${handbook.tone}` : null,
            ...(handbook?.themes.slice(0, 4) ?? []),
          ]} />
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div>
          <SectionTitle title="main forces" />
          <div className="mt-3 space-y-3">
            {(handbook?.forces.length ? handbook.forces : handbook?.factions ?? []).slice(0, 8).map((item) => (
              <div key={item.name} className="border-t border-border/50 pt-3 text-sm">
                <div className="font-medium text-foreground">{item.name}</div>
                <div className="mt-1 leading-6 text-muted-foreground">
                  {"pressure" in item && item.pressure ? item.pressure : null}
                  {"doctrine" in item && item.doctrine ? item.doctrine : null}
                  {"summary" in item && item.summary ? item.summary : null}
                  {"narrativeRole" in item && item.narrativeRole ? ` · ${item.narrativeRole}` : null}
                </div>
              </div>
            ))}
            {(!handbook || (handbook.forces.length === 0 && handbook.factions.length === 0)) ? <EmptyLine>There is no clear force yet.</EmptyLine> : null}
          </div>
        </div>
        <div>
          <SectionTitle title="story stage" />
          <div className="mt-3 space-y-3">
            {handbook?.locations.slice(0, 8).map((location) => (
              <div key={location.name} className="border-t border-border/50 pt-3 text-sm">
                <div className="font-medium text-foreground">{location.name}</div>
                <div className="mt-1 leading-6 text-muted-foreground">
                  {location.narrativeFunction || location.summary || "No description yet"}
                  {location.risk ? ` · 风险：${location.risk}` : null}
                </div>
              </div>
            ))}
            {!handbook?.locations.length ? <EmptyLine>There is no clear story stage yet.</EmptyLine> : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function RulesTab(props: { handbook: NovelWorldHandbook | null }) {
  const handbook = props.handbook;

  return (
    <div className="space-y-8">
      <section>
        <SectionTitle title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." description="Chapter generation will prioritize adhering to these hard rules to avoid improvising inconsistent settings." />
        <div className="mt-4 space-y-4">
          {handbook?.coreRules.length ? handbook.coreRules.map((rule) => (
            <div key={`${rule.name}-${rule.summary}`} className="border-t border-border/60 pt-4">
              <div className="text-sm font-medium text-foreground">{rule.name}</div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">{rule.summary || "No description yet"}</div>
              <InlineMeta items={[
                rule.cost ? `代价：${rule.cost}` : null,
                rule.boundary ? `边界：${rule.boundary}` : null,
              ]} />
            </div>
          )) : <EmptyLine>There are no clear core rules yet.</EmptyLine>}
        </div>
      </section>

      <section>
        <SectionTitle title="critical tension" description="These long-term contradictions will help outlines and chapters maintain world pressure." />
        <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
          {handbook?.tensions.length ? handbook.tensions.map((tension) => (
            <div key={tension} className="border-t border-border/50 pt-2">{tension}</div>
          )) : <EmptyLine>There is no clear long-term conflict.</EmptyLine>}
        </div>
      </section>
    </div>
  );
}

function GuidanceTab(props: { handbook: NovelWorldHandbook | null }) {
  const guidance = props.handbook?.generationGuidance ?? null;
  const groups = [
    { title: "role identity boundaries", items: guidance?.characterUses ?? [] },
    { title: "story scope clues", items: guidance?.outlineUses ?? [] },
    { title: "Scene rule constraints", items: guidance?.chapterUses ?? [] },
    { title: "Crossing the line to avoid", items: guidance?.avoidUses ?? [] },
  ];

  return (
    <div className="space-y-6">
      <SectionTitle title="Generate constraints" description="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." />
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <section key={group.title} className="rounded-xl bg-muted/15 p-4">
            <div className="text-sm font-medium text-foreground">{group.title}</div>
            <div className="mt-3 space-y-2">
              {group.items.length > 0 ? group.items.slice(0, 6).map((item) => (
                <div key={item} className="text-sm leading-6 text-muted-foreground">{item}</div>
              )) : (
                <div className="text-sm leading-6 text-muted-foreground">No clear reminder yet.</div>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function AssetsPanel(props: { worldAssets: NovelWorldAssetSummary[] }) {
  return (
    <section>
      <SectionTitle title="world assets" description="Maps, power maps, timelines, and system trees are used to help you see the world, and are not the only source of chapter generation." />
      {props.worldAssets.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {props.worldAssets.map((asset) => {
            const Icon = ASSET_ICON_BY_TYPE[asset.assetType] ?? BookOpen;
            return (
              <div key={asset.assetType} className="rounded-xl bg-muted/15 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  {asset.title}
                </div>
                <div className="mt-2 text-xs leading-5 text-muted-foreground">{asset.description}</div>
                <div className="mt-2 text-xs leading-5 text-muted-foreground">{assetReadinessHint(asset.assetType)}</div>
                <div className="mt-3 text-xs text-muted-foreground">{labelAssetStatus(asset.status, asset.hasRenderData)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-3">
          <EmptyLine>The world asset entries will be organized together with this world manual.</EmptyLine>
        </div>
      )}
    </section>
  );
}

function SyncPanel(props: Pick<NovelWorldHandbookDialogProps,
  "novelWorld" | "syncDiff" | "syncHistory" | "isLoadingSyncDiff" | "isSyncing" |
  "selectedSyncSections" | "onSelectedSyncSectionsChange" | "onSync"
>) {
  const { novelWorld, syncDiff } = props;
  const hasSyncDiff = Boolean(syncDiff?.differences.length);
  const effectiveSyncSections = props.selectedSyncSections && props.selectedSyncSections.length > 0
    ? props.selectedSyncSections
    : syncDiff?.differences.map((item) => item.section);
  const selectedSectionCount = effectiveSyncSections?.length ?? 0;

  if (!novelWorld?.sourceWorldId) {
    return null;
  }

  return (
    <section id="novel-world-sync">
      <SectionTitle
        title="Synchronization management"
        description="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
      />
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-muted/15 p-3">
          <div className="text-xs text-muted-foreground">Diff check</div>
          <div className="mt-1 text-sm font-medium text-foreground">
            {props.isLoadingSyncDiff ? "Checking" : syncDiff ? "Check complete" : "Waiting for check"}
          </div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">
            {syncDiff?.differenceCount ? `${syncDiff.differenceCount} 个分区存在差异。` : syncDiff ? "No partition differences were found that needed to be addressed." : "A summary of the differences is read when opening the book world."}
          </div>
        </div>
        <div className="rounded-xl bg-muted/15 p-3">
          <div className="text-xs text-muted-foreground">Select partition</div>
          <div className="mt-1 text-sm font-medium text-foreground">{hasSyncDiff ? `${selectedSectionCount} 个分区` : "No need to choose"}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">Only sync the profiles, rules, forces, locations or relationships you have confirmed.</div>
        </div>
        <div className="rounded-xl bg-muted/15 p-3">
          <div className="text-xs text-muted-foreground">Manual synchronization</div>
          <div className="mt-1 text-sm font-medium text-foreground">{novelWorld.syncEnabled ? labelSyncDirection(novelWorld.syncDirection) : "independent copy"}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">Pushing will change the world library sample; pulling will change the world copy of this book.</div>
        </div>
      </div>

      {!syncDiff?.differences.length && novelWorld.syncPendingSummary ? (
        <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground whitespace-pre-line">
          {novelWorld.syncPendingSummary}
        </div>
      ) : null}

      {!novelWorld.syncEnabled ? (
        <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          The world of this book will be available as a stand-alone copy. When synchronization is required, you can manually push the book world or pull the world library content.
                          </div>
      ) : null}

      {syncDiff?.canSync === false ? (
        <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          {syncDiff.reason ?? "Unable to synchronize at the moment."}
        </div>
      ) : syncDiff?.differences.length ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            {syncDiff.differences.map((item) => {
              const checked = !props.selectedSyncSections?.length || props.selectedSyncSections.includes(item.section);
              return (
                <label key={item.section} className="flex items-start gap-3 rounded-md bg-muted/20 p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={(event) => {
                      const current = props.selectedSyncSections && props.selectedSyncSections.length > 0
                        ? props.selectedSyncSections
                        : syncDiff.differences.map((diff) => diff.section);
                      props.onSelectedSyncSectionsChange(event.target.checked
                        ? Array.from(new Set([...current, item.section]))
                        : current.filter((section) => section !== item.section));
                    }}
                  />
                  <span>
                    <span className="font-medium text-foreground">{item.label}</span>
                    <span className="mt-1 block text-muted-foreground">{item.summary}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={props.isSyncing || !effectiveSyncSections?.length} onClick={() => props.onSync({ direction: "pull", sections: effectiveSyncSections })}>
              {props.isSyncing ? "Syncing..." : "Pulling world library updates"}
            </Button>
            <Button type="button" variant="secondary" disabled={props.isSyncing || !effectiveSyncSections?.length} onClick={() => props.onSync({ direction: "push", sections: effectiveSyncSections })}>
              {props.isSyncing ? "Syncing..." : "Pushing changes to this book"}
            </Button>
            <Button type="button" variant="outline" disabled={props.isSyncing} onClick={() => props.onSync({ direction: "none" })}>
              Turn off sync
                                          </Button>
          </div>
        </div>
      ) : !novelWorld.syncEnabled ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={props.isSyncing} onClick={() => props.onSync({ direction: "pull" })}>
            {props.isSyncing ? "Syncing..." : "Fetching world library content"}
          </Button>
          <Button type="button" variant="secondary" disabled={props.isSyncing} onClick={() => props.onSync({ direction: "push" })}>
            {props.isSyncing ? "Syncing..." : "Pushing this book's world"}
          </Button>
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          The world in this book is consistent with the world library samples.
                                      </div>
      )}

      {props.syncHistory.length > 0 ? (
        <DetailDisclosure title="Recently synced" description="View the most recent active synchronization records." className="mt-4">
          <div className="space-y-2">
            {props.syncHistory.map((record) => (
              <div key={record.id} className="text-xs leading-5 text-muted-foreground">
                <span className="font-medium text-foreground">{record.direction === "pull" ? "pull" : "push"}</span>
                <span> · {formatSyncTime(record.createdAt) ?? record.createdAt}</span>
                {record.syncedSections.length > 0 ? <span> · {record.syncedSections.map(sectionLabel).join("、")}</span> : null}
                {record.diffSummary ? <span className="block">{record.diffSummary}</span> : null}
              </div>
            ))}
          </div>
        </DetailDisclosure>
      ) : null}
    </section>
  );
}

function SourceAndLibraryPanel(props: Pick<NovelWorldHandbookDialogProps,
  "novelWorld" | "worldOptions" | "selectedWorldId" | "isImporting" | "isGenerating" |
  "isCreatingManual" | "isSavingToLibrary" | "onImport" | "onCreateManual" | "onGenerate" | "onSaveToLibrary"
>) {
  return (
    <section>
      <SectionTitle title="Sources and World Library" description="Import from the world library, generate from this book, or save this book's world as a reusable sample." />
      {props.novelWorld && !props.novelWorld.sourceWorldId ? (
        <div className="mt-4 flex flex-col gap-3 rounded-xl bg-muted/15 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-medium text-foreground">Save to world library</div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              Save the world of this book as a reusable sample, and later you can push the book to modify or pull the world library content.
                                      </div>
          </div>
          <Button type="button" variant="secondary" disabled={props.isSavingToLibrary} onClick={() => props.onSaveToLibrary()}>
            <Library className="size-4" />
            {props.isSavingToLibrary ? "Saving..." : "Saving to World Library"}
          </Button>
        </div>
      ) : null}

      <DetailDisclosure
        title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
        description="Import from the world library, generate from this book, or create a custom world skeleton first."
        meta={props.novelWorld ? "Replace as needed" : "To be selected"}
        defaultOpen={!props.novelWorld}
        className="mt-4"
      >
        <div id="novel-world-source">
          <NovelWorldSourcePanel
            worldOptions={props.worldOptions}
            selectedWorldId={props.selectedWorldId}
            isImporting={props.isImporting}
            isGenerating={props.isGenerating}
            isCreatingManual={props.isCreatingManual}
            onImport={props.onImport}
            onCreateManual={props.onCreateManual}
            onGenerate={props.onGenerate}
          />
        </div>
      </DetailDisclosure>
    </section>
  );
}

export function NovelWorldHandbookDialog(props: NovelWorldHandbookDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogContent
        title={props.activeWorldName}
        description="See the world manual, build constraints, and scope of use in this book. The content here will serve the purpose of character, outline, and chapter generation."
        className="h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] xl:max-w-7xl"
        bodyClassName="overflow-hidden p-0"
      >
        <Tabs value={props.activeTab} onValueChange={(value) => props.onTabChange(value as NovelWorldDialogTab)} className="grid h-full min-h-0 lg:grid-cols-[220px_minmax(0,1fr)]">
          <TabsList className={cn(
            "m-0 h-auto justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent p-3",
            "lg:flex lg:flex-col lg:items-stretch lg:overflow-visible lg:border-b-0 lg:border-r",
          )}>
            {[
              ["overview", "world overview"],
              ["rules", "Rules and tension"],
              ["guidance", "Generate constraints"],
              ["usage", "Scope of use"],
              ["sync", "Sync and Assets"],
            ].map(([value, label]) => (
              <TabsTrigger key={value} value={value} className="justify-start data-[state=active]:bg-muted">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="min-h-0 overflow-y-auto px-5 py-5">
            <TabsContent value="overview" className="mt-0">
              <WorldOverviewTab novelWorld={props.novelWorld} handbook={props.handbook} activeWorldName={props.activeWorldName} />
            </TabsContent>
            <TabsContent value="rules" className="mt-0">
              <RulesTab handbook={props.handbook} />
            </TabsContent>
            <TabsContent value="guidance" className="mt-0">
              <GuidanceTab handbook={props.handbook} />
            </TabsContent>
            <TabsContent value="usage" className="mt-0">
              <NovelWorldUsageDetails {...props.usageProps} draft={props.usageDraft} />
            </TabsContent>
            <TabsContent value="sync" className="mt-0 space-y-8">
              {props.novelWorld?.sourceWorldId ? (
                <Button asChild size="sm" variant="outline">
                  <Link to={`/worlds/${props.novelWorld.sourceWorldId}/workspace`}>Open source world manual</Link>
                </Button>
              ) : null}
              <AssetsPanel worldAssets={props.worldAssets} />
              <SyncPanel
                novelWorld={props.novelWorld}
                syncDiff={props.syncDiff}
                syncHistory={props.syncHistory}
                isLoadingSyncDiff={props.isLoadingSyncDiff}
                isSyncing={props.isSyncing}
                selectedSyncSections={props.selectedSyncSections}
                onSelectedSyncSectionsChange={props.onSelectedSyncSectionsChange}
                onSync={props.onSync}
              />
              <SourceAndLibraryPanel
                novelWorld={props.novelWorld}
                worldOptions={props.worldOptions}
                selectedWorldId={props.selectedWorldId}
                isImporting={props.isImporting}
                isGenerating={props.isGenerating}
                isCreatingManual={props.isCreatingManual}
                isSavingToLibrary={props.isSavingToLibrary}
                onImport={props.onImport}
                onCreateManual={props.onCreateManual}
                onGenerate={props.onGenerate}
                onSaveToLibrary={props.onSaveToLibrary}
              />
            </TabsContent>
          </div>
        </Tabs>
      </AppDialogContent>
    </Dialog>
  );
}
