import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { buildVolumeCountGuidance } from "@ai-novel/shared/types/volumePlanning";
import type {
  VolumeBeatSheet,
  VolumeCountGuidance,
  VolumeCritiqueReport,
  VolumePlan,
  VolumePlanDocument,
  VolumeRebalanceDecision,
  VolumeStrategyPlan,
} from "@ai-novel/shared/types/novel";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { queryKeys } from "@/api/queryKeys";
import {
  buildVolumePlanningReadiness,
  findBeatSheet,
  normalizeVolumeDraft,
} from "../volumePlan.utils";
import {
  detailModeLabel,
  hasChapterDetailDraft,
  type ChapterDetailBundleRequest,
  type ChapterDetailMode,
} from "../chapterDetailPlanning.shared";
import {
  buildChapterDetailBatchConfirmationMessage,
  resolveChapterDetailBatch,
  runChapterDetailBatchGeneration,
} from "./useNovelVolumePlanning.chapterDetail";
import {
  startBeatSheetGenerationAction,
  startChapterListGenerationAction,
  startSkeletonGenerationAction,
  startStrategyCritiqueAction,
  startStrategyGenerationAction,
  type ChapterListGenerationRequest,
} from "./useNovelVolumePlanning.actions";
import { useVolumeGenerationMutation } from "./useNovelVolumePlanning.generation";
import {
  addChapterDraft,
  addVolumeDraft,
  moveChapterDraft,
  moveVolumeDraft,
  removeChapterDraft,
  removeVolumeDraft,
  updateChapterNumberFieldDraft,
  updateChapterPayoffRefsDraft,
  updateChapterTextFieldDraft,
  updateVolumeFieldDraft,
  updateVolumeOpenPayoffsDraft,
} from "./useNovelVolumePlanning.draft";
import {
  buildGenerationNotice,
  resolveCustomVolumeCountInput,
  serializeVolumeDraftSnapshot,
} from "./useNovelVolumePlanning.utils";

