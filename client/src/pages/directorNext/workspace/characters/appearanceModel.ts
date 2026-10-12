import type {CharacterAppearanceChapter, DirectorNovelCharacterAppearances} from "@ai-novel/shared/types/director/characterAppearances";
import type {VolumePlanDocument} from "@ai-novel/shared/types/novel";
export type AppearanceBoundary = number | null | "latest";
export type AppearanceRow = CharacterAppearanceChapter | (Omit<CharacterAppearanceChapter,"chapterId"> & {chapterId:null;planId:string});
export type AppearanceDestination = {kind:"chapter";id:string} | {kind:"plan";id:string};
export const appearanceLabels = {present: "实际出场", mention: "仅被提及", flashback: "回忆出场", dream: "梦境出场"};

export function appearanceDestination(row: AppearanceRow): AppearanceDestination {
  return row.chapterId === null ? {kind:"plan",id:row.planId} : {kind:"chapter",id:row.chapterId};
}

/** Planning-only rows are navigation placeholders, never inferred character participation. */
export function projectAppearanceRows(chapters: CharacterAppearanceChapter[], planning?: Pick<VolumePlanDocument,"volumes">, characterId?: string | null): AppearanceRow[] {
  const rows: AppearanceRow[] = [...chapters];
  const chapterIds = new Set(chapters.map(row=>row.chapterId));
  const orders = new Set(chapters.map(row=>row.chapterOrder));
  for (const plan of planning?.volumes.flatMap(volume=>volume.chapters) ?? []) {
    if (orders.has(plan.chapterOrder) || (plan.chapterId && chapterIds.has(plan.chapterId))) continue;
    rows.push({chapterId:null,planId:plan.id,chapterOrder:plan.chapterOrder,chapterTitle:plan.title,
      planned: characterId === undefined ? false : characterId === null ? (plan.plannedCharacterIds?.length ?? 0) > 0 : plan.plannedCharacterIds?.includes(characterId) ?? false,
      ...(plan.plannedCharacterIds !== undefined ? {planSource:"initial" as const} : {}),coverage:"unwritten",events:[]});
    orders.add(plan.chapterOrder);
  }
  return rows.sort((a,b)=>a.chapterOrder-b.chapterOrder);
}

/** A null character selects the shared chapter axis, without inferring any participation. */
export function projectCastAppearanceRows(chapters: DirectorNovelCharacterAppearances["chapters"], characterId: string | null, planning?: Pick<VolumePlanDocument,"volumes">): AppearanceRow[] {
  return projectAppearanceRows(chapters.map(({plannedCharacterIds, ...chapter}) => ({...chapter,
    planned: characterId === null ? plannedCharacterIds.length > 0 : plannedCharacterIds.includes(characterId),
    events: characterId === null ? chapter.events : chapter.events.filter(event => event.characterId === characterId),
  })), planning, characterId);
}

export function visibleAppearances(rows: AppearanceRow[], boundary: AppearanceBoundary) {
  return rows.filter(row => boundary === "latest" || (boundary !== null && row.chapterOrder <= boundary))
    .sort((a,b) => a.chapterOrder-b.chapterOrder);
}

export function summarizeAppearances(rows: AppearanceRow[], boundary: AppearanceBoundary) {
  const visible = visibleAppearances(rows, boundary);
  const actual = visible.filter(row => row.events.some(event => event.kind === "present"));
  return {first: actual[0]?.chapterOrder ?? null, last: actual[actual.length-1]?.chapterOrder ?? null,
    count: actual.length,
    missed: visible.filter(row => row.planned && row.coverage === "recorded" && !row.events.some(event => event.kind === "present")).map(row => row.chapterOrder),
    planned: visible.filter(row => row.planned).map(row => row.chapterOrder)};
}

/** Paginate known chapters without collapsing chapters that have no appearance. */
export function appearanceTimelinePage(rows: AppearanceRow[], boundary: AppearanceBoundary, requestedPage: number | null = null) {
  const visible = visibleAppearances(rows, boundary);
  const pageSize = 24;
  const pageCount = Math.ceil(visible.length / pageSize);
  let focus = visible.length - 1;
  if (boundary === "latest") {
    while (focus >= 0 && visible[focus].events.length === 0) focus--;
    if (focus < 0) focus = visible.findIndex(row => row.planned);
  }
  const page = Math.max(0, Math.min(pageCount - 1, requestedPage ?? Math.floor(Math.max(0, focus) / pageSize)));
  return {rows: visible.slice(page * pageSize, (page + 1) * pageSize), page, pageCount};
}
