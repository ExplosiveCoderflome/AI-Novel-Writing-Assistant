import type {
  CreativeHubResourceBinding,
  CreativeHubThread,
} from "@ai-novel/shared/types/creativeHub";

function normalizedBindingId(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

export function applyCreativeHubBindingPatch(
  current: CreativeHubResourceBinding,
  patch: Partial<CreativeHubResourceBinding>,
): CreativeHubResourceBinding {
  const next = { ...current, ...patch };
  if (
    patch.novelId !== undefined
    && normalizedBindingId(patch.novelId) !== normalizedBindingId(current.novelId)
  ) {
    next.chapterId = null;
    next.worldId = null;
  }
  return next;
}

export function buildCreativeHubBindingsFromSearch(
  searchParams: URLSearchParams,
): CreativeHubResourceBinding {
  const knowledgeIds = searchParams
    .getAll("knowledgeDocumentId")
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    novelId: searchParams.get("novelId")?.trim() || null,
    chapterId: searchParams.get("chapterId")?.trim() || null,
    worldId: searchParams.get("worldId")?.trim() || null,
    taskId: searchParams.get("taskId")?.trim() || null,
    bookAnalysisId: searchParams.get("bookAnalysisId")?.trim() || null,
    formulaId: searchParams.get("formulaId")?.trim() || null,
    styleProfileId: searchParams.get("styleProfileId")?.trim() || null,
    baseCharacterId: searchParams.get("baseCharacterId")?.trim() || null,
    knowledgeDocumentIds: knowledgeIds,
  };
}

export function applyCreativeHubBindingsToSearch(
  searchParams: URLSearchParams,
  bindings: CreativeHubResourceBinding,
): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  const singleValueKeys = [
    "novelId",
    "chapterId",
    "worldId",
    "taskId",
    "bookAnalysisId",
    "formulaId",
    "styleProfileId",
    "baseCharacterId",
  ] as const;

  for (const key of singleValueKeys) {
    const value = bindings[key];
    if (typeof value === "string" && value.trim()) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
  }

  next.delete("knowledgeDocumentId");
  for (const knowledgeId of bindings.knowledgeDocumentIds ?? []) {
    if (knowledgeId.trim()) {
      next.append("knowledgeDocumentId", knowledgeId);
    }
  }
  return next;
}

function normalizedKnowledgeIds(value?: string[]): string[] {
  return (value ?? []).map((item) => item.trim()).filter(Boolean).sort();
}

export function areCreativeHubBindingsEqual(
  left: CreativeHubResourceBinding,
  right: CreativeHubResourceBinding,
): boolean {
  return (left.novelId ?? null) === (right.novelId ?? null)
    && (left.chapterId ?? null) === (right.chapterId ?? null)
    && (left.worldId ?? null) === (right.worldId ?? null)
    && (left.taskId ?? null) === (right.taskId ?? null)
    && (left.bookAnalysisId ?? null) === (right.bookAnalysisId ?? null)
    && (left.formulaId ?? null) === (right.formulaId ?? null)
    && (left.styleProfileId ?? null) === (right.styleProfileId ?? null)
    && (left.baseCharacterId ?? null) === (right.baseCharacterId ?? null)
    && JSON.stringify(normalizedKnowledgeIds(left.knowledgeDocumentIds))
      === JSON.stringify(normalizedKnowledgeIds(right.knowledgeDocumentIds));
}

export function findCreativeHubInitialThread(
  threads: CreativeHubThread[],
  requestedBindings: CreativeHubResourceBinding,
  requireBindingMatch: boolean,
): CreativeHubThread | null {
  if (requireBindingMatch) {
    return threads.find((thread) => (
      areCreativeHubBindingsEqual(thread.resourceBindings, requestedBindings)
    )) ?? null;
  }
  return threads[0] ?? null;
}

export function buildCreativeHubAutoCreateKey(
  bindings: CreativeHubResourceBinding,
  shouldCreateBoundThread: boolean,
): string {
  if (!shouldCreateBoundThread) {
    return "blank";
  }
  return `bound:${JSON.stringify({
    novelId: bindings.novelId ?? null,
    chapterId: bindings.chapterId ?? null,
    worldId: bindings.worldId ?? null,
    taskId: bindings.taskId ?? null,
    bookAnalysisId: bindings.bookAnalysisId ?? null,
    formulaId: bindings.formulaId ?? null,
    styleProfileId: bindings.styleProfileId ?? null,
    baseCharacterId: bindings.baseCharacterId ?? null,
    knowledgeDocumentIds: normalizedKnowledgeIds(bindings.knowledgeDocumentIds),
  })}`;
}