interface LlmSettings {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

interface UseNovelVolumePlanningArgs {
  novelId: string;
  hasCharacters: boolean;
  llm: LlmSettings;
  estimatedChapterCount?: number | null;
  volumeDraft: VolumePlan[];
  strategyPlan: VolumeStrategyPlan | null;
  critiqueReport: VolumeCritiqueReport | null;
  beatSheets: VolumeBeatSheet[];
  rebalanceDecisions: VolumeRebalanceDecision[];
  savedWorkspace?: VolumePlanDocument | null;
  setVolumeDraft: Dispatch<SetStateAction<VolumePlan[]>>;
  setStrategyPlan: Dispatch<SetStateAction<VolumeStrategyPlan | null>>;
  setCritiqueReport: Dispatch<SetStateAction<VolumeCritiqueReport | null>>;
  setBeatSheets: Dispatch<SetStateAction<VolumeBeatSheet[]>>;
  setRebalanceDecisions: Dispatch<SetStateAction<VolumeRebalanceDecision[]>>;
  setVolumeGenerationMessage: (value: string) => void;
  setStructuredMessage: (value: string) => void;
}

export function useNovelVolumePlanning({
  novelId,
  hasCharacters,
  llm,
  estimatedChapterCount,
  volumeDraft,
  strategyPlan,
  critiqueReport,
  beatSheets,
  rebalanceDecisions,
  savedWorkspace,
  setVolumeDraft,
  setStrategyPlan,
  setCritiqueReport,
  setBeatSheets,
  setRebalanceDecisions,
  setVolumeGenerationMessage,
  setStructuredMessage,
}: UseNovelVolumePlanningArgs) {
  const queryClient = useQueryClient();
  const normalizedVolumeDraft = useMemo(() => normalizeVolumeDraft(volumeDraft), [volumeDraft]);
  const normalizedSavedVolumes = useMemo(
    () => normalizeVolumeDraft(savedWorkspace?.volumes ?? []),
    [savedWorkspace?.volumes],
  );
  const hasUnsavedVolumeDraft = useMemo(
    () => serializeVolumeDraftSnapshot(normalizedVolumeDraft) !== serializeVolumeDraftSnapshot(normalizedSavedVolumes),
    [normalizedSavedVolumes, normalizedVolumeDraft],
  );
  const readiness = useMemo(
    () => buildVolumePlanningReadiness({ volumes: normalizedVolumeDraft, strategyPlan, beatSheets }),
    [beatSheets, normalizedVolumeDraft, strategyPlan],
  );
  const currentChapterCount = useMemo(
    () => normalizedVolumeDraft.reduce((sum, volume) => sum + volume.chapters.length, 0),
    [normalizedVolumeDraft],
  );
  const [customVolumeCountEnabled, setCustomVolumeCountEnabled] = useState(false);
  const [customVolumeCountInput, setCustomVolumeCountInput] = useState("");
  const [userPreferredVolumeCount, setUserPreferredVolumeCount] = useState<number | null>(null);
  const [forceSystemRecommendedVolumeCount, setForceSystemRecommendedVolumeCount] = useState(false);
  const volumeCountGuidance = useMemo<VolumeCountGuidance>(
    () => buildVolumeCountGuidance({
      chapterBudget: Math.max(estimatedChapterCount ?? 0, currentChapterCount, 12),
      existingVolumeCount: normalizedVolumeDraft.length,
      respectExistingVolumeCount: !forceSystemRecommendedVolumeCount && normalizedVolumeDraft.length > 0,
      userPreferredVolumeCount,
    }),
    [currentChapterCount, estimatedChapterCount, forceSystemRecommendedVolumeCount, normalizedVolumeDraft.length, userPreferredVolumeCount],
  );

  useEffect(() => {
    if (userPreferredVolumeCount != null) {
      setCustomVolumeCountInput(String(userPreferredVolumeCount));
      return;
    }
    if (!customVolumeCountEnabled) {
      setCustomVolumeCountInput(String(volumeCountGuidance.recommendedVolumeCount));
    }
  }, [
    customVolumeCountEnabled,
    userPreferredVolumeCount,
    volumeCountGuidance.recommendedVolumeCount,
  ]);

  const updateVolumeDraft = (
    updater: (prev: VolumePlan[]) => VolumePlan[],
    options: {
      clearBeatSheets?: boolean;
      clearRebalanceDecisions?: boolean;
    } = {},
  ) => {
    setVolumeDraft((prev) => normalizeVolumeDraft(updater(prev)));
    if (options.clearBeatSheets) {
      setBeatSheets([]);
    }
    if (options.clearRebalanceDecisions) {
      setRebalanceDecisions([]);
    }
  };

  const [isGeneratingChapterDetailBundle, setIsGeneratingChapterDetailBundle] = useState(false);
  const [bundleGeneratingChapterId, setBundleGeneratingChapterId] = useState("");
  const [bundleGeneratingMode, setBundleGeneratingMode] = useState<ChapterDetailMode | "">("");

  const generateMutation = useVolumeGenerationMutation({
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
  });

  const ensureCharacterGuard = () => {
    if (hasCharacters) {
      return true;
    }
    return window.confirm("当前小说还没有角色。继续生成会降低后续一致性，是否继续？");
  };

  const startStrategyGeneration = () => {
    startStrategyGenerationAction({
      ensureCharacterGuard,
      userPreferredVolumeCount,
      forceSystemRecommendedVolumeCount,
      volumeCountGuidance,
      hasUnsavedVolumeDraft,
      generate: (payload) => generateMutation.mutate(payload),
    });
  };

  const startStrategyCritique = () => {
    if (!strategyPlan) {
      setVolumeGenerationMessage("请先生成卷战略建议。");
      return;
    }
    startStrategyCritiqueAction({
      ensureCharacterGuard,
      generate: (payload) => generateMutation.mutate(payload),
    });
  };

  const startSkeletonGeneration = () => {
    startSkeletonGenerationAction({
      ensureCharacterGuard,
      hasUnsavedVolumeDraft,
      generate: (payload) => generateMutation.mutate(payload),
    });
  };

  const startBeatSheetGeneration = (volumeId: string) => {
    startBeatSheetGenerationAction({
      volumeId,
      normalizedVolumeDraft,
      strategyPlan,
      beatSheets,
      ensureCharacterGuard,
      setStructuredMessage,
      generate: (payload) => generateMutation.mutate(payload),
    });
  };

  const startChapterListGeneration = (volumeId: string, request?: ChapterListGenerationRequest) => {
    startChapterListGenerationAction({
      volumeId,
      request,
      normalizedVolumeDraft,
      beatSheets,
      ensureCharacterGuard,
      setStructuredMessage,
      generate: (payload) => generateMutation.mutate(payload),
    });
  };

  const startChapterDetailGeneration = (
    volumeId: string,
    chapterId: string,
    detailMode: ChapterDetailMode,
  ) => {
    const targetVolume = normalizedVolumeDraft.find((volume) => volume.id === volumeId);
    const targetChapter = targetVolume?.chapters.find((chapter) => chapter.id === chapterId);
    if (!targetVolume || !targetChapter) {
      setStructuredMessage("当前章节不存在，无法生成细化信息。");
      return;
    }
    if (!findBeatSheet(beatSheets, volumeId)) {
      setStructuredMessage("请先生成当前卷节奏板，再细化章节。");
      return;
    }
    if (!ensureCharacterGuard()) {
      return;
    }
    const confirmed = window.confirm([
      `将基于当前内容为第${targetChapter.chapterOrder}章《${targetChapter.title}》AI 修正${detailModeLabel(detailMode)}。`,
      hasChapterDetailDraft(targetChapter, detailMode)
        ? "会优先沿用当前已填写结果，只修正空缺、模糊和不够可执行的部分。"
        : "当前这块还是空白，AI 会先补出首版，再按现有标题和摘要收束。",
      "不会改动本章标题和摘要，也不会影响其他章节。",
    ].join("\n\n"));
    if (!confirmed) {
      return;
    }
    generateMutation.mutate({
      scope: "chapter_detail",
      targetVolumeId: volumeId,
      targetChapterId: chapterId,
      detailMode,
    });
  };

  const startChapterDetailBundleGeneration = (
    volumeId: string,
    request: ChapterDetailBundleRequest,
  ) => {
    const targetVolume = normalizedVolumeDraft.find((volume) => volume.id === volumeId);
    const batch = resolveChapterDetailBatch(targetVolume, request);
    if (!targetVolume) {
      setStructuredMessage("当前卷不存在，无法生成章节细化。");
      return;
    }
    if (batch.targets.length === 0) {
      setStructuredMessage(typeof request === "string" ? "当前章节不存在，无法整套生成章节细化。" : "当前范围内没有可细化章节。");
      return;
    }
    if (!findBeatSheet(beatSheets, volumeId)) {
      setStructuredMessage(batch.targets.length > 1 ? "请先生成当前卷节奏板，再做批量章节细化。" : "请先生成当前卷节奏板，再做单章整套细化。");
      return;
    }
    if (!ensureCharacterGuard()) {
      return;
    }
    const confirmed = window.confirm(buildChapterDetailBatchConfirmationMessage(batch));
    if (!confirmed) {
      return;
    }

    void runChapterDetailBatchGeneration({
      initialDraft: normalizedVolumeDraft,
      label: batch.label,
      targetVolumeId: volumeId,
      targets: batch.targets,
      setIsGenerating: setIsGeneratingChapterDetailBundle,
      setCurrentChapterId: setBundleGeneratingChapterId,
      setCurrentMode: setBundleGeneratingMode,
      setStructuredMessage,
      generateChapterDetail: (payload) => generateMutation.mutateAsync({
        scope: "chapter_detail",
        targetVolumeId: payload.targetVolumeId,
        targetChapterId: payload.targetChapterId,
        detailMode: payload.detailMode,
        draftVolumesOverride: payload.draftVolumesOverride,
        suppressSuccessMessage: payload.suppressSuccessMessage,
      }),
    });
  };

  const handleVolumeFieldChange = (
    volumeId: string,
    field: keyof Pick<VolumePlan, "title" | "summary" | "openingHook" | "mainPromise" | "primaryPressureSource" | "coreSellingPoint" | "escalationMode" | "protagonistChange" | "midVolumeRisk" | "climax" | "payoffType" | "nextVolumeHook" | "resetPoint">,
    value: string,
  ) => {
    updateVolumeDraft((prev) => updateVolumeFieldDraft(prev, volumeId, field, value), {
      clearBeatSheets: true,
      clearRebalanceDecisions: true,
    });
  };

  const handleOpenPayoffsChange = (volumeId: string, value: string) => {
    updateVolumeDraft((prev) => updateVolumeOpenPayoffsDraft(prev, volumeId, value), {
      clearBeatSheets: true,
      clearRebalanceDecisions: true,
    });
  };

  const handleAddVolume = () => {
    updateVolumeDraft((prev) => addVolumeDraft(prev), {
      clearBeatSheets: true,
      clearRebalanceDecisions: true,
    });
  };

  const handleRemoveVolume = (volumeId: string) => {
    updateVolumeDraft((prev) => removeVolumeDraft(prev, volumeId), {
      clearBeatSheets: true,
      clearRebalanceDecisions: true,
    });
  };

  const handleMoveVolume = (volumeId: string, direction: -1 | 1) => {
    updateVolumeDraft((prev) => moveVolumeDraft(prev, volumeId, direction), {
      clearBeatSheets: true,
      clearRebalanceDecisions: true,
    });
  };

  const handleChapterFieldChange = (
    volumeId: string,
    chapterId: string,
    field: keyof Pick<VolumePlan["chapters"][number], "title" | "summary" | "purpose" | "mustAvoid" | "taskSheet">,
    value: string,
  ) => {
    updateVolumeDraft((prev) => updateChapterTextFieldDraft(prev, volumeId, chapterId, field, value), {
      clearRebalanceDecisions: field === "title" || field === "summary",
    });
  };

  const handleChapterNumberChange = (
    volumeId: string,
    chapterId: string,
    field: keyof Pick<VolumePlan["chapters"][number], "conflictLevel" | "revealLevel" | "targetWordCount">,
    value: number | null,
  ) => {
    updateVolumeDraft((prev) => updateChapterNumberFieldDraft(prev, volumeId, chapterId, field, value), {
      clearRebalanceDecisions: true,
    });
  };

  const handleChapterPayoffRefsChange = (volumeId: string, chapterId: string, value: string) => {
    updateVolumeDraft((prev) => updateChapterPayoffRefsDraft(prev, volumeId, chapterId, value));
  };

  const handleAddChapter = (volumeId: string) => {
    updateVolumeDraft((prev) => addChapterDraft(prev, volumeId), {
      clearRebalanceDecisions: true,
    });
  };

  const handleRemoveChapter = (volumeId: string, chapterId: string) => {
    updateVolumeDraft((prev) => removeChapterDraft(prev, volumeId, chapterId), {
      clearRebalanceDecisions: true,
    });
  };

  const handleMoveChapter = (volumeId: string, chapterId: string, direction: -1 | 1) => {
    updateVolumeDraft((prev) => moveChapterDraft(prev, volumeId, chapterId, direction), {
      clearRebalanceDecisions: true,
    });
  };

  const applyCustomVolumeCount = () => {
    const resolved = resolveCustomVolumeCountInput(customVolumeCountInput, volumeCountGuidance);
    if (!resolved.value) {
      setVolumeGenerationMessage(resolved.message ?? "请先输入有效的固定卷数。");
      return;
    }
    setUserPreferredVolumeCount(resolved.value);
    setForceSystemRecommendedVolumeCount(false);
    setVolumeGenerationMessage(`当前已固定为 ${resolved.value} 卷。下次生成卷战略时会严格采用这个卷数。`);
  };

  const restoreSystemRecommendedVolumeCount = () => {
    setUserPreferredVolumeCount(null);
    setCustomVolumeCountEnabled(false);
    setCustomVolumeCountInput(String(volumeCountGuidance.systemRecommendedVolumeCount));
    setForceSystemRecommendedVolumeCount(true);
    setVolumeGenerationMessage(`已恢复系统建议卷数。下次生成卷战略时会优先采用系统建议 ${volumeCountGuidance.systemRecommendedVolumeCount} 卷。`);
  };

  const generationNotice = buildGenerationNotice(strategyPlan);
  const generatingChapterDetailMode: ChapterDetailMode | "" = isGeneratingChapterDetailBundle ? bundleGeneratingMode : generateMutation.variables?.scope === "chapter_detail" ? generateMutation.variables.detailMode ?? "" : "";
  const generatingChapterDetailChapterId = isGeneratingChapterDetailBundle ? bundleGeneratingChapterId : generateMutation.variables?.scope === "chapter_detail" ? generateMutation.variables.targetChapterId ?? "" : "";
  const isGeneratingChapterDetail = isGeneratingChapterDetailBundle
    || (generateMutation.isPending && generateMutation.variables?.scope === "chapter_detail");
  const generatingChapterListVolumeId = generateMutation.isPending && (generateMutation.variables?.scope === "chapter_list" || generateMutation.variables?.scope === "volume") ? generateMutation.variables.targetVolumeId ?? "" : "";
  const generatingChapterListBeatKey = generateMutation.isPending && generateMutation.variables?.scope === "chapter_list" && generateMutation.variables.generationMode === "single_beat" ? generateMutation.variables.targetBeatKey ?? "" : "";
  const generatingChapterListMode = generateMutation.isPending && (generateMutation.variables?.scope === "chapter_list" || generateMutation.variables?.scope === "volume") ? generateMutation.variables.generationMode ?? "full_volume" : null;

  useEffect(() => {
    if (!novelId || !generateMutation.isPending) {
      return;
    }
    const scope = generateMutation.variables?.scope;
    if (scope !== "beat_sheet" && scope !== "chapter_list" && scope !== "volume") {
      return;
    }
    const timer = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.novels.volumeWorkspace(novelId) });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [generateMutation.isPending, generateMutation.variables?.scope, novelId, queryClient]);

