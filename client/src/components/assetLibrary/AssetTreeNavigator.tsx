import { useState } from "react";
import { ChevronDown, ChevronRight, FolderTree } from "lucide-react";

export interface AssetTreeNode {
  id: string;
  name: string;
  children: AssetTreeNode[];
}

interface AssetTreeNavigatorProps<Node extends AssetTreeNode> {
  nodes: Node[];
  selectedId: string;
  onSelect: (nodeId: string) => void;
  title: string;
  hint: string;
  ariaLabel: string;
  viewportClassName?: string;
}

interface AssetTreeRowProps<Node extends AssetTreeNode> {
  node: Node;
  depth: number;
  selectedId: string;
  onSelect: (nodeId: string) => void;
}

function AssetTreeRow<Node extends AssetTreeNode>({
  node,
  depth,
  selectedId,
  onSelect,
}: AssetTreeRowProps<Node>) {
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = node.children.length > 0;
  const selected = selectedId === node.id;

  return (
    <div role="treeitem" aria-selected={selected} aria-expanded={hasChildren ? expanded : undefined}>
      <div
        className={`group flex min-h-9 items-center rounded-md pr-2 transition-colors ${
          selected ? "bg-foreground text-background" : "text-foreground hover:bg-muted/60"
        }`}
        style={{ paddingLeft: `${depth * 18 + 6}px` }}
      >
        <button
          type="button"
          className={`mr-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            selected ? "text-background/70 hover:bg-background/10" : "text-muted-foreground hover:bg-muted"
          }`}
          onClick={() => {
            if (hasChildren) setExpanded((value) => !value);
            else onSelect(node.id);
          }}
          aria-label={hasChildren ? `${expanded ? "折叠" : "展开"}「${node.name}」` : `选择「${node.name}」`}
        >
          {hasChildren ? (
            expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <span className={`h-1.5 w-1.5 rounded-full ${selected ? "bg-background/70" : "bg-border"}`} />
          )}
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center justify-between gap-2 py-2 text-left text-sm focus-visible:outline-none"
          onClick={() => onSelect(node.id)}
        >
          <span className="truncate font-medium">{node.name}</span>
          {node.children.length > 0 ? (
            <span className={`shrink-0 text-[11px] ${selected ? "text-background/60" : "text-muted-foreground"}`}>
              {node.children.length}
            </span>
          ) : null}
        </button>
      </div>

      {hasChildren && expanded ? (
        <div role="group" className="relative">
          <span
            className="pointer-events-none absolute bottom-1 top-0 w-px bg-border/70"
            style={{ left: `${depth * 18 + 19}px` }}
            aria-hidden="true"
          />
          {node.children.map((child) => (
            <AssetTreeRow
              key={child.id}
              node={child as Node}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function AssetTreeNavigator<Node extends AssetTreeNode>({
  nodes,
  selectedId,
  onSelect,
  title,
  hint,
  ariaLabel,
  viewportClassName,
}: AssetTreeNavigatorProps<Node>) {
  return (
    <div className="border-b border-border/70 bg-muted/15 lg:border-b-0 lg:border-r">
      <div className="flex h-12 items-center justify-between border-b border-border/70 px-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FolderTree className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {title}
        </div>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <nav
        className={`overflow-y-auto p-2 ${viewportClassName ?? "max-h-[58vh] lg:max-h-[640px]"}`}
        aria-label={ariaLabel}
      >
        <div role="tree" className="space-y-0.5">
          {nodes.map((node) => (
            <AssetTreeRow
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      </nav>
    </div>
  );
}
