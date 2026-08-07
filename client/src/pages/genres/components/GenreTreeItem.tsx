import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import type { GenreTreeNode } from "@/api/genre";
import { Button } from "@/components/ui/button";
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
    <div className={depth > 0 ? "ml-3 border-l border-border/60 pl-3 sm:ml-5 sm:pl-5" : ""}>
      <div className="rounded-md border border-border/70 bg-background/70 p-3 sm:p-4">
        <div className="flex items-start gap-3">
          {hasChildren ? (
            <button
              type="button"
              className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setExpanded((value) => !value)}
              aria-label={expanded ? `折叠「${node.name}」` : `展开「${node.name}」`}
              aria-expanded={expanded}
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <span className="mt-0.5 h-7 w-7 shrink-0" aria-hidden="true" />
          )}

          <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-foreground">{node.name}</div>
                <span className="rounded-md border border-border/70 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
                  {node.novelCount > 0 ? `用于 ${node.novelCount} 本小说` : "Unrelated novels"}
                </span>
                {node.childCount > 0 ? (
                  <span className="rounded-md border border-border/70 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
                    {node.childCount} direct subclass
                                                        </span>
                ) : null}
              </div>
              <div className="text-sm leading-6 text-muted-foreground">
                {node.description?.trim() || "The subject matter and positioning are not yet specified; it is recommended to add information about reader expectations and the core creative direction."}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-1 border-t border-border/60 pt-2 lg:justify-end lg:border-t-0 lg:pt-0">
              <Button type="button" variant="ghost" size="sm" onClick={() => onCreateChild(node.id)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add new subcategory
                                            </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(node.id)}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                edit
                                            </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={deleteDisabled || deletingId === node.id}
                title={deleteDisabled ? "The current category or lower category is still used by the novel. Please adjust the subject matter of the associated novel first." : undefined}
                onClick={() => onDelete(node)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {deletingId === node.id ? "deleting..." : "deleting"}
              </Button>
            </div>
          </div>
        </div>
      </div>

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
