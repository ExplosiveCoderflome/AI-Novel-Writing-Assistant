import type { GenreTreeDraft, GenreTreeNode } from "@/api/genre";

export function createEmptyGenreDraft(): GenreTreeDraft {
  return {
    name: "",
    description: "",
    children: [],
  };
}

export function cloneGenreDraft(draft: GenreTreeDraft): GenreTreeDraft {
  return {
    name: draft.name,
    description: draft.description ?? "",
    children: draft.children.map((child) => cloneGenreDraft(child)),
  };
}

export function findGenreNode(nodes: GenreTreeNode[], id: string): GenreTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    const childMatch = findGenreNode(node.children, id);
    if (childMatch) {
      return childMatch;
    }
  }
  return null;
}

export function collectDescendantIds(node: GenreTreeNode): string[] {
  return node.children.flatMap((child) => [child.id, ...collectDescendantIds(child)]);
}

export function countGenres(nodes: GenreTreeNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countGenres(node.children), 0);
}

export function countGenreNovelBindingsInSubtree(node: GenreTreeNode): number {
  return node.novelCount + node.children.reduce(
    (total, child) => total + countGenreNovelBindingsInSubtree(child),
    0,
  );
}
