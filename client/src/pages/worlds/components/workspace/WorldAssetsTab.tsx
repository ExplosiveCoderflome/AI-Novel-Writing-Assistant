import { useState, type Dispatch, type SetStateAction } from "react";
import { GitCompareArrows, GitFork, Map, Network, Workflow } from "lucide-react";
import type { World, WorldSnapshot } from "@ai-novel/shared/types/world";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import KnowledgeBindingPanel from "@/components/knowledge/KnowledgeBindingPanel";

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
    title: "世界地图",
    description: "用区域、道路、边境和故事地点解释角色如何移动，冲突会在哪里爆发。",
    readiness: "先补故事舞台、地点风险和势力控制区。",
  },
  {
    icon: Network,
    title: "势力图谱",
    description: "把势力、阵营、盟友、敌对和附庸关系整理成可视化关系网。",
    readiness: "先补主要势力、当前目标和彼此压力。",
  },
  {
    icon: GitFork,
    title: "世界时间线",
    description: "记录重大事件、灾变、王朝更替和局势变化，让世界进展有轨迹。",
    readiness: "先补核心冲突、共同后果和关键历史节点。",
  },
  {
    icon: GitCompareArrows,
    title: "角色关系网",
    description: "把角色与势力、地点、资源和禁忌关系连接起来，减少设定漂移。",
    readiness: "先补角色归属、阵营压力和关键地点。",
  },
  {
    icon: Workflow,
    title: "力量体系树",
    description: "把力量来源、升级路径、代价和禁忌边界整理成层级结构。",
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
        <CardTitle>世界资料与版本</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <AssetToolButton
            label="地图与图谱"
            description="预留世界资产入口。"
            selected={activeTool === "visualAssets"}
            onClick={() => setActiveTool("visualAssets")}
          />
          <AssetToolButton
            label="参考资料"
            description="关联能支撑世界设定的资料。"
            selected={activeTool === "references"}
            onClick={() => setActiveTool("references")}
          />
          <AssetToolButton
            label="世界素材"
            description="复用地点、势力、资源等可沉淀内容。"
            selected={activeTool === "library"}
            onClick={() => setActiveTool("library")}
          />
          <AssetToolButton
            label="版本快照"
            description="保存版本并比较两次设定差异。"
            selected={activeTool === "snapshots"}
            onClick={() => setActiveTool("snapshots")}
          />
          <AssetToolButton
            label="导出备份"
            description="复制 Markdown 或 JSON。"
            selected={activeTool === "export"}
            onClick={() => setActiveTool("export")}
          />
          <AssetToolButton
            label="导入文本"
            description="从文本、Markdown 或 JSON 创建世界。"
            selected={activeTool === "import"}
            onClick={() => setActiveTool("import")}
          />
        </div>

        {activeTool === "visualAssets" ? (
          <div className="rounded-md border p-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="font-medium">世界资产规划</div>
                <div className="mt-1 text-sm leading-6 text-muted-foreground">
                  地图、势力图谱、时间线和体系树都从世界手册延伸出来。先把规则、势力、地点和张力整理清楚，再生成可视化资产。
                </div>
              </div>
              <Badge variant="outline">预留能力</Badge>
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
            <div className="mb-3 font-medium">参考资料</div>
            <KnowledgeBindingPanel targetType="world" targetId={props.worldId} title="参考资料" />
          </div>
        ) : null}

        {activeTool === "library" ? (
          <div className="rounded-md border p-3 space-y-2">
            <div className="font-medium">世界素材</div>
            <div className="grid gap-2 md:grid-cols-3">
              <Input
                placeholder="关键词"
                value={libraryKeyword}
                onChange={(event) => setLibraryKeyword(event.target.value)}
              />
              <select
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={libraryCategory}
                onChange={(event) => setLibraryCategory(event.target.value)}
              >
                <option value="all">全部分类</option>
                <option value="terrain">地理地貌</option>
                <option value="race">种族</option>
                <option value="power_system">力量体系</option>
                <option value="organization">组织势力</option>
                <option value="resource">资源</option>
                <option value="event">事件</option>
                <option value="artifact">道具奇物</option>
                <option value="custom">自定义</option>
              </select>
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
                  placeholder="素材名称"
                  value={publishName}
                  onChange={(event) => setPublishName(event.target.value)}
                />
                <select
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={publishCategory}
                  onChange={(event) => setPublishCategory(event.target.value)}
                >
                  <option value="custom">自定义</option>
                  <option value="terrain">地理地貌</option>
                  <option value="race">种族</option>
                  <option value="power_system">力量体系</option>
                  <option value="organization">组织势力</option>
                  <option value="resource">资源</option>
                  <option value="event">事件</option>
                  <option value="artifact">道具奇物</option>
                </select>
                <Button onClick={onPublishLibrary} disabled={publishPending}>
                  {publishPending ? "保存中..." : "保存素材"}
                </Button>
              </div>
              <textarea
                className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
                value={publishDescription}
                onChange={(event) => setPublishDescription(event.target.value)}
                placeholder="可选描述（留空时默认使用当前分层内容）"
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
          <div className="font-medium">版本快照</div>
          <div className="flex gap-2">
            <Input
              placeholder="快照标签（可选）"
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
            <select
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={diffFrom}
              onChange={(event) => setDiffFrom(event.target.value)}
            >
              <option value="">起始快照</option>
              {snapshots.map((snapshot) => (
                <option key={`from-${snapshot.id}`} value={snapshot.id}>
                  {snapshot.label ?? snapshot.id.slice(0, 8)}
                </option>
              ))}
            </select>
            <select
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={diffTo}
              onChange={(event) => setDiffTo(event.target.value)}
            >
              <option value="">目标快照</option>
              {snapshots.map((snapshot) => (
                <option key={`to-${snapshot.id}`} value={snapshot.id}>
                  {snapshot.label ?? snapshot.id.slice(0, 8)}
                </option>
              ))}
            </select>
            <Button onClick={onDiffSnapshots} disabled={!diffFrom || !diffTo}>
              对比差异
            </Button>
          </div>
          {diffChanges.map((change) => (
            <div key={change.field} className="rounded border p-2 text-xs">
              {change.field}: {change.before ?? "空"} {"->"} {change.after ?? "空"}
            </div>
          ))}
          </div>
        ) : null}

        {activeTool === "export" ? (
          <div className="rounded-md border p-3 space-y-2">
          <div className="font-medium">导出备份</div>
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
          <div className="font-medium">导入文本</div>
          <select
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={importFormat}
            onChange={(event) => setImportFormat(event.target.value as "json" | "markdown" | "text")}
          >
            <option value="text">纯文本</option>
            <option value="markdown">Markdown</option>
            <option value="json">JSON</option>
          </select>
          <textarea
            className="min-h-[160px] w-full rounded-md border bg-background p-2 text-sm"
            value={importContent}
            onChange={(event) => setImportContent(event.target.value)}
            placeholder="请粘贴要导入的内容"
          />
          <Button onClick={onImport} disabled={importPending || !importContent.trim()}>
            {importPending ? "导入中..." : "导入为新世界"}
          </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
