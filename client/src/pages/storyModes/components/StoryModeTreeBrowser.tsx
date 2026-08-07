import { useEffect, useMemo, useState } from "react";
import { BookOpen, CircleGauge, Pencil, Plus, Trash2, Workflow } from "lucide-react";
import type { StoryModeTreeNode } from "@/api/storyMode";
import { AssetTreeNavigator } from "@/components/assetLibrary";
import { Button } from "@/components/ui/button";

interface StoryModeTreeBrowserProps {
  nodes: StoryModeTreeNode[];
  onCreateChild: (parentId: string) => void;
  onEdit: (storyModeId: string) => void;
  onDelete: (node: StoryModeTreeNode) => void;
  deletingId?: string;
}

function findNode(nodes: StoryModeTreeNode[], targetId: string): StoryModeTreeNode | null {
  for (const node of nodes) {
    if (node.id === targetId) return node;
    const child = findNode(node.children, targetId);
    if (child) return child;
  }
  return null;
}

function findPath(nodes: StoryModeTreeNode[], targetId: string, parents: string[] = []): string[] {
  for (const node of nodes) {
    const nextPath = [...parents, node.name];
    if (node.id === targetId) return nextPath;
    const childPath = findPath(node.children, targetId, nextPath);
    if (childPath.length > 0) return childPath;
  }
  return [];
}

function countBindings(node: StoryModeTreeNode): number {
  return node.novelCount + node.children.reduce((total, child) => total + countBindings(child), 0);
}

function ContractList({ title, items, emptyText }: { title: string; items: string[]; emptyText: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      {items.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span key={item} className="rounded-md border border-border/70 bg-muted/20 px-2 py-1 text-xs text-foreground">
              {item}
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-sm text-muted-foreground">{emptyText}</div>
      )}
    </div>
  );
}

const conflictCeilingLabel = {
  low: "低强度",
  medium: "中等强度",
  high: "高强度",
} as const;

export default function StoryModeTreeBrowser({
  nodes,
  onCreateChild,
  onEdit,
  onDelete,
  deletingId,
}: StoryModeTreeBrowserProps) {
  const [selectedId, setSelectedId] = useState(nodes[0]?.id ?? "");
  const selectedNode = useMemo(() => findNode(nodes, selectedId), [nodes, selectedId]);
  const selectedPath = useMemo(() => findPath(nodes, selectedId), [nodes, selectedId]);

  useEffect(() => {
    if (!selectedNode && nodes[0]) setSelectedId(nodes[0].id);
  }, [nodes, selectedNode]);

  if (!selectedNode) return null;

  const profile = selectedNode.profile;
  const boundNovelCount = countBindings(selectedNode);
  const deleteDisabled = boundNovelCount > 0;
  const canCreateChild = !selectedNode.parentId;

  return (
    <div className="grid min-h-[560px] overflow-hidden rounded-lg border border-border/80 bg-background lg:grid-cols-[320px_minmax(0,1fr)]">
      <AssetTreeNavigator
        nodes={nodes}
        selectedId={selectedId}
        onSelect={setSelectedId}
        title="推进模式目录"
        hint="选择模式查看合同"
        ariaLabel="推进模式树"
      />

      <section className="flex min-w-0 flex-col" aria-labelledby="selected-story-mode-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-3">
          <div className="truncate text-xs text-muted-foreground">{selectedPath.join(" / ")}</div>
          <div className="flex items-center gap-1">
            {canCreateChild ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => onCreateChild(selectedNode.id)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                新增下级
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(selectedNode.id)}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              编辑
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={deleteDisabled || deletingId === selectedNode.id}
              title={deleteDisabled ? "当前模式或下级模式仍被小说使用，请先调整关联作品。" : undefined}
              onClick={() => onDelete(selectedNode)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {deletingId === selectedNode.id ? "删除中..." : "删除"}
            </Button>
          </div>
        </div>

        <div className="flex-1 px-5 py-6 sm:px-7 sm:py-8">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-medium tracking-[0.16em] text-muted-foreground">推进模式</div>
                <h2 id="selected-story-mode-title" className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                  {selectedNode.name}
                </h2>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-xs text-muted-foreground">
                <CircleGauge className="h-4 w-4" aria-hidden="true" />
                冲突上限：{conflictCeilingLabel[profile.conflictCeiling]}
              </div>
            </div>

            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              {selectedNode.description?.trim() || profile.coreDrive}
            </p>

            <div className="mt-7 grid gap-px overflow-hidden rounded-md border border-border/70 bg-border/70 md:grid-cols-2">
              <div className="bg-background p-4">
                <Workflow className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <div className="mt-3 text-xs font-medium text-muted-foreground">核心驱动</div>
                <div className="mt-1 text-sm leading-6 text-foreground">{profile.coreDrive}</div>
              </div>
              <div className="bg-background p-4">
                <BookOpen className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <div className="mt-3 text-xs font-medium text-muted-foreground">读者回报</div>
                <div className="mt-1 text-sm leading-6 text-foreground">{profile.readerReward}</div>
              </div>
              <div className="bg-background p-4">
                <div className="text-xs font-medium text-muted-foreground">章节推进单位</div>
                <div className="mt-1 text-sm leading-6 text-foreground">{profile.chapterUnit}</div>
              </div>
              <div className="bg-background p-4">
                <div className="text-xs font-medium text-muted-foreground">阶段回报</div>
                <div className="mt-1 text-sm leading-6 text-foreground">{profile.volumeReward}</div>
              </div>
            </div>

            <div className="mt-8 grid gap-7 md:grid-cols-2">
              <ContractList title="推进单元" items={profile.progressionUnits} emptyText="尚未定义推进单元" />
              <ContractList title="适合的冲突" items={profile.allowedConflictForms} emptyText="尚未定义适合的冲突" />
              <ContractList title="必须出现的信号" items={profile.mandatorySignals} emptyText="尚未定义必须信号" />
              <ContractList title="需要避免的信号" items={profile.antiSignals} emptyText="尚未定义规避信号" />
            </div>

            <div className="mt-8 border-l-2 border-foreground/20 pl-4">
              <div className="text-sm font-semibold text-foreground">解决方式</div>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">{profile.resolutionStyle}</p>
              {profile.forbiddenConflictForms.length > 0 ? (
                <p className="mt-3 text-xs leading-6 text-muted-foreground">
                  不适合：{profile.forbiddenConflictForms.join("、")}
                </p>
              ) : null}
            </div>

            {selectedNode.template?.trim() ? (
              <div className="mt-7 border-t border-border/70 pt-6">
                <div className="text-sm font-semibold text-foreground">AI 使用补充</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{selectedNode.template}</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
