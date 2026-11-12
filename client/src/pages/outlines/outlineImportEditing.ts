import type { OutlineDocument } from "@ai-novel/shared/types/outline";

export type ImportNodeCollection = "volumes" | "chapters" | "characters" | "payoffs" | "facts";
export type ImportReferenceCollection = "chapters" | "characters" | "payoffs" | "facts";
export type ImportReferenceField = "characterNodeIds"
  | "payoffNodeIds"
  | "appearanceNodeIds"
  | "setupChapterNodeIds"
  | "payoffChapterNodeIds"
  | "relatedNodeIds";

export function updateImportNodeTitle(
  document: OutlineDocument,
  collection: ImportNodeCollection,
  nodeId: string,
  title: string,
): OutlineDocument {
  return {
    ...document,
    [collection]: document[collection].map(node => {
      if (node.nodeId !== nodeId) return node;
      return collection === "characters" ? { ...node, name: title } : { ...node, title };
    }),
  } as OutlineDocument;
}

export function setImportChapterVolume(document: OutlineDocument, chapterId: string, volumeNodeId: string): OutlineDocument {
  const chapters = document.chapters.map(chapter => chapter.nodeId === chapterId ? { ...chapter, volumeNodeId } : chapter);
  return {
    ...document,
    chapters,
    volumes: document.volumes.map(volume => ({
      ...volume,
      chapterNodeIds: chapters.filter(chapter => chapter.volumeNodeId === volume.nodeId).map(chapter => chapter.nodeId),
    })),
  };
}

export function setImportReferences(
  document: OutlineDocument,
  collection: ImportReferenceCollection,
  nodeId: string,
  field: ImportReferenceField,
  referenceIds: string[],
): OutlineDocument {
  return {
    ...document,
    [collection]: document[collection].map(node => node.nodeId === nodeId ? { ...node, [field]: referenceIds } : node),
  } as OutlineDocument;
}

export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id];
}
