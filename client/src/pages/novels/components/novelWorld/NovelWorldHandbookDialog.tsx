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
      return "来自世界库";
    case "generated":
      return "根据本书生成";
    case "manual":
      return "自定义世界";
    default:
      return "未设置";
  }
}

function labelSyncDirection(direction: string | null | undefined): string {
  switch (direction) {
    case "push":
      return "只推送到世界库";
    case "pull":
      return "只从世界库拉取";
    case "bidirectional":
      return "可双向同步";
    default:
      return "不同步";
  }
}

function sectionLabel(section: string): string {
  switch (section) {
    case "profile":
      return "世界概要";
    case "rules":
      return "核心规则";
    case "factions":
      return "阵营";
    case "forces":
      return "势力";
    case "locations":
      return "地点";
    case "relations":
      return "关系网络";
    default:
      return section;
  }
}

function labelAssetStatus(status: string, hasRenderData: boolean): string {
  if (hasRenderData || status === "ready") {
    return "可查看";
  }
  switch (status) {
    case "draft":
      return "整理中";
    case "archived":
      return "已归档";
    default:
      return "待生成";
  }
}

function assetReadinessHint(assetType: NovelWorldAssetSummary["assetType"]): string {
  switch (assetType) {
    case "map":
      return "补足故事舞台和地点风险后，地图能呈现区域与冲突落点。";
    case "faction_diagram":
      return "补足主要势力、目标和压力后，图谱能呈现阵营关系。";
    case "timeline":
      return "补足核心冲突和共同后果后，时间线能呈现局势变化。";
    case "character_network":
      return "补足势力归属和阵营压力后，角色关系会更贴合世界。";
    case "power_system_tree":
      return "补足核心规则、代价和边界后，体系树能避免变成等级表。";
    default:
      return "先补世界手册，再整理可视化资产。";
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
        <SectionTitle title="世界总览" description="这里展示本书世界的门面信息，帮助你判断它是否支撑当前故事。" />
        <div className="mt-4 rounded-2xl bg-muted/15 p-5">
          <div className="text-xs text-muted-foreground">
            {novelWorld ? labelSourceType(novelWorld.sourceType) : "未设置来源"} · {novelWorld?.hasStorySlice ? "写作范围已整理" : "等待整理写作范围"}
          </div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{props.activeWorldName}</div>
          <div className="mt-3 max-w-4xl text-base leading-8 text-muted-foreground">
            {handbook?.summary ?? novelWorld?.coverSummary ?? "这本书的世界正在准备中。"}
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
          <SectionTitle title="主要势力" />
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
            {(!handbook || (handbook.forces.length === 0 && handbook.factions.length === 0)) ? <EmptyLine>还没有明确的势力。</EmptyLine> : null}
          </div>
        </div>
        <div>
          <SectionTitle title="故事舞台" />
          <div className="mt-3 space-y-3">
            {handbook?.locations.slice(0, 8).map((location) => (
              <div key={location.name} className="border-t border-border/50 pt-3 text-sm">
                <div className="font-medium text-foreground">{location.name}</div>
                <div className="mt-1 leading-6 text-muted-foreground">
                  {location.narrativeFunction || location.summary || "暂无说明"}
                  {location.risk ? ` · 风险：${location.risk}` : null}
                </div>
              </div>
            ))}
            {!handbook?.locations.length ? <EmptyLine>还没有明确的故事舞台。</EmptyLine> : null}
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
        <SectionTitle title="规则与代价" description="章节生成会优先遵守这些硬规则，避免临时发明不一致的设定。" />
        <div className="mt-4 space-y-4">
          {handbook?.coreRules.length ? handbook.coreRules.map((rule) => (
            <div key={`${rule.name}-${rule.summary}`} className="border-t border-border/60 pt-4">
              <div className="text-sm font-medium text-foreground">{rule.name}</div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">{rule.summary || "暂无说明"}</div>
              <InlineMeta items={[
                rule.cost ? `代价：${rule.cost}` : null,
                rule.boundary ? `边界：${rule.boundary}` : null,
              ]} />
            </div>
          )) : <EmptyLine>还没有明确的核心规则。</EmptyLine>}
        </div>
      </section>

      <section>
        <SectionTitle title="关键张力" description="这些长期矛盾会帮助大纲和章节保持世界压力。" />
        <div className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
          {handbook?.tensions.length ? handbook.tensions.map((tension) => (
            <div key={tension} className="border-t border-border/50 pt-2">{tension}</div>
          )) : <EmptyLine>还没有明确的长期矛盾。</EmptyLine>}
        </div>
      </section>
    </div>
  );
}

