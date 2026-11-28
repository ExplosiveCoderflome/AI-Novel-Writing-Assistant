import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { characterForwardFieldNames } from "@ai-novel/shared/types/characterForwardAdjustment";
import { resolveForwardCharacterFields, type ChapterCharacterAdjustment, type ChapterCharacterSnapshot, type ForwardFieldPatch } from "./fieldPolicy";

const storedFields = z.partialRecord(z.enum(characterForwardFieldNames), z.string().nullable());

export async function readChapterCharacterAdjustments(
  db: Prisma.TransactionClient,
  novelId: string,
  chapterOrder: number,
  includeCurrent = false,
  characterId?: string,
): Promise<Map<string, ForwardFieldPatch>> {
  const changes = await db.characterForwardAdjustment.findMany({ where: { novelId, characterId } });
  if (!changes.length) return new Map();

  const byCharacter = new Map<string, ChapterCharacterAdjustment[]>();
  for (const change of changes) {
    const items = byCharacter.get(change.characterId) ?? [];
    items.push({ ...change, before: storedFields.parse(JSON.parse(change.beforeJson)), after: storedFields.parse(JSON.parse(change.afterJson)) });
    byCharacter.set(change.characterId, items);
  }
  const states = await db.characterState.findMany({
    where: {
      characterId: { in: [...byCharacter.keys()] },
      snapshot: { novelId, sourceChapter: { order: includeCurrent ? { lte: chapterOrder } : { lt: chapterOrder } } },
      OR: [{ currentGoal: { not: null } }, { summary: { not: null } }],
    },
    select: { characterId: true, currentGoal: true, summary: true, updatedAt: true, snapshot: {
      select: { sourceChapter: { select: { order: true } } },
    } },
  });
  const snapshots = new Map<string, ChapterCharacterSnapshot[]>();
  for (const state of states) {
    const source = state.snapshot.sourceChapter;
    if (!source) continue;
    const items = snapshots.get(state.characterId) ?? [];
    items.push({ chapterOrder: source.order, createdAt: state.updatedAt, currentGoal: state.currentGoal, currentState: state.summary });
    snapshots.set(state.characterId, items);
  }
  return new Map([...byCharacter].map(([id, items]) => [
    id, resolveForwardCharacterFields(chapterOrder, items, snapshots.get(id) ?? []),
  ]));
}
