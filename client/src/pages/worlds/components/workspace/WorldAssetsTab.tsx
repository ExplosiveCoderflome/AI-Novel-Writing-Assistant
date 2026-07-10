import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useState, type Dispatch, type SetStateAction } from "react";
import { GitCompareArrows, GitFork, Map, Network, Workflow } from "lucide-react";
import type { World, WorldSnapshot } from "@ai-novel/shared/types/world";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import KnowledgeBindingPanel from "@/components/knowledge/KnowledgeBindingPanel";
import SelectControl from "@/components/common/SelectControl";

interface WorldLibraryItem {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  worldType?: string | null;
  usageCount: number;
  sourceWorldId?: string | null;
}

interface WorldAssetsTabProps {
  worldId: string;
  world?: World;
  selectedLayerPrimaryField: "background" | "magicSystem" | "politics" | "cultures" | "history" | "conflicts";
  libraryKeyword: string;
  setLibraryKeyword: Dispatch<SetStateAction<string>>;
  libraryCategory: string;
  setLibraryCategory: Dispatch<SetStateAction<string>>;
  publishName: string;
  setPublishName: Dispatch<SetStateAction<string>>;
  publishCategory: string;
  setPublishCategory: Dispatch<SetStateAction<string>>;
  publishDescription: string;
  setPublishDescription: Dispatch<SetStateAction<string>>;
  snapshotLabel: string;
  setSnapshotLabel: Dispatch<SetStateAction<string>>;
  diffFrom: string;
  setDiffFrom: Dispatch<SetStateAction<string>>;
  diffTo: string;
  setDiffTo: Dispatch<SetStateAction<string>>;
  importFormat: "json" | "markdown" | "text";
  setImportFormat: Dispatch<SetStateAction<"json" | "markdown" | "text">>;
  importContent: string;
  setImportContent: Dispatch<SetStateAction<string>>;
  libraryItems: WorldLibraryItem[];
  snapshots: WorldSnapshot[];
  diffChanges: Array<{ field: string; before: string | null; after: string | null }>;
  createSnapshotPending: boolean;
  publishPending: boolean;
  importPending: boolean;
  onRefreshLibrary: () => void;
  onInjectLibraryField: (libraryId: string) => void;
  onInjectLibraryStructure: (libraryId: string, targetCollection: "forces" | "locations") => void;
  onPublishLibrary: () => void;
  onCreateSnapshot: () => void;
  onRestoreSnapshot: (snapshotId: string) => void;
  onDiffSnapshots: () => void;
  onExport: (format: "markdown" | "json") => Promise<void>;
  onImport: () => void;
}

type AssetTool = "visualAssets" | "references" | "library" | "snapshots" | "export" | "import";

const WORLD_ASSET_PRESETS = [
  {
    icon: Map,
    title: t("gen.pages.worlds.components.workspace.WorldAssetsTab.worldMap"),
    description: t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_dffe62c3"),
    readiness: t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_6157e679"),
  },
  {
    icon: Network,
    title: t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_de942453"),
    description: t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_19f83c09"),
    readiness: t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_3abaa31a"),
  },
  {
    icon: GitFork,
    title: t("gen.pages.worlds.components.workspace.WorldAssetsTab.worldTimeline"),
    description: t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_87d3f653"),
    readiness: t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_92e958bf"),
  },
  {
    icon: GitCompareArrows,
    title: t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_6606fcbf"),
    description: t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_e110856a"),
    readiness: t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_8a5d0d5c"),
  },
  {
    icon: Workflow,
    title: t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_3e265312"),
    description: t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_c78b2023"),
    readiness: t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_c4907d27"),
  },
];

function AssetToolButton({
  label,
  description,
  selected,
  onClick,
}: {
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        "rounded-md border p-3 text-left transition-colors",
        selected ? "border-primary bg-primary/5" : "border-border/70 bg-background hover:bg-muted/40",
      ].join(" ")}
      onClick={onClick}
    >
      <div className="text-sm font-medium text-foreground">{label}</div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
    </button>
  );
}

