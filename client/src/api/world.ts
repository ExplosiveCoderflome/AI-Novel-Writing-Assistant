import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  World,
  WorldBindingSupport,
  WorldConsistencyIssue,
  WorldConsistencyReport,
  WorldDeepeningQuestion,
  WorldLayerKey,
  WorldSnapshot,
  WorldStructuredData,
  WorldStructureSectionKey,
  WorldTemplate,
  WorldVisualizationPayload,
} from "@ai-novel/shared/types/world";
import type {
  WorldOptionRefinementLevel,
  WorldPropertyOption,
  WorldReferenceAnchor,
  WorldReferenceMode,
  WorldReferenceSeedBundle,
} from "@ai-novel/shared/types/worldWizard";
import { apiClient } from "./client";

const WORLD_GENERATE_ALL_TIMEOUT_MS = 3 * 60 * 1000;

function normalizeSuggestedAxioms(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const normalized = raw
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }
      if (!item || typeof item !== "object") {
        return "";
      }

      const record = item as Record<string, unknown>;
      const title = [record.axiom, record.text, record.title, record.name, record.rule]
        .find((value) => typeof value === "string") as string | undefined;
      const description = [record.description, record.detail, record.content]
        .find((value) => typeof value === "string") as string | undefined;
      const effect = [record.effect, record.impact, record.result]
        .find((value) => typeof value === "string") as string | undefined;

      if (title && description && effect) {
        return `${title}（${description}，影响：${effect}）`.trim();
      }
      if (title && description) {
        return `${title}：${description}`.trim();
      }
      if (title) {
        return title.trim();
      }
      if (description) {
        return description.trim();
      }
      return "";
    })
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

export type WorldDetail = World & {
  deepeningQA?: WorldDeepeningQuestion[];
  consistencyIssues?: WorldConsistencyIssue[];
  snapshots?: WorldSnapshot[];
};

export interface WorldStructurePayload {
  worldId: string;
  hasStructuredData?: boolean;
  structure: WorldStructuredData;
  bindingSupport: WorldBindingSupport;
}

export interface WorldInspirationAnalysisResult {
  mode: string;
  conceptCard: {
    worldType: string;
    templateKey: string;
    coreImagery: string[];
    tone: string;
    keywords: string[];
    summary: string;
  };
  propertyOptions?: WorldPropertyOption[];
  referenceAnchors?: WorldReferenceAnchor[];
  referenceSeeds?: WorldReferenceSeedBundle;
  sourceMeta?: {
    extracted: boolean;
    originalLength: number;
    chunkCount: number;
  };
}

export const WORLD_INSPIRATION_ANALYZE_STREAM_PATH = "/worlds/inspiration/analyze/stream";

export async function getWorldList() {
  const { data } = await apiClient.get<ApiResponse<World[]>>("/worlds");
  return data;
}

export async function getWorldDetail(id: string) {
  const { data } = await apiClient.get<ApiResponse<WorldDetail>>(`/worlds/${id}`);
  return data;
}

export async function createWorld(
  payload: Partial<World> & {
    name: string;
    knowledgeDocumentIds?: string[];
    structure?: WorldStructuredData;
    bindingSupport?: WorldBindingSupport;
  },
) {
  const { data } = await apiClient.post<ApiResponse<World>>("/worlds", payload);
  return data;
}

export async function updateWorld(
  id: string,
  payload: Partial<World> & { structure?: WorldStructuredData; bindingSupport?: WorldBindingSupport },
) {
  const { data } = await apiClient.put<ApiResponse<World>>(`/worlds/${id}`, payload);
  return data;
}

export async function getWorldStructure(id: string) {
  const { data } = await apiClient.get<ApiResponse<WorldStructurePayload>>(`/worlds/${id}/structure`);
  return data;
}

export async function updateWorldStructure(
  id: string,
  payload: {
    structure: WorldStructuredData;
    bindingSupport?: WorldBindingSupport;
  },
) {
  const { data } = await apiClient.put<ApiResponse<{
    world: World;
    structure: WorldStructuredData;
    bindingSupport: WorldBindingSupport;
  }>>(`/worlds/${id}/structure`, payload);
  return data;
}

