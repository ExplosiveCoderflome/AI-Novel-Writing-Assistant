import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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

const ASSET_ICON_BY_TYPE: Record<NovelWorldAssetSummary["assetType"], typeof BookOpen> = {
  map: Map,
  faction_diagram: Network,
  timeline: GitFork,
  character_network: GitCompareArrows,
  power_system_tree: Workflow,
};

function labelSourceType(sourceType: string | null | undefined): string {
  switch (sourceType) {
    case "imported":
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_d6c97812");
    case "generated":
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_b7ab0cfd");
    case "manual":
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_c1c6046e");
    default:
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_fe2d26a2");
  }
}

function labelSyncDirection(direction: string | null | undefined): string {
  switch (direction) {
    case "push":
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_3c11209d");
    case "pull":
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_697b6277");
    case "bidirectional":
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_cc89795c");
    default:
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_db709d59");
  }
}

function sectionLabel(section: string): string {
  switch (section) {
    case "profile":
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.worldOverview");
    case "rules":
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_0a431a82");
    case "factions":
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_42988d4b");
    case "forces":
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_dcfe557b");
    case "locations":
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_fc1a7d3c");
    case "relations":
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_bb016fed");
    default:
      return section;
  }
}

function labelAssetStatus(status: string, hasRenderData: boolean): string {
  if (hasRenderData || status === "ready") {
    return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_11b9933a");
  }
  switch (status) {
    case "draft":
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_cb581fad");
    case "archived":
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_c3ba167c");
    default:
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_418dde27");
  }
}

function assetReadinessHint(assetType: NovelWorldAssetSummary["assetType"]): string {
  switch (assetType) {
    case "map":
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_fc446dfe");
    case "faction_diagram":
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_fa8f91a9");
    case "timeline":
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_5a00ad9e");
    case "character_network":
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_46d0ecca");
    case "power_system_tree":
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_ebf5b93c");
    default:
      return t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_b9d7c980");
  }
}

