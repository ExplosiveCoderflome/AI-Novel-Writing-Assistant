import type { KnowledgeBindingTargetType } from "@ai-novel/shared/types/knowledge";
import { prisma } from "../../db/prisma";
import { computeChunkHash, normalizeRagText } from "../rag/utils";

export interface ActiveKnowledgeDocumentContent {
  id: string;
  title: string;
  fileName: string;
  status: "enabled" | "disabled" | "archived";
  activeVersionNumber: number;
  content: string;
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.map((item) => item.trim()).filter(Boolean)));
}

function stripFileExtension(fileName: string): string {
  const normalized = fileName.trim();
  if (!normalized) {
    return "Untitled knowledge";
  }
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex <= 0) {
    return normalized;
  }
  return normalized.slice(0, dotIndex).trim() || normalized;
}

export function normalizeKnowledgeContent(content: string): string {
  const normalized = normalizeRagText(content);
  if (!normalized) {
    throw new Error("Knowledge document content cannot be empty.");
  }
  return normalized;
}

export function normalizeKnowledgeDocumentTitle(title: string | undefined, fileName: string): string {
  const candidate = title?.trim() || stripFileExtension(fileName);
  const normalized = candidate.replace(/\s+/g, " ").trim();
  if (!normalized) {
    throw new Error("Knowledge document title cannot be empty.");
  }
  return normalized;
}

export function buildKnowledgeContentHash(content: string): string {
  return computeChunkHash(normalizeKnowledgeContent(content));
}

export async function resolveKnowledgeDocumentIds(input: {
  targetType?: KnowledgeBindingTargetType;
  targetId?: string;
  knowledgeDocumentIds?: string[];
}): Promise<string[]> {
  const explicitIds = input.knowledgeDocumentIds;
  if (Array.isArray(explicitIds)) {
    if (explicitIds.length === 0) {
      return [];
    }
    const rows = await prisma.knowledgeDocument.findMany({
      where: {
        id: { in: uniqueIds(explicitIds) },
        status: { not: "archived" },
      },
      select: { id: true },
    });
    return rows.map((item) => item.id);
  }

  if (input.targetType && input.targetId) {
    const bindings = await prisma.knowledgeBinding.findMany({
      where: {
        targetType: input.targetType,
        targetId: input.targetId,
        document: {
          status: "enabled",
        },
      },
      select: { documentId: true },
    });
    if (bindings.length > 0) {
      return uniqueIds(bindings.map((item) => item.documentId));
    }
  }

  const documents = await prisma.knowledgeDocument.findMany({
    where: { status: "enabled" },
    select: { id: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  return documents.map((item) => item.id);
}

export async function listActiveKnowledgeDocumentContents(
  documentIds: string[],
  options?: {
    allowDisabled?: boolean;
  },
): Promise<ActiveKnowledgeDocumentContent[]> {
  const ids = uniqueIds(documentIds);
  if (ids.length === 0) {
    return [];
  }
  const rows = await prisma.knowledgeDocument.findMany({
    where: {
      id: { in: ids },
      ...(options?.allowDisabled ? { status: { not: "archived" } } : { status: "enabled" }),
      activeVersionId: { not: null },
    },
    include: {
      activeVersion: true,
    },
  });
  return rows
    .filter((item) => item.activeVersion)
    .map((item) => ({
      id: item.id,
      title: item.title,
      fileName: item.fileName,
      status: item.status,
      activeVersionNumber: item.activeVersionNumber,
      content: item.activeVersion?.content ?? "",
    }))
    .filter((item) => item.content.trim().length > 0);
}
