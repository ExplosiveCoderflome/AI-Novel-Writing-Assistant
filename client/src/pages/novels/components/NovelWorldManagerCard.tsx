import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, Map, Network, Workflow } from "lucide-react";
import type {
  NovelWorldSyncDiff,
  NovelWorldSyncInput,
  NovelWorldView,
} from "@ai-novel/shared/types/novelWorld";
import type { StoryWorldSliceOverrides, StoryWorldSliceView } from "@ai-novel/shared/types/storyWorldSlice";
import { Button } from "@/components/ui/button";
import NovelWorldSourcePanel, { type WorldOption } from "./novelWorld/NovelWorldSourcePanel";
import {
  NovelWorldHandbookDialog,
  type NovelWorldDialogTab,
} from "./novelWorld/NovelWorldHandbookDialog";
import {
  NovelWorldUsageSummary,
  useNovelWorldUsageDraft,
  type NovelWorldUsageCardProps,
} from "./NovelWorldUsageCard";
import { DetailDisclosure } from "./workspaceShell";

interface NovelWorldManagerCardProps {
  view?: NovelWorldView | null;
  syncDiff?: NovelWorldSyncDiff | null;
  worldOptions: WorldOption[];
  selectedWorldId: string;
  isLoading: boolean;
  isImporting: boolean;
  isGenerating: boolean;
  isCreatingManual: boolean;
  isSavingToLibrary: boolean;
  isLoadingSyncDiff: boolean;
  isSyncing: boolean;
  usageView?: StoryWorldSliceView | null;
  usageMessage: string;
  isRefreshingWorldSlice: boolean;
  isSavingWorldSliceOverrides: boolean;
  onImport: Parameters<typeof NovelWorldSourcePanel>[0]["onImport"];
  onCreateManual: Parameters<typeof NovelWorldSourcePanel>[0]["onCreateManual"];
  onGenerate: Parameters<typeof NovelWorldSourcePanel>[0]["onGenerate"];
  onSaveToLibrary: () => void;
  onSync: (payload: NovelWorldSyncInput) => void;
  onRefreshWorldSlice: () => void;
  onSaveWorldSliceOverrides: (patch: StoryWorldSliceOverrides) => void;
}

function labelSourceType(sourceType: string | null | undefined): string {
  switch (sourceType) {
    case "imported":
      return i18next.t("dict.gen_d6c97812");
    case "generated":
      return i18next.t("dict.gen_b7ab0cfd");
    case "manual":
      return i18next.t("dict.gen_c1c6046e");
    default:
      return i18next.t("dict.gen_fe2d26a2");
  }
}

function labelSyncDirection(direction: string | null | undefined): string {
  switch (direction) {
    case "push":
      return i18next.t("dict.gen_3c11209d");
    case "pull":
      return i18next.t("dict.gen_697b6277");
    case "bidirectional":
      return i18next.t("dict.gen_cc89795c");
    default:
      return i18next.t("dict.gen_db709d59");
  }
}

function sectionLabel(section: string): string {
  switch (section) {
    case "profile":
      return i18next.t("dict.worldOverview");
    case "rules":
      return i18next.t("dict.gen_0a431a82");
    case "factions":
      return i18next.t("dict.gen_42988d4b");
    case "forces":
      return i18next.t("dict.gen_dcfe557b");
    case "locations":
      return i18next.t("dict.gen_fc1a7d3c");
    case "relations":
      return i18next.t("dict.gen_bb016fed");
    default:
      return section;
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

function firstText(items: Array<string | null | undefined>, fallback: string): string {
  return items.find((item) => Boolean(item)) ?? fallback;
}

function inlineText(items: Array<string | null | undefined>): string | null {
  const compact = items.filter((item): item is string => Boolean(item));
  return compact.length ? compact.join(" · ") : null;
}

function WorldSignal(props: {
  icon: typeof BookOpen;
  label: string;
  count: number;
  sample: string;
}) {
  const Icon = props.icon;

  return (
    <div className="rounded-xl bg-background/75 p-3 shadow-sm ring-1 ring-border/30">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        {props.label}
      </div>
      <div className="mt-2 text-xl font-semibold text-foreground">{props.count}</div>
      <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{props.sample}</div>
    </div>
  );
}

function GenerationChain() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {["本书世界", "角色", "大纲", "章节"].map((item, index, array) => (
        <span key={item} className="flex items-center gap-2">
          <span className="rounded-full bg-background/80 px-2 py-1 shadow-sm ring-1 ring-border/25">{item}</span>
          {index < array.length - 1 ? <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /> : null}
        </span>
      ))}
    </div>
  );
}