function formatSyncTime(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function InlineMeta(props: { items: Array<string | null | undefined> }) {
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
        <SectionTitle title={t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_61ae07e0")} description={t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_874e945e")} />
        <div className="mt-4 rounded-2xl bg-muted/15 p-5">
          <div className="text-xs text-muted-foreground">
            {novelWorld ? labelSourceType(novelWorld.sourceType) : t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_7527f578")} · {novelWorld?.hasStorySlice ? t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_3f18376e") : t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_2e682702")}
          </div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{props.activeWorldName}</div>
          <div className="mt-3 max-w-4xl text-base leading-8 text-muted-foreground">
            {handbook?.summary ?? novelWorld?.coverSummary ?? t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_4ad23ded")}
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
          <SectionTitle title={t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.majorForce")} />
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
            {(!handbook || (handbook.forces.length === 0 && handbook.factions.length === 0)) ? <EmptyLine>{t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_73f75df3")}</EmptyLine> : null}
          </div>
        </div>
        <div>
          <SectionTitle title={t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_bf876a86")} />
          <div className="mt-3 space-y-3">
            {handbook?.locations.slice(0, 8).map((location) => (
              <div key={location.name} className="border-t border-border/50 pt-3 text-sm">
                <div className="font-medium text-foreground">{location.name}</div>
                <div className="mt-1 leading-6 text-muted-foreground">
                  {location.narrativeFunction || location.summary || t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_67a21991")}
                  {location.risk ? ` · 风险：${location.risk}` : null}
                </div>
              </div>
            ))}
            {!handbook?.locations.length ? <EmptyLine>{t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_7e4d987e")}</EmptyLine> : null}
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
        <SectionTitle title={t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_b68f57f0")} description={t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_54f024b5")} />
        <div className="mt-4 space-y-4">
          {handbook?.coreRules.length ? handbook.coreRules.map((rule) => (
            <div key={`${rule.name}-${rule.summary}`} className="border-t border-border/60 pt-4">
              <div className="text-sm font-medium text-foreground">{rule.name}</div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">{t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_a227c868")}</div>
              <InlineMeta items={[
                rule.cost ? `代价：${rule.cost}` : null,
                rule.boundary ? `边界：${rule.boundary}` : null,
              ]} />
            </div>
          )) : <EmptyLine>{t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_5f599bff")}</EmptyLine>}
        </div>
      </section>

      <section>
        <SectionTitle title={t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_b7cadb8f")} description={t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_575332b5")} />
        <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
          {handbook?.tensions.length ? handbook.tensions.map((tension) => (
            <div key={tension} className="border-t border-border/50 pt-2">{tension}</div>
          )) : <EmptyLine>{t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_f0a49433")}</EmptyLine>}
        </div>
      </section>
    </div>
  );
}

function GuidanceTab(props: { handbook: NovelWorldHandbook | null }) {
  const guidance = props.handbook?.generationGuidance ?? null;
  const groups = [
    { title: t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_3b750fe1"), items: guidance?.characterUses ?? [] },
    { title: t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_5d2d0cf8"), items: guidance?.outlineUses ?? [] },
    { title: t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_e38b93f6"), items: guidance?.chapterUses ?? [] },
    { title: t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_186ea5c7"), items: guidance?.avoidUses ?? [] },
  ];

  return (
    <div className="space-y-6">
      <SectionTitle title={t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_f95045c7")} description={t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_50805ded")} />
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <section key={group.title} className="rounded-xl bg-muted/15 p-4">
            <div className="text-sm font-medium text-foreground">{group.title}</div>
            <div className="mt-3 space-y-2">
              {group.items.length > 0 ? group.items.slice(0, 6).map((item) => (
                <div key={item} className="text-sm leading-6 text-muted-foreground">{item}</div>
              )) : (
                <div className="text-sm leading-6 text-muted-foreground">{t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_cfca02eb")}</div>
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
      <SectionTitle title={t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_790cc6f1")} description={t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_e0796d7a")} />
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
          <EmptyLine>{t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_a65fcfff")}</EmptyLine>
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
        title={t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_5e5b3e8f")}
        description={t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_8202c4b2")}
      />
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-muted/15 p-3">
          <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_1a4fadb7")}</div>
          <div className="mt-1 text-sm font-medium text-foreground">
            {props.isLoadingSyncDiff ? t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_69ac5a39") : syncDiff ? t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_6d24e672") : t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_c52ee445")}
          </div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">
            {syncDiff?.differenceCount ? `${syncDiff.differenceCount} 个分区存在差异。` : syncDiff ? t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_dd674fee") : t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_5ef22e67")}
          </div>
        </div>
        <div className="rounded-xl bg-muted/15 p-3">
          <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_fe5f67de")}</div>
          <div className="mt-1 text-sm font-medium text-foreground">{hasSyncDiff ? `${selectedSectionCount} 个分区` : t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_27b15041")}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_480e8e5a")}</div>
        </div>
        <div className="rounded-xl bg-muted/15 p-3">
          <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_0b19c25e")}</div>
          <div className="mt-1 text-sm font-medium text-foreground">{t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_b59a9121")}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_207891c0")}</div>
        </div>
      </div>

      {!syncDiff?.differences.length && novelWorld.syncPendingSummary ? (
        <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground whitespace-pre-line">
          {novelWorld.syncPendingSummary}
        </div>
      ) : null}

      {!novelWorld.syncEnabled ? (
        <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          本书世界会作为独立副本使用。需要同步时，可以手动推送本书世界或拉取世界库内容。
        </div>
      ) : null}

      {syncDiff?.canSync === false ? (
        <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          {syncDiff.reason ?? t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_37d6b411")}
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
              {props.isSyncing ? t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_f787f452") : t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_0c2f1d64")}
            </Button>
            <Button type="button" variant="secondary" disabled={props.isSyncing || !effectiveSyncSections?.length} onClick={() => props.onSync({ direction: "push", sections: effectiveSyncSections })}>
              {props.isSyncing ? t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_f787f452") : t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_a7b36193")}
            </Button>
            <Button type="button" variant="outline" disabled={props.isSyncing} onClick={() => props.onSync({ direction: "none" })}>
              关闭同步
            </Button>
          </div>
        </div>
      ) : !novelWorld.syncEnabled ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={props.isSyncing} onClick={() => props.onSync({ direction: "pull" })}>
            {props.isSyncing ? t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_f787f452") : t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_a1c8e949")}
          </Button>
          <Button type="button" variant="secondary" disabled={props.isSyncing} onClick={() => props.onSync({ direction: "push" })}>
            {props.isSyncing ? t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_f787f452") : t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_b98c9cfc")}
          </Button>
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          本书世界和世界库样本保持一致。
        </div>
      )}

      {props.syncHistory.length > 0 ? (
        <DetailDisclosure title={t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_34ac0ac3")} description={t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_8f775b88")} className="mt-4">
          <div className="space-y-2">
            {props.syncHistory.map((record) => (
              <div key={record.id} className="text-xs leading-5 text-muted-foreground">
                <span className="font-medium text-foreground">{t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_49782ee4")}</span>
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
      <SectionTitle title={t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_26deb25d")} description={t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_e571d6ab")} />
      {props.novelWorld && !props.novelWorld.sourceWorldId ? (
        <div className="mt-4 flex flex-col gap-3 rounded-xl bg-muted/15 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-medium text-foreground">{t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_cd592245")}</div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              把本书世界保存为可复用样本，后续可以推送本书修改或拉取世界库内容。
            </div>
          </div>
          <Button type="button" variant="secondary" disabled={props.isSavingToLibrary} onClick={() => props.onSaveToLibrary()}>
            <Library className="size-4" />
            {props.isSavingToLibrary ? t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.savingInProgressDotDotDot") : t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_cd592245")}
          </Button>
        </div>
      ) : null}

      <DetailDisclosure
        title={t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_ed2c3be6")}
        description={t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_81ee3c6c")}
        meta={props.novelWorld ? t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_bebe47a3") : t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_43d22961")}
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
        description={t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_0c46a450")}
        className="h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] xl:max-w-7xl"
        bodyClassName="overflow-hidden p-0"
      >
        <Tabs value={props.activeTab} onValueChange={(value) => props.onTabChange(value as NovelWorldDialogTab)} className="grid h-full min-h-0 lg:grid-cols-[220px_minmax(0,1fr)]">
          <TabsList className={cn(
            "m-0 h-auto justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent p-3",
            "lg:flex lg:flex-col lg:items-stretch lg:overflow-visible lg:border-b-0 lg:border-r",
          )}>
            {[
              ["overview", t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_61ae07e0")],
              ["rules", t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_7eb5cd49")],
              ["guidance", t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_f95045c7")],
              ["usage", t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_6832ddc4")],
              ["sync", t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_81e53644")],
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
                  <Link to={`/worlds/${props.novelWorld.sourceWorldId}/workspace`}>{t("gen.pages.novels.components.novelWorld.NovelWorldHandbookDialog.gen_d6274ec9")}</Link>
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
