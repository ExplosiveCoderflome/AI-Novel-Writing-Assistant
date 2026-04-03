import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import type { GenreTreeNode } from "@/api/genre";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { countGenreNovelBindingsInSubtree } from "../genreManagement.shared";

interface GenreTreeItemProps {
  node: GenreTreeNode;
  depth?: number;
  onCreateChild: (parentId: string) => void;
  onEdit: (genreId: string) => void;
  onDelete: (genre: GenreTreeNode) => void;
  deletingId?: string;
}

export default function GenreTreeItem({
  node,
  depth = 0,
  onCreateChild,
  onEdit,
  onDelete,
  deletingId,
}: GenreTreeItemProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const boundNovelCount = countGenreNovelBindingsInSubtree(node);
  const deleteDisabled = boundNovelCount > 0;

  return (
    <div className={depth > 0 ? "ml-4 border-l border-border/60 pl-4" : ""}>
      <Card className="border-border/70 bg-background/80 p-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-md border border-transparent text-muted-foreground transition hover:border-border hover:bg-muted/40"
            onClick={() => {
              if (hasChildren) {
                setExpanded((value) => !value);
              }
            }}
            aria-label={expanded ? "折叠" : "展开"}
          >
            {hasChildren ? (
              expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
            ) : (
              <span className="h-4 w-4" />
            )}
          </button>

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-foreground">{node.name}</div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                小说 {node.novelCount}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                子类 {node.childCount}
              </span>
            </div>
            <div className="text-sm leading-6 text-muted-foreground">
              {node.description?.trim() || "暂无描述。"}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => onCreateChild(node.id)}>
              <Plus className="mr-1 h-4 w-4" />
              新增子类
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(node.id)}>
              <Pencil className="mr-1 h-4 w-4" />
              编辑
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={deleteDisabled || deletingId === node.id}
              title={deleteDisabled ? "请先解绑当前分类或其子分类下的小说后再删除。" : undefined}
              onClick={() => onDelete(node)}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              {deletingId === node.id ? "删除中..." : "删除"}
            </Button>
          </div>
        </div>
      </Card>

      {hasChildren && expanded ? (
        <div className="mt-3 space-y-3">
          {node.children.map((child) => (
            <GenreTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              onCreateChild={onCreateChild}
              onEdit={onEdit}
              onDelete={onDelete}
              deletingId={deletingId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