export default function NovelWorldManagerCard(props: NovelWorldManagerCardProps) {
  const { t } = useTranslation();
  const [selectedSyncSections, setSelectedSyncSections] = useState<NovelWorldSyncInput["sections"]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTab, setDialogTab] = useState<NovelWorldDialogTab>("overview");
  const novelWorld = props.view?.novelWorld ?? null;
  const handbook = props.view?.handbook ?? null;
  const worldAssets = props.view?.assets ?? [];
  const syncHistory = props.view?.syncHistory ?? [];
  const syncDiff = props.syncDiff ?? null;
  const usageProps = useMemo<NovelWorldUsageCardProps>(() => ({
    view: props.usageView,
    message: props.usageMessage,
    isRefreshing: props.isRefreshingWorldSlice,
    isSaving: props.isSavingWorldSliceOverrides,
    onRefresh: props.onRefreshWorldSlice,
    onSave: props.onSaveWorldSliceOverrides,
  }), [
    props.usageView,
    props.usageMessage,
    props.isRefreshingWorldSlice,
    props.isSavingWorldSliceOverrides,
    props.onRefreshWorldSlice,
    props.onSaveWorldSliceOverrides,
  ]);
  const usageDraft = useNovelWorldUsageDraft(usageProps);

  const activeWorldName = useMemo(() => {
    const id = novelWorld?.sourceWorldId ?? props.selectedWorldId;
    return props.worldOptions.find((item) => item.id === id)?.name ?? novelWorld?.title ?? "未选择世界";
  }, [novelWorld?.sourceWorldId, novelWorld?.title, props.selectedWorldId, props.worldOptions]);
  const writingStatus = novelWorld
    ? novelWorld.hasStorySlice
      ? "写作范围已整理"
      : "需要整理本书可用范围"
    : "还未建立本书世界";
  const syncStatus = novelWorld?.syncEnabled
    ? labelSyncDirection(novelWorld.syncDirection)
    : novelWorld?.sourceWorldId
      ? "保留为本书副本"
      : "本书内部使用";
  const lastSyncedAtText = formatSyncTime(novelWorld?.lastSyncedAt);
  const pendingSections = syncDiff?.differences.length
    ? syncDiff.differences.map((item) => item.section)
    : novelWorld?.syncPendingSections ?? [];
  const pendingSectionText = pendingSections.length > 0 ? pendingSections.map(sectionLabel).join("、") : null;
  const hasSyncDiff = Boolean(syncDiff?.differences.length);
  const forces = handbook?.forces.length ? handbook.forces : handbook?.factions ?? [];
  const summaryText = handbook?.summary
    ?? novelWorld?.coverSummary
    ?? (novelWorld ? "这本书的世界正在整理中。" : "先创建一份属于这本书的世界副本，后续角色、大纲和章节都会读取这里的设定边界。");
  const themeLine = inlineText([
    handbook?.identity ? `身份：${handbook.identity}` : null,
    handbook?.tone ? `气质：${handbook.tone}` : null,
    ...(handbook?.themes.slice(0, 4) ?? []),
  ]);

  const openDialog = (tab: NovelWorldDialogTab) => {
    setDialogTab(tab);
    setDialogOpen(true);
  };

  return (
    <section className="space-y-5">
      <section className="overflow-hidden rounded-2xl bg-muted/10 shadow-sm ring-1 ring-border/35">
        <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1.25fr)_420px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {props.isLoading ? <span>{i18next.t("dict.gen_26d335b3")}</span> : null}
              <span>{novelWorld ? labelSourceType(novelWorld.sourceType) : "未设置来源"}</span>
              <span>{writingStatus}</span>
              <span>{syncStatus}</span>
              {lastSyncedAtText ? <span>同步 {lastSyncedAtText}</span> : null}
              {pendingSectionText ? <span>待处理 {pendingSectionText}</span> : null}
            </div>
            <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="text-sm text-muted-foreground">{i18next.t("novels.novelWorldManagerCard.dcc10w")}</div>
                <h2 className="mt-1 truncate text-3xl font-semibold tracking-normal text-foreground">{activeWorldName}</h2>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {novelWorld ? (
                  <>
                    <Button type="button" onClick={() => openDialog("overview")}>{i18next.t("novels.novelWorldManagerCard.iv726k")}</Button>
                    <Button type="button" variant="outline" onClick={() => openDialog("usage")}>{i18next.t("novels.novelWorldManagerCard.obxe1g")}</Button>
                  </>
                ) : (
                  <Button asChild>
                    <a href="#novel-world-source">{i18next.t("novels.novelWorldManagerCard.tvqtbd")}</a>
                  </Button>
                )}
                {hasSyncDiff ? (
                  <Button type="button" variant="outline" onClick={() => openDialog("sync")}>{i18next.t("novels.novelWorldManagerCard.vc5b73")}</Button>
                ) : null}
              </div>
            </div>

            <div className="mt-5 max-w-4xl text-lg leading-8 text-foreground/85">
              {summaryText}
            </div>
            {themeLine ? <div className="mt-3 text-sm leading-6 text-muted-foreground">{themeLine}</div> : null}

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <WorldSignal
                icon={BookOpen}
                label={i18next.t("dict.gen_0a431a82")}
                count={handbook?.coreRules.length ?? 0}
                sample={handbook?.coreRules[0]?.name ?? "等待补齐规则"}
              />
              <WorldSignal
                icon={Network}
                label={i18next.t("dict.majorForce")}
                count={forces.length}
                sample={forces[0]?.name ?? "等待补齐势力"}
              />
              <WorldSignal
                icon={Map}
                label={i18next.t("dict.gen_bf876a86")}
                count={handbook?.locations.length ?? 0}
                sample={handbook?.locations[0]?.name ?? "等待补齐地点"}
              />
              <WorldSignal
                icon={Workflow}
                label={i18next.t("dict.gen_b7cadb8f")}
                count={handbook?.tensions.length ?? 0}
                sample={handbook?.tensions[0] ?? "等待补齐张力"}
              />
            </div>

            <div className="mt-6 flex flex-col gap-3 rounded-xl bg-background/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">{i18next.t("novels.novelWorldManagerCard.1h0zoi")}</div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  {novelWorld?.hasStorySlice
                    ? "角色、大纲和章节会优先继承本书使用范围里的规则、势力和地点。"
                    : "整理本书使用范围后，生成链会读取更精准的世界约束。"}
                </div>
              </div>
              <GenerationChain />
            </div>
          </div>

          <aside className="space-y-4 rounded-2xl bg-background/65 p-4 shadow-sm ring-1 ring-border/30">
            <div>
              <div className="text-sm font-medium text-foreground">{i18next.t("novels.novelWorldManagerCard.yilfou")}</div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">
                {firstText([
                  props.usageView?.slice?.coreWorldFrame,
                  handbook?.generationGuidance?.chapterUses[0],
                  novelWorld?.hasStorySlice ? "章节生成会读取本书使用范围。" : null,
                ], "创建本书世界后，会在这里显示章节生成将读取的约束。")}
              </div>
            </div>
            <div className="grid gap-3 text-sm">
              {[
                { label: i18next.t("dict.gen_b0fae043"), value: props.usageView?.slice?.appliedRules.length ?? handbook?.coreRules.length ?? 0 },
                { label: i18next.t("dict.gen_dcfe557b"), value: props.usageView?.slice?.activeForces.length ?? forces.length },
                { label: i18next.t("dict.gen_fc1a7d3c"), value: props.usageView?.slice?.activeLocations.length ?? handbook?.locations.length ?? 0 },
                { label: i18next.t("novels.novelWorldManagerCard.enw0"), value: props.usageView?.slice?.pressureSources.length ?? handbook?.tensions.length ?? 0 },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between border-t border-border/45 pt-2">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-semibold text-foreground">{item.value}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      {novelWorld ? (
        <NovelWorldUsageSummary
          {...usageProps}
          draft={usageDraft}
          onOpenDetails={() => openDialog("usage")}
        />
      ) : (
        <DetailDisclosure
          title={i18next.t("novels.novelWorldManagerCard.tvqtbd")}
          description={i18next.t("dict.gen_81ee3c6c")}
          meta="待选择"
          defaultOpen
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
      )}

      <NovelWorldHandbookDialog
        open={dialogOpen}
        activeTab={dialogTab}
        onOpenChange={setDialogOpen}
        onTabChange={setDialogTab}
        novelWorld={novelWorld}
        handbook={handbook}
        worldAssets={worldAssets}
        syncHistory={syncHistory}
        syncDiff={syncDiff}
        activeWorldName={activeWorldName}
        worldOptions={props.worldOptions}
        selectedWorldId={props.selectedWorldId}
        isImporting={props.isImporting}
        isGenerating={props.isGenerating}
        isCreatingManual={props.isCreatingManual}
        isSavingToLibrary={props.isSavingToLibrary}
        isLoadingSyncDiff={props.isLoadingSyncDiff}
        isSyncing={props.isSyncing}
        selectedSyncSections={selectedSyncSections}
        onSelectedSyncSectionsChange={setSelectedSyncSections}
        onImport={props.onImport}
        onCreateManual={props.onCreateManual}
        onGenerate={props.onGenerate}
        onSaveToLibrary={props.onSaveToLibrary}
        onSync={props.onSync}
        usageProps={usageProps}
        usageDraft={usageDraft}
      />
    </section>
  );
}
