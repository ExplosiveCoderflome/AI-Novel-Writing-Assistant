import i18next from "i18next";
import { useState, type Dispatch, type SetStateAction } from "react";
import { GitCompareArrows, GitFork, Map, Network, Workflow } from "lucide-react";
import type { World, WorldSnapshot } from "@ai-novel/shared/types/world";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    title: i18next.t("dict.worldMap"),
    description: i18next.t("dict.gen_dffe62c3"),
    readiness: "先补故事舞台、地点风险和势力控制区。",
  },
  {
    icon: Network,
    title: i18next.t("dict.gen_de942453"),
    description: i18next.t("dict.gen_19f83c09"),
    readiness: "先补主要势力、当前目标和彼此压力。",
  },
  {
    icon: GitFork,
    title: i18next.t("dict.worldTimeline"),
    description: i18next.t("dict.gen_87d3f653"),
    readiness: "先补核心冲突、共同后果和关键历史节点。",
  },
  {
    icon: GitCompareArrows,
    title: i18next.t("dict.gen_6606fcbf"),
    description: i18next.t("dict.gen_e110856a"),
    readiness: "先补角色归属、阵营压力和关键地点。",
  },
  {
    icon: Workflow,
    title: i18next.t("dict.gen_3e265312"),
    description: i18next.t("dict.gen_c78b2023"),
    readiness: "先补核心规则、代价和不可突破的边界。",
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
        "shrink-0 rounded-full px-4 py-2 text-sm transition-colors",
        selected ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
      ].join(" ")}
      onClick={onClick}
      title={description}
    >
      {label}
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
    <section className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{i18next.t("dict.worldMaterialsAndVersions")}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{i18next.t("worlds.worldAssetsTab.ihjzlu")}</p>
        </div>

        <div className="flex gap-1 overflow-x-auto rounded-full bg-muted/30 p-1">
          <AssetToolButton
            label={i18next.t("dict.gen_7c9906e4")}
            description={i18next.t("dict.gen_fa9f3c53")}
            selected={activeTool === "visualAssets"}
            onClick={() => setActiveTool("visualAssets")}
          />
          <AssetToolButton
            label={i18next.t("dict.gen_35808e79")}
            description={i18next.t("dict.gen_ab53fb4b")}
            selected={activeTool === "references"}
            onClick={() => setActiveTool("references")}
          />
          <AssetToolButton
            label={i18next.t("dict.worldAssets")}
            description={i18next.t("dict.gen_7d08c16d")}
            selected={activeTool === "library"}
            onClick={() => setActiveTool("library")}
          />
          <AssetToolButton
            label={i18next.t("dict.gen_387b56ef")}
            description={i18next.t("dict.saveVersionCompareDifferencesTwoSettings")}
            selected={activeTool === "snapshots"}
            onClick={() => setActiveTool("snapshots")}
          />
          <AssetToolButton
            label={i18next.t("dict.gen_9344b89b")}
            description={i18next.t("dict.gen_e38602e1")}
            selected={activeTool === "export"}
            onClick={() => setActiveTool("export")}
          />
          <AssetToolButton
            label={i18next.t("dict.gen_e0b20cd3")}
            description={i18next.t("dict.createWorldFromTextMarkdownJSON")}
            selected={activeTool === "import"}
            onClick={() => setActiveTool("import")}
          />
        </div>

        {activeTool === "visualAssets" ? (
          <div className="rounded-3xl border border-border/35 bg-card/70 p-5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="font-medium">{i18next.t("dict.worldAssetPlanning")}</div>
                <div className="mt-1 text-sm leading-6 text-muted-foreground">{i18next.t("worlds.worldAssetsTab.wjqi6q")}</div>
              </div>
              <Badge variant="secondary" className="border-0 bg-muted/60 font-normal">{i18next.t("dict.gen_b8c3131b")}</Badge>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {WORLD_ASSET_PRESETS.map((asset) => {
                const Icon = asset.icon;
                return (
                  <div key={asset.title} className="rounded-2xl bg-muted/20 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                      {asset.title}
                    </div>
                    <div className="mt-2 text-xs leading-5 text-muted-foreground">{asset.description}</div>
                    <div className="mt-3 rounded-xl bg-background/70 p-3 text-xs leading-5 text-muted-foreground">
                      {asset.readiness}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {activeTool === "references" ? (
          <div className="rounded-3xl border border-border/35 bg-card/70 p-5">
            <div className="mb-3 font-medium">{i18next.t("dict.gen_35808e79")}</div>
            <KnowledgeBindingPanel targetType="world" targetId={props.worldId} title={i18next.t("dict.gen_35808e79")} />
          </div>
        ) : null}

        {activeTool === "library" ? (
          <div className="space-y-4 rounded-3xl border border-border/35 bg-card/70 p-5">
            <div className="font-medium">{i18next.t("dict.worldAssets")}</div>
            <div className="grid gap-2 md:grid-cols-3">
              <Input
                placeholder={i18next.t("dict.gen_9699a50e")}
                value={libraryKeyword}
                onChange={(event) => setLibraryKeyword(event.target.value)}
              />
              <SelectControl
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={libraryCategory}
                onChange={(event) => setLibraryCategory(event.target.value)}
              >
                <option value="all">{i18next.t("dict.gen_1a750305")}</option>
                <option value="terrain">{i18next.t("dict.gen_68c990ac")}</option>
                <option value="race">{i18next.t("dict.gen_003ad50b")}</option>
                <option value="power_system">{i18next.t("dict.gen_9185e0fc")}</option>
                <option value="organization">{i18next.t("dict.gen_0eb4a414")}</option>
                <option value="resource">{i18next.t("dict.gen_eee83a92")}</option>
                <option value="event">{i18next.t("dict.event")}</option>
                <option value="artifact">{i18next.t("dict.gen_6916ec11")}</option>
                <option value="custom">{i18next.t("dict.gen_f1d4ff50")}</option>
              </SelectControl>
              <Button variant="outline" onClick={onRefreshLibrary}>{i18next.t("drama.dramaProjectPage.ejix")}</Button>
            </div>
            <div className="space-y-3 rounded-2xl bg-muted/20 p-4">
              <div className="text-xs font-semibold text-muted-foreground">{i18next.t("worlds.worldAssetsTab.4fudf3")}</div>
              <div className="grid gap-2 md:grid-cols-3">
                <Input
                  placeholder={i18next.t("dict.gen_a78225be")}
                  value={publishName}
                  onChange={(event) => setPublishName(event.target.value)}
                />
                <SelectControl
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={publishCategory}
                  onChange={(event) => setPublishCategory(event.target.value)}
                >
                  <option value="custom">{i18next.t("dict.gen_f1d4ff50")}</option>
                  <option value="terrain">{i18next.t("dict.gen_68c990ac")}</option>
                  <option value="race">{i18next.t("dict.gen_003ad50b")}</option>
                  <option value="power_system">{i18next.t("dict.gen_9185e0fc")}</option>
                  <option value="organization">{i18next.t("dict.gen_0eb4a414")}</option>
                  <option value="resource">{i18next.t("dict.gen_eee83a92")}</option>
                  <option value="event">{i18next.t("dict.event")}</option>
                  <option value="artifact">{i18next.t("dict.gen_6916ec11")}</option>
                </SelectControl>
                <Button onClick={onPublishLibrary} disabled={publishPending}>
                  {publishPending ? "保存中..." : "保存素材"}
                </Button>
              </div>
              <textarea
                className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
                value={publishDescription}
                onChange={(event) => setPublishDescription(event.target.value)}
                placeholder={i18next.t("dict.gen_dbdf34ed")}
              />
            </div>
            {libraryItems.map((item) => (
              <div key={item.id} className="space-y-3 rounded-2xl border border-border/35 p-4 text-sm">
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
                  <Button size="sm" variant="outline" onClick={() => onInjectLibraryStructure(item.id, "forces")}>{i18next.t("worlds.worldAssetsTab.qk2iji")}</Button>
                  <Button size="sm" variant="outline" onClick={() => onInjectLibraryStructure(item.id, "locations")}>{i18next.t("worlds.worldAssetsTab.pvhpe9")}</Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {activeTool === "snapshots" ? (
          <div className="space-y-4 rounded-3xl border border-border/35 bg-card/70 p-5">
          <div className="font-medium">{i18next.t("dict.gen_387b56ef")}</div>
          <div className="flex gap-2">
            <Input
              placeholder={i18next.t("dict.gen_a595b969")}
              value={snapshotLabel}
              onChange={(event) => setSnapshotLabel(event.target.value)}
            />
            <Button onClick={onCreateSnapshot} disabled={createSnapshotPending}>{i18next.t("worlds.worldAssetsTab.ar6w63")}</Button>
          </div>
          {snapshots.map((snapshot) => (
            <div key={snapshot.id} className="flex items-center justify-between rounded-2xl bg-muted/20 p-3 text-sm">
              <div>
                {snapshot.label ?? snapshot.id.slice(0, 8)} / {new Date(snapshot.createdAt).toLocaleString()}
              </div>
              <Button size="sm" variant="outline" onClick={() => onRestoreSnapshot(snapshot.id)}>{i18next.t("dict.gen_c7db6d4f")}</Button>
            </div>
          ))}
          <div className="grid gap-2 md:grid-cols-3">
            <SelectControl
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={diffFrom}
              onChange={(event) => setDiffFrom(event.target.value)}
            >
              <option value="">{i18next.t("dict.gen_dbc08aae")}</option>
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
              <option value="">{i18next.t("dict.gen_aa78a7d5")}</option>
              {snapshots.map((snapshot) => (
                <option key={`to-${snapshot.id}`} value={snapshot.id}>
                  {snapshot.label ?? snapshot.id.slice(0, 8)}
                </option>
              ))}
            </SelectControl>
            <Button onClick={onDiffSnapshots} disabled={!diffFrom || !diffTo}>{i18next.t("worlds.worldAssetsTab.c1v4sv")}</Button>
          </div>
          {diffChanges.map((change) => (
            <div key={change.field} className="rounded-2xl bg-muted/20 p-3 text-xs">
              {change.field}: {change.before ?? "空"} {"->"} {change.after ?? "空"}
            </div>
          ))}
          </div>
        ) : null}

        {activeTool === "export" ? (
          <div className="space-y-3 rounded-3xl border border-border/35 bg-card/70 p-5">
          <div className="font-medium">{i18next.t("dict.gen_9344b89b")}</div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void onExport("markdown")}>{i18next.t("worlds.worldAssetsTab.w3d7j8")}</Button>
            <Button variant="secondary" onClick={() => void onExport("json")}>{i18next.t("worlds.worldAssetsTab.lllem5")}</Button>
          </div>
          </div>
        ) : null}

        {activeTool === "import" ? (
          <div className="space-y-3 rounded-3xl border border-border/35 bg-card/70 p-5">
          <div className="font-medium">{i18next.t("dict.gen_e0b20cd3")}</div>
          <SelectControl
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={importFormat}
            onChange={(event) => setImportFormat(event.target.value as "json" | "markdown" | "text")}
          >
            <option value="text">{i18next.t("dict.gen_ffb01e5b")}</option>
            <option value="markdown">Markdown</option>
            <option value="json">JSON</option>
          </SelectControl>
          <textarea
            className="min-h-[160px] w-full rounded-md border bg-background p-2 text-sm"
            value={importContent}
            onChange={(event) => setImportContent(event.target.value)}
            placeholder={i18next.t("dict.gen_2ab5150a")}
          />
          <Button onClick={onImport} disabled={importPending || !importContent.trim()}>
            {importPending ? "导入中..." : "导入为新世界"}
          </Button>
          </div>
        ) : null}
    </section>
  );
}
