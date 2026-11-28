import { characterForwardFieldNames, type CharacterForwardFields } from "@ai-novel/shared/types/characterForwardAdjustment";

export type ForwardFieldPatch = Partial<CharacterForwardFields>;

export interface ChapterCharacterAdjustment {
  effectiveFromChapterOrder: number;
  revision: number;
  createdAt: Date;
  before: ForwardFieldPatch;
  after: ForwardFieldPatch;
}

export interface ChapterCharacterSnapshot {
  chapterOrder: number;
  createdAt: Date;
  currentState: string | null;
  currentGoal: string | null;
}

export function resolveForwardCharacterFields(
  chapterOrder: number,
  adjustments: ChapterCharacterAdjustment[],
  snapshots: ChapterCharacterSnapshot[],
): ForwardFieldPatch {
  const ordered = [...adjustments].sort((a, b) => a.effectiveFromChapterOrder - b.effectiveFromChapterOrder || a.revision - b.revision);
  const recent = [...snapshots].sort((a, b) => b.chapterOrder - a.chapterOrder || b.createdAt.getTime() - a.createdAt.getTime());
  const result: ForwardFieldPatch = {};
  for (const field of characterForwardFieldNames) {
    const changes = ordered.filter(item => item.after[field] !== undefined);
    if (changes.length === 0) continue;
    const effective = changes.filter(item => item.effectiveFromChapterOrder <= chapterOrder).at(-1);
    const baseline = changes.reduce((first, item) => item.revision < first.revision ? item : first);
    const snapshot = field === "development" ? undefined : recent.find(item => (
      item[field]?.trim() && (!effective || (
        item.chapterOrder >= effective.effectiveFromChapterOrder && item.createdAt > effective.createdAt
      ))
    ));
    result[field] = field !== "development" && snapshot
      ? snapshot[field]?.trim() ?? null
      : effective ? effective.after[field] ?? null : baseline.before[field] ?? null;
  }
  return result;
}
