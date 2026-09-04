import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { StoryModeTreeNode } from "@/api/storyMode";
import { AssetTreeNavigator } from "@/components/assetLibrary";
import StoryModeProfileDetails from "@/components/storyModes/StoryModeProfileDetails";
import { Button } from "@/components/ui/button";

interface StoryModeTreeBrowserProps {
  nodes: StoryModeTreeNode[];
  onCreateChild: (parentId: string) => void;
  onEdit: (storyModeId: string) => void;
  onDelete: (node: StoryModeTreeNode) => void;
  deletingId?: string;
  initialSelectedId?: string;
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

export default function StoryModeTreeBrowser({
  nodes,
  onCreateChild,
  onEdit,
  onDelete,
  deletingId,
  initialSelectedId,
}: StoryModeTreeBrowserProps) {
  const [selectedId, setSelectedId] = useState(initialSelectedId || nodes[0]?.id || "");
  const selectedNode = useMemo(() => findNode(nodes, selectedId), [nodes, selectedId]);
  const selectedPath = useMemo(() => findPath(nodes, selectedId), [nodes, selectedId]);

  useEffect(() => {
    if (initialSelectedId && findNode(nodes, initialSelectedId)) {
      setSelectedId(initialSelectedId);
      return;
    }
    if (!selectedNode && nodes[0]) setSelectedId(nodes[0].id);
  }, [initialSelectedId, nodes, selectedNode]);

  if (!selectedNode) return null;

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
          <StoryModeProfileDetails node={selectedNode} titleId="selected-story-mode-title" />
        </div>
      </section>
    </div>
  );
}