  return {
    normalizedVolumeDraft,
    hasUnsavedVolumeDraft,
    generationNotice,
    readiness,
    volumeCountGuidance,
    customVolumeCountEnabled,
    customVolumeCountInput,
    onCustomVolumeCountEnabledChange: (enabled: boolean) => {
      setCustomVolumeCountEnabled(enabled);
      if (enabled) {
        setCustomVolumeCountInput((current) => current || String(volumeCountGuidance.recommendedVolumeCount));
        return;
      }
      setUserPreferredVolumeCount(null);
    },
    onCustomVolumeCountInputChange: setCustomVolumeCountInput,
    onApplyCustomVolumeCount: applyCustomVolumeCount,
    onRestoreSystemRecommendedVolumeCount: restoreSystemRecommendedVolumeCount,
    isGeneratingStrategy: generateMutation.isPending && generateMutation.variables?.scope === "strategy",
    isCritiquingStrategy: generateMutation.isPending && generateMutation.variables?.scope === "strategy_critique",
    isGeneratingSkeleton: generateMutation.isPending && (generateMutation.variables?.scope === "skeleton" || generateMutation.variables?.scope === "book"),
    isGeneratingBeatSheet: generateMutation.isPending && generateMutation.variables?.scope === "beat_sheet",
    isGeneratingChapterList: generateMutation.isPending && (generateMutation.variables?.scope === "chapter_list" || generateMutation.variables?.scope === "volume"),
    generatingChapterListVolumeId,
    generatingChapterListBeatKey,
    generatingChapterListMode,
    isGeneratingChapterDetail,
    isGeneratingChapterDetailBundle,
    generatingChapterDetailMode,
    generatingChapterDetailChapterId,
    startStrategyGeneration,
    startStrategyCritique,
    startSkeletonGeneration,
    startBeatSheetGeneration,
    startChapterListGeneration,
    startChapterDetailGeneration,
    startChapterDetailBundleGeneration,
    handleVolumeFieldChange,
    handleOpenPayoffsChange,
    handleAddVolume,
    handleRemoveVolume,
    handleMoveVolume,
    handleChapterFieldChange,
    handleChapterNumberChange,
    handleChapterPayoffRefsChange,
    handleAddChapter,
    handleRemoveChapter,
    handleMoveChapter,
  };
}
