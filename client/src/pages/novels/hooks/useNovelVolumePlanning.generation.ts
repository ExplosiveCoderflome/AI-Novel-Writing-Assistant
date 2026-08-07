import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  VolumeBeatSheet,
  VolumeCritiqueReport,
  VolumePlan,
  VolumePlanDocument,
  VolumePlanningReadiness,
  VolumeRebalanceDecision,
  VolumeStrategyPlan,
} from "@ai-novel/shared/types/novel";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import {
  generateNovelVolumes,
  getNovelVolumeWorkspace,
  updateNovelVolumes,
  type NovelDetailResponse,
} from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { syncNovelWorkflowStageSilently } from "../novelWorkflow.client";
import { normalizeVolumeDraft } from "../volumePlan.utils";
import { detailModeLabel } from "../chapterDetailPlanning.shared";
import {
  buildChapterListSuccessMessage,
  type VolumeGenerationPayload,
} from "./useNovelVolumePlanning.actions";
import { serializeVolumeWorkspaceSnapshot } from "./useNovelVolumePlanning.utils";

interface LlmSettings {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

interface UseVolumeGenerationMutationArgs {
  novelId: string;
  llm: LlmSettings;
  estimatedChapterCount?: number | null;
  normalizedVolumeDraft: VolumePlan[];
  strategyPlan: VolumeStrategyPlan | null;
  critiqueReport: VolumeCritiqueReport | null;
  beatSheets: VolumeBeatSheet[];
  rebalanceDecisions: VolumeRebalanceDecision[];
  savedWorkspace?: VolumePlanDocument | null;
  readiness: VolumePlanningReadiness;
  userPreferredVolumeCount: number | null;
  forceSystemRecommendedVolumeCount: boolean;
  setVolumeDraft: Dispatch<SetStateAction<VolumePlan[]>>;
  setStrategyPlan: Dispatch<SetStateAction<VolumeStrategyPlan | null>>;
  setCritiqueReport: Dispatch<SetStateAction<VolumeCritiqueReport | null>>;
  setBeatSheets: Dispatch<SetStateAction<VolumeBeatSheet[]>>;
  setRebalanceDecisions: Dispatch<SetStateAction<VolumeRebalanceDecision[]>>;
  setVolumeGenerationMessage: (value: string) => void;
  setStructuredMessage: (value: string) => void;
}

export interface GeneratedVolumeMutationResult {
  generatedResponse: Awaited<ReturnType<typeof generateNovelVolumes>>;
  persistedResponse: Awaited<ReturnType<typeof updateNovelVolumes>>;
  nextDocument: VolumePlanDocument;
  autoSyncedToChapterExecution: boolean;
}

interface VolumeGenerationMutationContext {
  persistedWorkspaceSnapshotBefore: string;
}

class VolumeGenerationAutoSaveError extends Error {
  nextDocument: VolumePlanDocument;

