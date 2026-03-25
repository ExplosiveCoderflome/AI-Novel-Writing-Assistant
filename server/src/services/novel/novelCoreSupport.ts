import { prisma } from "../../db/prisma";
import { ragServices } from "../rag";
import type { RagOwnerType } from "../rag/types";
import { buildLegacyWorldContextFromWorld } from "./storyWorldSlice/storyWorldSliceFormatting";

export interface NovelWorldContextInput {
  world?: {
    name: string;
    worldType?: string | null;
    description?: string | null;
    axioms?: string | null;
    background?: string | null;
    geography?: string | null;
    magicSystem?: string | null;
    politics?: string | null;
    races?: string | null;
    religions?: string | null;
    technology?: string | null;
    conflicts?: string | null;
    history?: string | null;
    economy?: string | null;
    factions?: string | null;
  } | null;
}

export function queueRagUpsert(ownerType: RagOwnerType, ownerId: string): void {
  void ragServices.ragIndexService.enqueueUpsert(ownerType, ownerId).catch(() => {
    // keep primary workflow resilient even when rag queueing fails
  });
}

export function queueRagDelete(ownerType: RagOwnerType, ownerId: string): void {
  void ragServices.ragIndexService.enqueueDelete(ownerType, ownerId).catch(() => {
    // keep primary workflow resilient even when rag queueing fails
  });
}

export function buildWorldContextFromNovel(novel: NovelWorldContextInput | null | undefined): string {
  return buildLegacyWorldContextFromWorld(novel?.world ?? null);
}

export async function ensureNovelCharacters(novelId: string, actionName: string, minCount = 1) {
  const count = await prisma.character.count({ where: { novelId } });
  if (count < minCount) {
    throw new Error(`请先在本小说中至少添加 ${minCount} 个角色后再${actionName}。`);
  }
}
