export interface CreationFoundationTreeNode {
  id: string;
  name: string;
  description?: string | null;
  children: CreationFoundationTreeNode[];
}

export function filterCreationFoundationTree<Node extends CreationFoundationTreeNode>(
  nodes: Node[],
  search: string,
): Node[] {
  const normalized = search.trim().toLocaleLowerCase("zh-CN");
  if (!normalized) {
    return nodes;
  }

  return nodes.flatMap((node) => {
    const filteredChildren = filterCreationFoundationTree(node.children as Node[], search);
    const matches = node.name.toLocaleLowerCase("zh-CN").includes(normalized)
      || node.description?.toLocaleLowerCase("zh-CN").includes(normalized);
    return matches || filteredChildren.length > 0
      ? [{ ...node, children: filteredChildren } as Node]
      : [];
  });
}

export function findCreationFoundationNode<Node extends CreationFoundationTreeNode>(
  nodes: Node[],
  nodeId: string,
): Node | null {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    const child = findCreationFoundationNode(node.children as Node[], nodeId);
    if (child) {
      return child;
    }
  }
  return null;
}

export function hasCreationFoundationChanged(
  current: { genreId: string; primaryStoryModeId: string },
  next: Partial<{ genreId: string; primaryStoryModeId: string }>,
): boolean {
  return (next.genreId !== undefined && next.genreId !== current.genreId)
    || (
      next.primaryStoryModeId !== undefined
      && next.primaryStoryModeId !== current.primaryStoryModeId
    );
}
