import type { CreativeHubResourceBinding } from "@ai-novel/shared/types/creativeHub";

export function hasCreativeHubBindings(bindings: CreativeHubResourceBinding): boolean {
  return Boolean(
    bindings.novelId
    || bindings.chapterId
    || bindings.worldId
    || bindings.taskId
    || bindings.bookAnalysisId
    || bindings.formulaId
    || bindings.baseCharacterId
    || bindings.knowledgeDocumentIds?.length,
  );
}

export function buildCreativeHubPath(bindings: CreativeHubResourceBinding): string {
  const params = new URLSearchParams();
  if (bindings.novelId) params.set("novelId", bindings.novelId);
  if (bindings.chapterId) params.set("chapterId", bindings.chapterId);
  if (bindings.worldId) params.set("worldId", bindings.worldId);
  if (bindings.taskId) params.set("taskId", bindings.taskId);
  if (bindings.bookAnalysisId) params.set("bookAnalysisId", bindings.bookAnalysisId);
  if (bindings.formulaId) params.set("formulaId", bindings.formulaId);
  if (bindings.baseCharacterId) params.set("baseCharacterId", bindings.baseCharacterId);
  for (const documentId of bindings.knowledgeDocumentIds ?? []) {
    if (documentId.trim()) {
      params.append("knowledgeDocumentId", documentId.trim());
    }
  }
  const query = params.toString();
  return query ? `/creative-hub?${query}` : "/creative-hub";
}
