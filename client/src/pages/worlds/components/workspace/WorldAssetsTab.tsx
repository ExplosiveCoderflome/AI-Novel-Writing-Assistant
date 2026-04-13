import type { Dispatch, SetStateAction } from "react";
import type { World, WorldSnapshot } from "@ai-novel/shared/types/world";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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

export default function WorldAssetsTab(props: WorldAssetsTabProps) {
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
        <CardTitle>素材库 + 快照版本 + 导入导出</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-3 space-y-2">
          <div className="font-medium">素材库</div>
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
              将当前设定发布到素材库
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
                {publishPending ? "发布中..." : "发布素材"}
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
                  注入到当前分层（{selectedLayerPrimaryField}）
                </Button>
                <Button size="sm" variant="outline" onClick={() => onInjectLibraryStructure(item.id, "forces")}>
                  注入到结构化势力
                </Button>
                <Button size="sm" variant="outline" onClick={() => onInjectLibraryStructure(item.id, "locations")}>
                  注入到结构化地点
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-md border p-3 space-y-2">
          <div className="font-medium">快照版本</div>
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

        <div className="rounded-md border p-3 space-y-2">
          <div className="font-medium">导出</div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void onExport("markdown")}>
              导出 Markdown（复制到剪贴板）
            </Button>
            <Button variant="secondary" onClick={() => void onExport("json")}>
              导出 JSON（复制到剪贴板）
            </Button>
          </div>
        </div>

        <div className="rounded-md border p-3 space-y-2">
          <div className="font-medium">导入</div>
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
      </CardContent>
    </Card>
  );
}