export async function backfillWorldStructure(
  id: string,
  payload?: {
    provider?: LLMProvider;
    model?: string;
  },
) {
  const { data } = await apiClient.post<ApiResponse<{
    world: World;
    structure: WorldStructuredData;
    bindingSupport: WorldBindingSupport;
    source: "ai-backfill";
  }>>(`/worlds/${id}/structure/backfill`, payload ?? {});
  return data;
}

export async function generateWorldStructure(
  id: string,
  payload: {
    section: WorldStructureSectionKey;
    structure?: WorldStructuredData;
    bindingSupport?: WorldBindingSupport;
    provider?: LLMProvider;
    model?: string;
  },
) {
  const { data } = await apiClient.post<ApiResponse<{
    worldId: string;
    section: WorldStructureSectionKey;
    structure: WorldStructuredData;
    bindingSupport: WorldBindingSupport;
  }>>(`/worlds/${id}/structure/generate`, payload);
  return data;
}

export async function deleteWorld(id: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/worlds/${id}`);
  return data;
}

export async function getWorldTemplates() {
  const { data } = await apiClient.get<ApiResponse<WorldTemplate[]>>("/worlds/templates");
  return data;
}

export async function analyzeWorldInspiration(payload: {
  input?: string;
  mode?: "free" | "reference" | "random";
  worldType?: string;
  knowledgeDocumentIds?: string[];
  referenceMode?: WorldReferenceMode;
  preserveElements?: string[];
  allowedChanges?: string[];
  forbiddenElements?: string[];
  refinementLevel?: WorldOptionRefinementLevel;
  optionsCount?: number;
  provider?: LLMProvider;
  model?: string;
}) {
  const { data } = await apiClient.post<
    ApiResponse<WorldInspirationAnalysisResult>
  >("/worlds/inspiration/analyze", payload);
  return data;
}

export async function suggestWorldAxioms(
  id: string,
  payload?: {
    provider?: LLMProvider;
    model?: string;
  },
) {
  const { data } = await apiClient.post<ApiResponse<string[]>>(`/worlds/${id}/axioms/suggest`, payload ?? {});
  return {
    ...data,
    data: normalizeSuggestedAxioms(data.data),
  };
}

export async function updateWorldAxioms(id: string, axioms: string[]) {
  const { data } = await apiClient.put<ApiResponse<World>>(`/worlds/${id}/axioms`, { axioms });
  return data;
}

export async function generateWorldLayer(
  id: string,
  layerKey: WorldLayerKey,
  payload?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<
    ApiResponse<{
      world: World;
      layerKey: WorldLayerKey;
      generated: Record<string, string>;
      layerStates: Record<string, { key: WorldLayerKey; status: string; updatedAt: string }>;
    }>
  >(`/worlds/${id}/layers/${layerKey}/generate`, payload ?? {});
  return data;
}

export async function generateAllWorldLayers(
  id: string,
  payload?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<
    ApiResponse<{
      world: World;
      generated: Record<WorldLayerKey, Record<string, string>>;
      layerStates: Record<string, { key: WorldLayerKey; status: string; updatedAt: string }>;
    }>
  >(`/worlds/${id}/layers/generate-all`, payload ?? {}, { timeout: WORLD_GENERATE_ALL_TIMEOUT_MS });
  return data;
}

export async function updateWorldLayer(id: string, layerKey: WorldLayerKey, content: string) {
  const { data } = await apiClient.put<ApiResponse<World>>(`/worlds/${id}/layers/${layerKey}`, { content });
  return data;
}

export async function confirmWorldLayer(id: string, layerKey: WorldLayerKey) {
  const { data } = await apiClient.post<ApiResponse<World>>(`/worlds/${id}/layers/${layerKey}/confirm`, {});
  return data;
}

export async function generateWorldDeepeningQuestions(
  id: string,
  payload?: {
    provider?: LLMProvider;
    model?: string;
  },
) {
  const { data } = await apiClient.post<ApiResponse<WorldDeepeningQuestion[]>>(
    `/worlds/${id}/deepening/questions`,
    payload ?? {},
  );
  return data;
}

export async function answerWorldDeepeningQuestions(
  id: string,
  answers: Array<{ questionId: string; answer: string }>,
) {
  const { data } = await apiClient.post<ApiResponse<WorldDeepeningQuestion[]>>(
    `/worlds/${id}/deepening/answers`,
    { answers },
  );
  return data;
}

export async function checkWorldConsistency(
  id: string,
  payload?: {
    provider?: LLMProvider;
    model?: string;
  },
) {
  const { data } = await apiClient.post<ApiResponse<WorldConsistencyReport>>(
    `/worlds/${id}/consistency/check`,
    payload ?? {},
  );
  return data;
}

export async function patchWorldConsistencyIssue(
  id: string,
  issueId: string,
  status: "open" | "resolved" | "ignored",
) {
  const { data } = await apiClient.patch<ApiResponse<unknown>>(
    `/worlds/${id}/consistency/issues/${issueId}`,
    { status },
  );
  return data;
}

export async function getWorldOverview(id: string) {
  const { data } = await apiClient.get<
    ApiResponse<{
      worldId: string;
      summary: string;
      sections: Array<{ key: string; title: string; content: string }>;
    }>
  >(`/worlds/${id}/overview`);
  return data;
}

export async function getWorldVisualization(id: string) {
  const { data } = await apiClient.get<ApiResponse<WorldVisualizationPayload>>(`/worlds/${id}/visualization`);
  return data;
}

export async function listWorldLibrary(params?: {
  category?: string;
  worldType?: string;
  keyword?: string;
  limit?: number;
}) {
  const { data } = await apiClient.get<ApiResponse<Array<{
    id: string;
    name: string;
    description?: string | null;
    category: string;
    worldType?: string | null;
    usageCount: number;
    sourceWorldId?: string | null;
  }>>>("/worlds/library", { params });
  return data;
}

export async function createWorldLibraryItem(payload: {
  name: string;
  description?: string;
  category: string;
  worldType?: string;
  sourceWorldId?: string;
}) {
  const { data } = await apiClient.post<ApiResponse<unknown>>("/worlds/library", payload);
  return data;
}

export async function useWorldLibraryItem(
  libraryId: string,
  payload?: {
    worldId?: string;
    targetField?:
      | "description"
      | "background"
      | "geography"
      | "cultures"
      | "magicSystem"
      | "politics"
      | "races"
      | "religions"
      | "technology"
      | "conflicts"
      | "history"
      | "economy"
      | "factions";
    targetCollection?: "forces" | "locations";
  },
) {
  const { data } = await apiClient.post<ApiResponse<{
    itemId: string;
    injected: boolean;
    worldId: string | null;
    targetCollection?: "forces" | "locations" | null;
  }>>(`/worlds/library/${libraryId}/use`, payload ?? {});
  return data;
}

export async function listWorldSnapshots(id: string) {
  const { data } = await apiClient.get<ApiResponse<WorldSnapshot[]>>(`/worlds/${id}/snapshots`);
  return data;
}

export async function createWorldSnapshot(id: string, label?: string) {
  const { data } = await apiClient.post<ApiResponse<WorldSnapshot>>(`/worlds/${id}/snapshots`, { label });
  return data;
}

export async function restoreWorldSnapshot(id: string, snapshotId: string) {
  const { data } = await apiClient.post<ApiResponse<World>>(`/worlds/${id}/snapshots/${snapshotId}/restore`, {});
  return data;
}

export async function diffWorldSnapshots(id: string, from: string, to: string) {
  const { data } = await apiClient.get<ApiResponse<{
    worldId: string;
    fromId: string;
    toId: string;
    changes: Array<{ field: string; before: string | null; after: string | null }>;
  }>>(`/worlds/${id}/snapshots/diff`, { params: { from, to } });
  return data;
}

export async function exportWorldData(id: string, format: "markdown" | "json") {
  const { data } = await apiClient.get<ApiResponse<{
    format: "markdown" | "json";
    fileName: string;
    content: string;
  }>>(`/worlds/${id}/export`, { params: { format } });
  return data;
}

export async function importWorldData(payload: {
  format: "json" | "markdown" | "text";
  content: string;
  name?: string;
  provider?: LLMProvider;
  model?: string;
}) {
  const { data } = await apiClient.post<ApiResponse<World>>("/worlds/import", payload);
  return data;
}
