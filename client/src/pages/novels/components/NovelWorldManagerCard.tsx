import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, GitCompareArrows, GitFork, Library, Map, Network, Route, Workflow } from "lucide-react";
import type {
  NovelWorldAssetSummary,
  NovelWorldSyncDiff,
  NovelWorldSyncInput,
  NovelWorldView,
} from "@ai-novel/shared/types/novelWorld";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import NovelWorldSourcePanel, { type WorldOption } from "./novelWorld/NovelWorldSourcePanel";

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
  onImport: Parameters<typeof NovelWorldSourcePanel>[0]["onImport"];
  onCreateManual: Parameters<typeof NovelWorldSourcePanel>[0]["onCreateManual"];
  onGenerate: Parameters<typeof NovelWorldSourcePanel>[0]["onGenerate"];
  onSaveToLibrary: () => void;
  onSync: (payload: NovelWorldSyncInput) => void;
}

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

function StatusPanel({
  icon: Icon,
  title,
  value,
  description,
}: {
  icon: typeof BookOpen;
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="min-w-0 border-l border-border/60 pl-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        {title}
      </div>
      <div className="mt-2 break-words text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{value}</div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
    </div>
  );
}

const ASSET_ICON_BY_TYPE: Record<NovelWorldAssetSummary["assetType"], typeof BookOpen> = {
  map: Map,
  faction_diagram: Network,
  timeline: GitFork,
  character_network: GitCompareArrows,
  power_system_tree: Workflow,
};

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
      return "先补故事舞台和地点风险，地图才有可放置的区域。";
    case "faction_diagram":
      return "先补主要势力、目标和压力，图谱才有关系可画。";
    case "timeline":
      return "先补核心冲突和共同后果，时间线才有局势变化。";
    case "character_network":
      return "先补势力归属和阵营压力，角色关系才有世界依据。";
    case "power_system_tree":
      return "先补核心规则、代价和边界，体系树才不会变成等级表。";
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

function formatSyncHistoryTime(value: string): string {
  return formatSyncTime(value) ?? value;
}