export default function WorldAssetsTab(props: WorldAssetsTabProps) {
  const [activeTool, setActiveTool] = useState<AssetTool>("visualAssets");
  const {
    selectedLayerPrimaryField,
    libraryKeyword,
    setLibraryKeyword,
    libraryCategory,
    setLibraryCategory,
    publishName,
    setPublishName,
    publishCategory,
    setPublishCategory,
    publishDescription,
    setPublishDescription,
    snapshotLabel,
    setSnapshotLabel,
    diffFrom,
    setDiffFrom,
    diffTo,
    setDiffTo,
    importFormat,
    setImportFormat,
    importContent,
    setImportContent,
    libraryItems,
    snapshots,
    diffChanges,
    createSnapshotPending,
    publishPending,
    importPending,
    onRefreshLibrary,
    onInjectLibraryField,
    onInjectLibraryStructure,
    onPublishLibrary,
    onCreateSnapshot,
    onRestoreSnapshot,
    onDiffSnapshots,
    onExport,
    onImport,
  } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("gen.pages.worlds.components.workspace.WorldAssetsTab.worldMaterialsAndVersions")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <AssetToolButton
            label={t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_7c9906e4")}
            description={t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_fa9f3c53")}
            selected={activeTool === "visualAssets"}
            onClick={() => setActiveTool("visualAssets")}
          />
          <AssetToolButton
            label={t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_35808e79")}
            description={t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_ab53fb4b")}
            selected={activeTool === "references"}
            onClick={() => setActiveTool("references")}
          />
          <AssetToolButton
            label={t("gen.pages.worlds.components.workspace.WorldAssetsTab.worldAssets")}
            description={t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_7d08c16d")}
            selected={activeTool === "library"}
            onClick={() => setActiveTool("library")}
          />
          <AssetToolButton
            label={t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_387b56ef")}
            description={t("gen.pages.worlds.components.workspace.WorldAssetsTab.saveVersionCompareDifferencesTwoSettings")}
            selected={activeTool === "snapshots"}
            onClick={() => setActiveTool("snapshots")}
          />
          <AssetToolButton
            label={t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_9344b89b")}
            description={t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_e38602e1")}
            selected={activeTool === "export"}
            onClick={() => setActiveTool("export")}
          />
          <AssetToolButton
            label={t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_e0b20cd3")}
            description={t("gen.pages.worlds.components.workspace.WorldAssetsTab.createWorldFromTextMarkdownJSON")}
            selected={activeTool === "import"}
            onClick={() => setActiveTool("import")}
          />
        </div>

        {activeTool === "visualAssets" ? (
          <div className="rounded-md border p-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="font-medium">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.worldAssetPlanning")}</div>
                <div className="mt-1 text-sm leading-6 text-muted-foreground">
                  地图、势力图谱、时间线和体系树都从世界手册延伸出来。先把规则、势力、地点和张力整理清楚，再生成可视化资产。
                </div>
              </div>
              <Badge variant="outline">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_b8c3131b")}</Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {WORLD_ASSET_PRESETS.map((asset) => {
                const Icon = asset.icon;
                return (
                  <div key={asset.title} className="rounded-md border border-dashed border-border/80 bg-muted/20 p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                      {asset.title}
                    </div>
                    <div className="mt-2 text-xs leading-5 text-muted-foreground">{asset.description}</div>
                    <div className="mt-3 rounded-md bg-background p-2 text-xs leading-5 text-muted-foreground">
                      {asset.readiness}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {activeTool === "references" ? (
          <div className="rounded-md border p-3">
            <div className="mb-3 font-medium">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_35808e79")}</div>
            <KnowledgeBindingPanel targetType="world" targetId={props.worldId} title={t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_35808e79")} />
          </div>
        ) : null}

        {activeTool === "library" ? (
          <div className="rounded-md border p-3 space-y-2">
            <div className="font-medium">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.worldAssets")}</div>
            <div className="grid gap-2 md:grid-cols-3">
              <Input
                placeholder={t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_9699a50e")}
                value={libraryKeyword}
                onChange={(event) => setLibraryKeyword(event.target.value)}
              />
              <SelectControl
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={libraryCategory}
                onChange={(event) => setLibraryCategory(event.target.value)}
              >
                <option value="all">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_1a750305")}</option>
                <option value="terrain">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_68c990ac")}</option>
                <option value="race">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_003ad50b")}</option>
                <option value="power_system">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_9185e0fc")}</option>
                <option value="organization">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_0eb4a414")}</option>
                <option value="resource">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_eee83a92")}</option>
                <option value="event">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.event")}</option>
                <option value="artifact">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_6916ec11")}</option>
                <option value="custom">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_f1d4ff50")}</option>
              </SelectControl>
              <Button variant="outline" onClick={onRefreshLibrary}>
                刷新
              </Button>
            </div>
            <div className="rounded-md border p-2 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">
                保存当前设定为世界素材
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <Input
                  placeholder={t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_a78225be")}
                  value={publishName}
                  onChange={(event) => setPublishName(event.target.value)}
                />
                <SelectControl
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={publishCategory}
                  onChange={(event) => setPublishCategory(event.target.value)}
                >
                  <option value="custom">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_f1d4ff50")}</option>
                  <option value="terrain">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_68c990ac")}</option>
                  <option value="race">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_003ad50b")}</option>
                  <option value="power_system">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_9185e0fc")}</option>
                  <option value="organization">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_0eb4a414")}</option>
                  <option value="resource">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_eee83a92")}</option>
                  <option value="event">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.event")}</option>
                  <option value="artifact">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_6916ec11")}</option>
                </SelectControl>
                <Button onClick={onPublishLibrary} disabled={publishPending}>
                  {publishPending ? t("gen.pages.worlds.components.workspace.WorldAssetsTab.savingInProgressDotDotDot") : t("gen.pages.worlds.components.workspace.WorldAssetsTab.saveMaterials")}
                </Button>
              </div>
              <textarea
                className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
                value={publishDescription}
                onChange={(event) => setPublishDescription(event.target.value)}
                placeholder={t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_dbdf34ed")}
              />
            </div>
            {libraryItems.map((item) => (
              <div key={item.id} className="rounded border p-3 text-sm space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div>{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.category} / 使用次数={item.usageCount}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => onInjectLibraryField(item.id)}>
                    加入当前分层（{selectedLayerPrimaryField}）
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onInjectLibraryStructure(item.id, "forces")}>
                    加入势力手册
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onInjectLibraryStructure(item.id, "locations")}>
                    加入地点手册
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {activeTool === "snapshots" ? (
          <div className="rounded-md border p-3 space-y-2">
          <div className="font-medium">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_387b56ef")}</div>
          <div className="flex gap-2">
            <Input
              placeholder={t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_a595b969")}
              value={snapshotLabel}
              onChange={(event) => setSnapshotLabel(event.target.value)}
            />
            <Button onClick={onCreateSnapshot} disabled={createSnapshotPending}>
              创建快照
            </Button>
          </div>
          {snapshots.map((snapshot) => (
            <div key={snapshot.id} className="flex items-center justify-between rounded border p-2 text-sm">
              <div>
                {snapshot.label ?? snapshot.id.slice(0, 8)} / {new Date(snapshot.createdAt).toLocaleString()}
              </div>
              <Button size="sm" variant="outline" onClick={() => onRestoreSnapshot(snapshot.id)}>
                恢复
              </Button>
            </div>
          ))}
          <div className="grid gap-2 md:grid-cols-3">
            <SelectControl
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={diffFrom}
              onChange={(event) => setDiffFrom(event.target.value)}
            >
              <option value="">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_dbc08aae")}</option>
              {snapshots.map((snapshot) => (
                <option key={`from-${snapshot.id}`} value={snapshot.id}>
                  {snapshot.label ?? snapshot.id.slice(0, 8)}
                </option>
              ))}
            </SelectControl>
            <SelectControl
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={diffTo}
              onChange={(event) => setDiffTo(event.target.value)}
            >
              <option value="">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_aa78a7d5")}</option>
              {snapshots.map((snapshot) => (
                <option key={`to-${snapshot.id}`} value={snapshot.id}>
                  {snapshot.label ?? snapshot.id.slice(0, 8)}
                </option>
              ))}
            </SelectControl>
            <Button onClick={onDiffSnapshots} disabled={!diffFrom || !diffTo}>
              对比差异
            </Button>
          </div>
          {diffChanges.map((change) => (
            <div key={change.field} className="rounded border p-2 text-xs">
              {change.field}: {change.before ?? t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_b7612b71")} {"->"} {change.after ?? t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_b7612b71")}
            </div>
          ))}
          </div>
        ) : null}

        {activeTool === "export" ? (
          <div className="rounded-md border p-3 space-y-2">
          <div className="font-medium">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_9344b89b")}</div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void onExport("markdown")}>
              导出 Markdown（复制到剪贴板）
            </Button>
            <Button variant="secondary" onClick={() => void onExport("json")}>
              导出 JSON（复制到剪贴板）
            </Button>
          </div>
          </div>
        ) : null}

        {activeTool === "import" ? (
          <div className="rounded-md border p-3 space-y-2">
          <div className="font-medium">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_e0b20cd3")}</div>
          <SelectControl
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={importFormat}
            onChange={(event) => setImportFormat(event.target.value as "json" | "markdown" | "text")}
          >
            <option value="text">{t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_ffb01e5b")}</option>
            <option value="markdown">Markdown</option>
            <option value="json">JSON</option>
          </SelectControl>
          <textarea
            className="min-h-[160px] w-full rounded-md border bg-background p-2 text-sm"
            value={importContent}
            onChange={(event) => setImportContent(event.target.value)}
            placeholder={t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_2ab5150a")}
          />
          <Button onClick={onImport} disabled={importPending || !importContent.trim()}>
            {importPending ? t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_763476f8") : t("gen.pages.worlds.components.workspace.WorldAssetsTab.gen_920562d7")}
          </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