  constructor(message: string, nextDocument: VolumePlanDocument) {
    super(message);
    this.name = "VolumeGenerationAutoSaveError";
    this.nextDocument = nextDocument;
  }
}

function shouldAutoSyncGeneratedScope(scope: VolumeGenerationPayload["scope"]): boolean {
  return scope === "chapter_list" || scope === "volume" || scope === "chapter_detail";
}

function shouldRequestSlimVolumeGenerationResponse(scope: VolumeGenerationPayload["scope"]): boolean {
  return scope === "beat_sheet"
    || scope === "chapter_list"
    || scope === "volume"
    || scope === "rebalance"
    || scope === "chapter_detail";
}

function mergeSavedVolumeDocumentIntoNovelDetail(
  previous: ApiResponse<NovelDetailResponse> | undefined,
  document: VolumePlanDocument,
): ApiResponse<NovelDetailResponse> | undefined {
  if (!previous?.data) {
    return previous;
  }
  return {
    ...previous,
    data: {
      ...previous.data,
      outline: document.derivedOutline,
      structuredOutline: document.derivedStructuredOutline,
      volumes: document.volumes,
      volumeSource: document.source,
      activeVolumeVersionId: document.activeVersionId,
    },
  };
}

function isSlimVolumeGenerationResponse(
  document: Awaited<ReturnType<typeof generateNovelVolumes>>["data"],
): document is VolumePlanDocument & { slimmed: true } {
  return Boolean(document && "slimmed" in document && document.slimmed === true);
}

export function useVolumeGenerationMutation({
  novelId,
  llm,
  estimatedChapterCount,
  normalizedVolumeDraft,
  strategyPlan,
  critiqueReport,
  beatSheets,
  rebalanceDecisions,
  savedWorkspace,
  readiness,
  userPreferredVolumeCount,
  forceSystemRecommendedVolumeCount,
  setVolumeDraft,
  setStrategyPlan,
  setCritiqueReport,
  setBeatSheets,
  setRebalanceDecisions,
  setVolumeGenerationMessage,
  setStructuredMessage,
}: UseVolumeGenerationMutationArgs) {
  const queryClient = useQueryClient();

  const applyWorkspaceDocument = (document: VolumePlanDocument) => {
    setVolumeDraft(document.volumes);
    setStrategyPlan(document.strategyPlan);
    setCritiqueReport(document.critiqueReport);
    setBeatSheets(document.beatSheets);
    setRebalanceDecisions(document.rebalanceDecisions);
  };

  const syncSavedVolumeDocumentToCache = (document: VolumePlanDocument) => {
    queryClient.setQueryData<ApiResponse<NovelDetailResponse> | undefined>(
      queryKeys.novels.detail(novelId),
      (previous) => mergeSavedVolumeDocumentIntoNovelDetail(previous, document),
    );
    queryClient.setQueryData<ApiResponse<VolumePlanDocument>>(
      queryKeys.novels.volumeWorkspace(novelId),
      () => ({
        success: true,
        message: "Volume workspace updated.",
        data: document,
      }),
    );
  };

  const hydratePersistedWorkspace = (document: VolumePlanDocument) => {
    applyWorkspaceDocument(document);
    syncSavedVolumeDocumentToCache(document);
  };

  return useMutation<
    GeneratedVolumeMutationResult,
    Error,
    VolumeGenerationPayload,
    VolumeGenerationMutationContext
  >({
    onMutate: (): VolumeGenerationMutationContext => ({
      persistedWorkspaceSnapshotBefore: serializeVolumeWorkspaceSnapshot(
        queryClient.getQueryData<ApiResponse<VolumePlanDocument>>(queryKeys.novels.volumeWorkspace(novelId))?.data
        ?? savedWorkspace
        ?? null,
      ),
    }),
    mutationFn: async (payload: VolumeGenerationPayload): Promise<GeneratedVolumeMutationResult> => {
      const requestDraft = normalizeVolumeDraft(payload.draftVolumesOverride ?? normalizedVolumeDraft);
      const autoSyncedToChapterExecution = shouldAutoSyncGeneratedScope(payload.scope);
      const generatedResponse = await generateNovelVolumes(novelId, {
        provider: llm.provider,
        model: llm.model,
        temperature: llm.temperature,
        scope: payload.scope,
        generationMode: payload.generationMode,
        targetVolumeId: payload.targetVolumeId,
        targetBeatKey: payload.targetBeatKey,
        targetChapterId: payload.targetChapterId,
        detailMode: payload.detailMode,
        draftVolumes: requestDraft.length > 0 ? requestDraft : undefined,
        draftWorkspace: {
          novelId,
          workspaceVersion: "v2",
          volumes: requestDraft,
          strategyPlan,
          critiqueReport,
          beatSheets,
          rebalanceDecisions,
          readiness,
          derivedOutline: "",
          derivedStructuredOutline: "",
          source: savedWorkspace?.source ?? "volume",
          activeVersionId: savedWorkspace?.activeVersionId ?? null,
        },
        estimatedChapterCount: typeof estimatedChapterCount === "number" && estimatedChapterCount > 0
          ? estimatedChapterCount
          : undefined,
        userPreferredVolumeCount: userPreferredVolumeCount ?? undefined,
        respectExistingVolumeCount: !forceSystemRecommendedVolumeCount && requestDraft.length > 0,
        slimResponse: shouldRequestSlimVolumeGenerationResponse(payload.scope),
      });
      let nextDocument = generatedResponse.data;
      if (!nextDocument) {
        throw new Error("The AI ​​did not return the volume workspace results.");
      }
      if (isSlimVolumeGenerationResponse(nextDocument)) {
        const latestWorkspaceResponse = await getNovelVolumeWorkspace(novelId);
        if (!latestWorkspaceResponse.data) {
          throw new Error("AI has been generated, but it needs to be reread from the volume workspace before it can be saved. Please refresh the volume plan and continue.");
        }
        nextDocument = latestWorkspaceResponse.data;
        if (!autoSyncedToChapterExecution) {
          return {
            generatedResponse,
            persistedResponse: latestWorkspaceResponse,
            nextDocument,
            autoSyncedToChapterExecution,
          };
        }
      }

      try {
        const persistedResponse = await updateNovelVolumes(novelId, {
          ...nextDocument,
          syncToChapterExecution: autoSyncedToChapterExecution,
        });
        return {
          generatedResponse,
          persistedResponse,
          nextDocument: persistedResponse.data ?? nextDocument,
          autoSyncedToChapterExecution,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI generation is complete, but saving the current volume workspace failed.";
        throw new VolumeGenerationAutoSaveError(message, nextDocument);
      }
    },
    onSuccess: async (result, payload) => {
      applyWorkspaceDocument(result.nextDocument);
      if (result.persistedResponse.data) {
        syncSavedVolumeDocumentToCache(result.persistedResponse.data);
      }
      if (result.autoSyncedToChapterExecution) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(novelId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapters(novelId) }),
        ]);
      }

      void syncNovelWorkflowStageSilently({
        novelId,
        stage: payload.scope === "strategy" || payload.scope === "strategy_critique" || payload.scope === "skeleton" || payload.scope === "book"
          ? "volume_strategy"
          : "structured_outline",
        itemLabel: payload.scope === "strategy"
          ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
          : payload.scope === "strategy_critique"
            ? "Volume Strategy Review has been updated"
            : payload.scope === "skeleton" || payload.scope === "book"
              ? "Volume skeleton updated"
              : payload.scope === "beat_sheet"
                ? "The current volume rhythm board has been updated"
                : payload.scope === "chapter_list" || payload.scope === "volume"
                  ? payload.generationMode === "single_beat"
                    ? "The current volume rhythm section chapter has been updated and connected to the chapter execution"
                    : "The current volume chapter list is generated and connected to the chapter execution"
                  : payload.scope === "rebalance"
                    ? "Adjacent volume rebalancing recommendations updated"
                    : result.autoSyncedToChapterExecution
                      ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
                      : "Chapter refinement updated",
        checkpointType: payload.scope === "skeleton" || payload.scope === "book"
          ? "volume_strategy_ready"
          : payload.scope === "chapter_list" || payload.scope === "volume"
            ? "chapter_batch_ready"
            : null,
        checkpointSummary: payload.scope === "skeleton" || payload.scope === "book"
          ? "The volume strategy and volume skeleton have been refreshed, and you can continue to enter the rhythm of opening chapters."
          : payload.scope === "chapter_list" || payload.scope === "volume"
            ? payload.generationMode === "single_beat"
              ? "The rhythm section chapter of the current volume has been refreshed, and you can continue to refine it or directly enter the chapter execution."
              : "The chapter list of the current volume has been prepared. You can continue to refine it or directly enter the chapter execution."
            : undefined,
        volumeId: payload.targetVolumeId,
        chapterId: payload.targetChapterId,
        status: "waiting_approval",
      });

      if (payload.suppressSuccessMessage) {
        return;
      }

      if (payload.scope === "strategy") {
        const message = "Volume strategy recommendations are generated and automatically saved. In the next step, please review first and then confirm the volume skeleton.";
        setVolumeGenerationMessage(message);
        setStructuredMessage(message);
        return;
      }
      if (payload.scope === "strategy_critique") {
        const message = "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
        setVolumeGenerationMessage(message);
        return;
      }
      if (payload.scope === "skeleton" || payload.scope === "book") {
        const message = "The volume skeleton is generated and saved automatically. The system has cleared the old rhythm board. Next, please generate a rhythm board for the current volume.";
        setVolumeGenerationMessage(message);
        setStructuredMessage(message);
        return;
      }
      if (payload.scope === "beat_sheet") {
        setStructuredMessage("The current volume rhythm board is updated and automatically saved. In the next step, you can continue to unpack the chapter list of the current volume.");
        return;
      }
      if (payload.scope === "chapter_list" || payload.scope === "volume") {
        setStructuredMessage(buildChapterListSuccessMessage({
          document: result.nextDocument,
          targetVolumeId: payload.targetVolumeId,
          generationMode: payload.generationMode,
          targetBeatKey: payload.targetBeatKey,
          autoSyncedToChapterExecution: result.autoSyncedToChapterExecution,
        }));
        return;
      }
      if (payload.scope === "rebalance") {
        setStructuredMessage("Adjacent volume rebalancing recommendations have been updated.");
        return;
      }

      const label = detailModeLabel(payload.detailMode ?? "purpose");
      setStructuredMessage(
        result.autoSyncedToChapterExecution
          ? `${label}已完成 AI 修正并自动保存，章节执行区也已自动同步最新内容。`
          : `${label}已完成 AI 修正并自动保存。`,
      );
    },
    onError: async (error, payload, context) => {
      if (error instanceof VolumeGenerationAutoSaveError) {
        applyWorkspaceDocument(error.nextDocument);
      }
      const fallbackMessage = error instanceof VolumeGenerationAutoSaveError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Volume level plan generation failed.";
      const shouldTryRecoverPersistedWorkspace = !(error instanceof VolumeGenerationAutoSaveError)
        && shouldRequestSlimVolumeGenerationResponse(payload.scope);
      let recoveredMessage: string | null = null;

      if (shouldTryRecoverPersistedWorkspace) {
        try {
          const latestWorkspaceResponse = await getNovelVolumeWorkspace(novelId);
          const latestWorkspace = latestWorkspaceResponse.data ?? null;
          if (latestWorkspace) {
            const persistedWorkspaceSnapshotAfter = serializeVolumeWorkspaceSnapshot(latestWorkspace);
            if (persistedWorkspaceSnapshotAfter !== context?.persistedWorkspaceSnapshotBefore) {
              hydratePersistedWorkspace(latestWorkspace);
              recoveredMessage = payload.scope === "chapter_list" || payload.scope === "volume"
                ? "The most recent auto-saved progress has been restored and you can continue to advance from unfinished rhythm sections."
                : "The most recent auto-save progress has been restored and the current volume generation can be continued.";
            }
          }
        } catch {
          // Ignore recovery fetch failures and keep the original local draft untouched.
        }
      }

      const message = recoveredMessage ?? fallbackMessage;
      if (payload.scope === "strategy" || payload.scope === "strategy_critique" || payload.scope === "skeleton" || payload.scope === "book") {
        setVolumeGenerationMessage(message);
      }
      setStructuredMessage(message);
    },
  });
}