export default function NovelWorldManagerCard(props: NovelWorldManagerCardProps) {
  const [selectedSyncSections, setSelectedSyncSections] = useState<NovelWorldSyncInput["sections"]>([]);
  const novelWorld = props.view?.novelWorld ?? null;
  const handbook = props.view?.handbook ?? null;
  const worldAssets = props.view?.assets ?? [];
  const syncHistory = props.view?.syncHistory ?? [];
  const syncDiff = props.syncDiff ?? null;
  const activeWorldName = useMemo(() => {
    const id = novelWorld?.sourceWorldId ?? props.selectedWorldId;
    return props.worldOptions.find((item) => item.id === id)?.name ?? novelWorld?.title ?? "未选择世界";
  }, [novelWorld?.sourceWorldId, novelWorld?.title, props.selectedWorldId, props.worldOptions]);
  const writingStatus = novelWorld
    ? novelWorld.hasStorySlice
      ? "本书范围已整理"
      : "需要整理本书可用设定"
    : "还未整理可用范围";
  const syncStatus = novelWorld?.syncEnabled
    ? labelSyncDirection(novelWorld.syncDirection)
    : novelWorld?.sourceWorldId
      ? "保留为本书副本"
      : "本书内部使用";
  const lastSyncedAtText = formatSyncTime(novelWorld?.lastSyncedAt);
  const pendingSections = syncDiff?.differences.length
    ? syncDiff.differences.map((item) => item.section)
    : novelWorld?.syncPendingSections ?? [];
  const pendingSectionText = pendingSections.length > 0
    ? pendingSections.map(sectionLabel).join("、")
    : null;
  const effectiveSyncSections = selectedSyncSections && selectedSyncSections.length > 0
    ? selectedSyncSections
    : syncDiff?.differences.map((item) => item.section);
  const hasSourceWorld = Boolean(novelWorld?.sourceWorldId);
  const hasSyncDiff = Boolean(syncDiff?.differences.length);
  const selectedSectionCount = effectiveSyncSections?.length ?? 0;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-2xl font-semibold tracking-normal text-foreground">本书世界</div>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            这里管理这本小说真正使用的世界。世界库提供可复用样本，导入或生成后，这里保存本书自己的世界版本。
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {props.isLoading ? <Badge variant="secondary">读取中</Badge> : null}
          {novelWorld ? <Badge variant="outline">{labelSourceType(novelWorld.sourceType)}</Badge> : null}
          {novelWorld?.hasStorySlice ? <Badge variant="secondary">写作可用</Badge> : <Badge variant="outline">等待整理</Badge>}
          {novelWorld?.syncEnabled ? <Badge variant="secondary">{labelSyncDirection(novelWorld.syncDirection)}</Badge> : <Badge variant="outline">手动同步</Badge>}
        </div>
      </div>
      <div className="space-y-5">
        <div className="grid gap-4 md:grid-cols-3">
          <StatusPanel
            icon={Library}
            title="来源"
            value={activeWorldName}
            description={novelWorld ? labelSourceType(novelWorld.sourceType) : "可从世界库导入，也可根据本书主题生成。"}
          />
          <StatusPanel
            icon={Route}
            title="本书使用范围"
            value={writingStatus}
            description="这里裁出本书会重点使用的规则、势力和地点；外部世界库样本不会被直接当成本书内容。"
          />
          <StatusPanel
            icon={GitCompareArrows}
            title="同步"
            value={syncStatus}
            description={[
              lastSyncedAtText ? `上次同步：${lastSyncedAtText}。` : "",
              pendingSectionText ? `待处理：${pendingSectionText}。` : "",
              "推送或拉取都由你手动确认。",
            ].filter(Boolean).join("")}
          />
        </div>

        <div className="border-t border-border/60 pt-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-sm font-medium text-foreground">下一步</div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">
                优先把本书会用到的世界范围整理清楚；来源样本、同步和保存都由你手动处理。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!novelWorld ? (
                <Button asChild size="sm">
                  <a href="#novel-world-source">选择世界来源</a>
                </Button>
              ) : null}
              {novelWorld && !novelWorld.hasStorySlice ? (
                <Button asChild size="sm">
                  <a href="#novel-world-usage">整理本书使用范围</a>
                </Button>
              ) : null}
              {novelWorld?.sourceWorldId ? (
                <Button asChild size="sm" variant="outline">
                  <Link to={`/worlds/${novelWorld.sourceWorldId}/workspace`}>打开来源世界手册</Link>
                </Button>
              ) : null}
              {hasSyncDiff ? (
                <Button asChild size="sm" variant="outline">
                  <a href="#novel-world-sync">处理同步差异</a>
                </Button>
              ) : null}
              {novelWorld && !novelWorld.sourceWorldId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={props.isSavingToLibrary}
                  onClick={() => props.onSaveToLibrary()}
                >
                  {props.isSavingToLibrary ? "保存中..." : "保存为世界样本"}
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {handbook ? (
          <div className="border-t border-border/60 pt-5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">世界手册</div>
                <div className="mt-1 text-sm leading-6 text-muted-foreground">
                  {handbook.summary ?? "这本书的世界正在整理中。"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {handbook.identity ? <Badge variant="outline">{handbook.identity}</Badge> : null}
                {handbook.tone ? <Badge variant="secondary">{handbook.tone}</Badge> : null}
              </div>
            </div>
            {handbook.themes.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {handbook.themes.map((theme) => (
                  <Badge key={theme} variant="outline">{theme}</Badge>
                ))}
              </div>
            ) : null}
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-lg bg-muted/15 p-3">
                <div className="text-sm font-medium text-foreground">核心设定</div>
                <div className="mt-2 space-y-2">
                  {handbook.coreRules.length > 0 ? handbook.coreRules.map((rule) => (
                    <div key={`${rule.name}-${rule.summary}`} className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{rule.name}</span>
                      {rule.summary ? `：${rule.summary}` : ""}
                      {rule.cost ? <span className="block text-xs">代价：{rule.cost}</span> : null}
                      {rule.boundary ? <span className="block text-xs">边界：{rule.boundary}</span> : null}
                    </div>
                  )) : <div className="text-sm text-muted-foreground">还没有明确的核心规则。</div>}
                </div>
              </div>
              <div className="rounded-lg bg-muted/15 p-3">
                <div className="text-sm font-medium text-foreground">主要势力</div>
                <div className="mt-2 space-y-2">
                  {(handbook.forces.length > 0 ? handbook.forces : handbook.factions).slice(0, 5).map((item) => (
                    <div key={item.name} className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{item.name}</span>
                      {"pressure" in item && item.pressure ? `：${item.pressure}` : ""}
                      {"doctrine" in item && item.doctrine ? `：${item.doctrine}` : ""}
                      {"narrativeRole" in item && item.narrativeRole ? <span className="block text-xs">叙事作用：{item.narrativeRole}</span> : null}
                    </div>
                  ))}
                  {handbook.forces.length === 0 && handbook.factions.length === 0 ? (
                    <div className="text-sm text-muted-foreground">还没有明确的势力。</div>
                  ) : null}
                </div>
              </div>
              <div className="rounded-lg bg-muted/15 p-3">
                <div className="text-sm font-medium text-foreground">本书舞台</div>
                <div className="mt-2 space-y-2">
                  {handbook.locations.length > 0 ? handbook.locations.map((location) => (
                    <div key={location.name} className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{location.name}</span>
                      {location.narrativeFunction ? `：${location.narrativeFunction}` : location.summary ? `：${location.summary}` : ""}
                      {location.risk ? <span className="block text-xs">风险：{location.risk}</span> : null}
                    </div>
                  )) : <div className="text-sm text-muted-foreground">还没有明确的故事舞台。</div>}
                </div>
              </div>
              <div className="rounded-lg bg-muted/15 p-3">
                <div className="text-sm font-medium text-foreground">关键张力</div>
                <div className="mt-2 space-y-2">
                  {handbook.tensions.length > 0 ? handbook.tensions.map((tension) => (
                    <div key={tension} className="text-sm text-muted-foreground">{tension}</div>
                  )) : <div className="text-sm text-muted-foreground">还没有明确的长期矛盾。</div>}
                </div>
              </div>
            </div>
            {handbook.generationGuidance ? (
              <div className="mt-4 rounded-md border border-border/70 p-3">
                <div className="text-sm font-medium text-foreground">可提供的世界约束</div>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  {[
                    { title: "角色身份边界", items: handbook.generationGuidance.characterUses },
                    { title: "故事范围线索", items: handbook.generationGuidance.outlineUses },
                    { title: "场景规则约束", items: handbook.generationGuidance.chapterUses },
                    { title: "需要避开的越界", items: handbook.generationGuidance.avoidUses },
                  ].map((group) => (
                    <div key={group.title} className="rounded-md border border-dashed border-border/80 p-3">
                      <div className="text-xs font-medium text-foreground">{group.title}</div>
                      <div className="mt-2 space-y-1">
                        {group.items.length > 0 ? group.items.slice(0, 4).map((item) => (
                          <div key={item} className="text-xs leading-5 text-muted-foreground">{item}</div>
                        )) : (
                          <div className="text-xs leading-5 text-muted-foreground">暂无明确提示。</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {novelWorld ? (
          <div className="rounded-lg border border-border/70 bg-background p-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">世界资产</div>
                <div className="mt-1 text-sm leading-6 text-muted-foreground">
                  地图、势力图谱、时间线和力量体系图都从世界手册延伸出来，先服务理解世界，再服务后续写作。
                </div>
              </div>
              <Badge variant="outline">预留入口</Badge>
            </div>
            {worldAssets.length > 0 ? (
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {worldAssets.map((asset) => {
                  const Icon = ASSET_ICON_BY_TYPE[asset.assetType] ?? BookOpen;
                  return (
                    <div key={asset.assetType} className="rounded-md border border-dashed border-border/80 p-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                        {asset.title}
                      </div>
                      <div className="mt-2 text-xs leading-5 text-muted-foreground">{asset.description}</div>
                      <div className="mt-2 text-xs leading-5 text-muted-foreground">
                        {assetReadinessHint(asset.assetType)}
                      </div>
                      <Badge className="mt-3" variant={asset.hasRenderData ? "secondary" : "outline"}>
                        {labelAssetStatus(asset.status, asset.hasRenderData)}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 rounded-md border border-dashed border-border/80 p-3 text-sm text-muted-foreground">
                世界资产入口会随本书世界手册一起整理。
              </div>
            )}
          </div>
        ) : null}

        {novelWorld?.sourceWorldId ? (
          <div id="novel-world-sync" className="rounded-lg border border-border/70 bg-background p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">同步管理</div>
                <div className="mt-1 text-sm leading-6 text-muted-foreground">
                  先看本书世界和世界库样本差在哪里，再选择要同步的分区。系统不会自动覆盖两边内容。
                </div>
              </div>
              <Badge variant={syncDiff?.differenceCount ? "secondary" : "outline"}>
                {props.isLoadingSyncDiff
                  ? "检查中"
                  : syncDiff?.differenceCount
                    ? `${syncDiff.differenceCount} 处差异`
                    : novelWorld.syncPendingChangeCount > 0
                      ? `${novelWorld.syncPendingChangeCount} 处待处理`
                      : "无差异"}
              </Badge>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-border/70 p-3">
                <div className="text-xs font-medium text-muted-foreground">1. 差异检查</div>
                <div className="mt-1 text-sm text-foreground">
                  {props.isLoadingSyncDiff ? "检查中" : syncDiff ? "检查完成" : "等待检查"}
                </div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  {syncDiff?.differenceCount
                    ? `${syncDiff.differenceCount} 个分区存在差异。`
                    : syncDiff
                      ? "没有发现需要处理的分区差异。"
                      : "打开本书世界时会读取差异摘要。"}
                </div>
              </div>
              <div className="rounded-md border border-border/70 p-3">
                <div className="text-xs font-medium text-muted-foreground">2. 选择分区</div>
                <div className="mt-1 text-sm text-foreground">
                  {hasSyncDiff ? `${selectedSectionCount} 个分区` : "无需选择"}
                </div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  只同步你确认过的概要、规则、势力、地点或关系网络。
                </div>
              </div>
              <div className="rounded-md border border-border/70 p-3">
                <div className="text-xs font-medium text-muted-foreground">3. 手动同步</div>
                <div className="mt-1 text-sm text-foreground">
                  {novelWorld?.syncEnabled ? labelSyncDirection(novelWorld.syncDirection) : "独立副本"}
                </div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  推送会改世界库样本；拉取会改本书世界副本。
                </div>
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
              <div className="mt-3 space-y-3">
                <div className="grid gap-2 md:grid-cols-2">
                  {syncDiff.differences.map((item) => {
                    const checked = !selectedSyncSections?.length || selectedSyncSections.includes(item.section);
                    return (
                      <label key={item.section} className="flex items-start gap-3 rounded-md border border-border/70 p-3 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          onChange={(event) => {
                            setSelectedSyncSections((prev = []) => {
                              const current = prev.length > 0 ? prev : syncDiff.differences.map((diff) => diff.section);
                              return event.target.checked
                                ? Array.from(new Set([...current, item.section]))
                                : current.filter((section) => section !== item.section);
                            });
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
                  <Button
                    type="button"
                    variant="outline"
                    disabled={props.isSyncing || !effectiveSyncSections?.length}
                    onClick={() => props.onSync({ direction: "pull", sections: effectiveSyncSections })}
                  >
                    {props.isSyncing ? "同步中..." : "拉取世界库更新"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={props.isSyncing || !effectiveSyncSections?.length}
                    onClick={() => props.onSync({ direction: "push", sections: effectiveSyncSections })}
                  >
                    {props.isSyncing ? "同步中..." : "推送本书修改"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={props.isSyncing}
                    onClick={() => props.onSync({ direction: "none" })}
                  >
                    关闭同步
                  </Button>
                </div>
              </div>
            ) : !novelWorld.syncEnabled ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={props.isSyncing}
                  onClick={() => props.onSync({ direction: "pull" })}
                >
                  {props.isSyncing ? "同步中..." : "拉取世界库内容"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={props.isSyncing}
                  onClick={() => props.onSync({ direction: "push" })}
                >
                  {props.isSyncing ? "同步中..." : "推送本书世界"}
                </Button>
              </div>
            ) : (
              <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                本书世界和世界库样本保持一致。
              </div>
            )}
            {syncHistory.length > 0 ? (
              <div className="mt-4 rounded-md border border-border/70 p-3">
                <div className="text-sm font-medium text-foreground">最近同步</div>
                <div className="mt-2 space-y-2">
                  {syncHistory.map((record) => (
                    <div key={record.id} className="text-xs leading-5 text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {record.direction === "pull" ? "拉取" : "推送"}
                      </span>
                      <span> · {formatSyncHistoryTime(record.createdAt)}</span>
                      {record.syncedSections.length > 0 ? (
                        <span> · {record.syncedSections.map(sectionLabel).join("、")}</span>
                      ) : null}
                      {record.diffSummary ? <span className="block">{record.diffSummary}</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {novelWorld && !novelWorld.sourceWorldId ? (
          <div className="rounded-lg border border-border/70 bg-background p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-medium text-foreground">保存到世界库</div>
                <div className="mt-1 text-sm leading-6 text-muted-foreground">
                  把本书世界保存为可复用样本，后续可以推送本书修改或拉取世界库内容。
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={props.isSavingToLibrary}
                onClick={() => props.onSaveToLibrary()}
              >
                <Library className="size-4" />
                {props.isSavingToLibrary ? "保存中..." : "保存到世界库"}
              </Button>
            </div>
          </div>
        ) : null}

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
    </section>
  );
}