function GuidanceTab(props: { handbook: NovelWorldHandbook | null }) {
  const guidance = props.handbook?.generationGuidance ?? null;
  const groups = [
    { title: "角色身份边界", items: guidance?.characterUses ?? [] },
    { title: "故事范围线索", items: guidance?.outlineUses ?? [] },
    { title: "场景规则约束", items: guidance?.chapterUses ?? [] },
    { title: "需要避开的越界", items: guidance?.avoidUses ?? [] },
  ];

  return (
    <div className="space-y-6">
      <SectionTitle title="生成约束" description="这些内容解释本书世界会怎样进入角色、大纲和章节生成。" />
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <section key={group.title} className="rounded-xl bg-muted/15 p-4">
            <div className="text-sm font-medium text-foreground">{group.title}</div>
            <div className="mt-3 space-y-2">
              {group.items.length > 0 ? group.items.slice(0, 6).map((item) => (
                <div key={item} className="text-sm leading-6 text-muted-foreground">{item}</div>
              )) : (
                <div className="text-sm leading-6 text-muted-foreground">暂无明确提示。</div>
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
      <SectionTitle title="世界资产" description="地图、势力图谱、时间线和体系树用于帮助你看见世界，不是章节生成的唯一来源。" />
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
          <EmptyLine>世界资产入口会随本书世界手册一起整理。</EmptyLine>
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
        title="同步管理"
        description="先看本书世界和世界库样本差在哪里，再选择要同步的分区。系统不会自动覆盖两边内容。"
      />
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-muted/15 p-3">
          <div className="text-xs text-muted-foreground">差异检查</div>
          <div className="mt-1 text-sm font-medium text-foreground">
            {props.isLoadingSyncDiff ? "检查中" : syncDiff ? "检查完成" : "等待检查"}
          </div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">
            {syncDiff?.differenceCount ? `${syncDiff.differenceCount} 个分区存在差异。` : syncDiff ? "没有发现需要处理的分区差异。" : "打开本书世界时会读取差异摘要。"}
          </div>
        </div>
        <div className="rounded-xl bg-muted/15 p-3">
          <div className="text-xs text-muted-foreground">选择分区</div>
          <div className="mt-1 text-sm font-medium text-foreground">{hasSyncDiff ? `${selectedSectionCount} 个分区` : "无需选择"}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">只同步你确认过的概要、规则、势力、地点或关系网络。</div>
        </div>
        <div className="rounded-xl bg-muted/15 p-3">
          <div className="text-xs text-muted-foreground">手动同步</div>
          <div className="mt-1 text-sm font-medium text-foreground">{novelWorld.syncEnabled ? labelSyncDirection(novelWorld.syncDirection) : "独立副本"}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">推送会改世界库样本；拉取会改本书世界副本。</div>
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
          {syncDiff.reason ?? "暂无法同步。"}
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
              {props.isSyncing ? "同步中..." : "拉取世界库更新"}
            </Button>
            <Button type="button" variant="secondary" disabled={props.isSyncing || !effectiveSyncSections?.length} onClick={() => props.onSync({ direction: "push", sections: effectiveSyncSections })}>
              {props.isSyncing ? "同步中..." : "推送本书修改"}
            </Button>
            <Button type="button" variant="outline" disabled={props.isSyncing} onClick={() => props.onSync({ direction: "none" })}>
              关闭同步
            </Button>
          </div>
        </div>
      ) : !novelWorld.syncEnabled ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={props.isSyncing} onClick={() => props.onSync({ direction: "pull" })}>
            {props.isSyncing ? "同步中..." : "拉取世界库内容"}
          </Button>
          <Button type="button" variant="secondary" disabled={props.isSyncing} onClick={() => props.onSync({ direction: "push" })}>
            {props.isSyncing ? "同步中..." : "推送本书世界"}
          </Button>
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          本书世界和世界库样本保持一致。
        </div>
      )}

      {props.syncHistory.length > 0 ? (
        <DetailDisclosure title="最近同步" description="查看最近几次主动同步记录。" className="mt-4">
          <div className="space-y-2">
            {props.syncHistory.map((record) => (
              <div key={record.id} className="text-xs leading-5 text-muted-foreground">
                <span className="font-medium text-foreground">{record.direction === "pull" ? "拉取" : "推送"}</span>
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
      <SectionTitle title="来源与世界库" description="从世界库导入、根据本书生成，或保存本书世界作为可复用样本。" />
      {props.novelWorld && !props.novelWorld.sourceWorldId ? (
        <div className="mt-4 flex flex-col gap-3 rounded-xl bg-muted/15 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-medium text-foreground">保存到世界库</div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              把本书世界保存为可复用样本，后续可以推送本书修改或拉取世界库内容。
            </div>
          </div>
          <Button type="button" variant="secondary" disabled={props.isSavingToLibrary} onClick={() => props.onSaveToLibrary()}>
            <Library className="size-4" />
            {props.isSavingToLibrary ? "保存中..." : "保存到世界库"}
          </Button>
        </div>
      ) : null}

      <DetailDisclosure
        title="选择或更换本书世界来源"
        description="从世界库导入、根据本书生成，或先创建一个自定义世界骨架。"
        meta={props.novelWorld ? "按需更换" : "待选择"}
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
        description="查看本书世界手册、生成约束和使用范围。这里的内容会服务角色、大纲和章节生成。"
        className="h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] xl:max-w-7xl"
        bodyClassName="overflow-hidden p-0"
      >
        <Tabs value={props.activeTab} onValueChange={(value) => props.onTabChange(value as NovelWorldDialogTab)} className="grid h-full min-h-0 lg:grid-cols-[220px_minmax(0,1fr)]">
          <TabsList className={cn(
            "m-0 h-auto justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent p-3",
            "lg:flex lg:flex-col lg:items-stretch lg:overflow-visible lg:border-b-0 lg:border-r",
          )}>
            {[
              ["overview", "世界总览"],
              ["rules", "规则与张力"],
              ["guidance", "生成约束"],
              ["usage", "使用范围"],
              ["sync", "同步与资产"],
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
                  <Link to={`/worlds/${props.novelWorld.sourceWorldId}/workspace`}>打开来源世界手册</Link>
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
