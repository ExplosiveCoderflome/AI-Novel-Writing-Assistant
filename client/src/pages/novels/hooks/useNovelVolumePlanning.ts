import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  VolumeBeatSheet,
  VolumeCritiqueReport,
  VolumeGenerationScopeInput,
  VolumePlan,
  VolumePlanDocument,
  VolumeRebalanceDecision,
  VolumeStrategyPlan,
} from "@ai-novel/shared/types/novel";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { generateNovelVolumes, updateNovelVolumes, type NovelDetailResponse } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import {
  buildVolumePlanningReadiness,
  createEmptyChapter,
  createEmptyVolume,
  findBeatSheet,
  normalizeVolumeDraft,
} from "../volumePlan.utils";

type ChapterDetailMode = "purpose" | "boundary" | "task_sheet";
const CHAPTER_DETAIL_MODES: ChapterDetailMode[] = ["purpose", "boundary", "task_sheet"];

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

interface VolumeGenerationPayload {
  scope: VolumeGenerationScopeInput;
  targetVolumeId?: string;
  targetChapterId?: string;
  detailMode?: ChapterDetailMode;
  draftVolumesOverride?: VolumePlan[];
  suppressSuccessMessage?: boolean;
}

interface GeneratedVolumeMutationResult {
  generatedResponse: Awaited<ReturnType<typeof generateNovelVolumes>>;
  persistedResponse: Awaited<ReturnType<typeof updateNovelVolumes>>;
  nextDocument: VolumePlanDocument;
}

class VolumeGenerationAutoSaveError extends Error {
  nextDocument: VolumePlanDocument;

  constructor(message: string, nextDocument: VolumePlanDocument) {
    super(message);
    this.name = "VolumeGenerationAutoSaveError";
    this.nextDocument = nextDocument;
  }
}

function serializeVolumeDraft(volumes: VolumePlan[]): string {
  return JSON.stringify(normalizeVolumeDraft(volumes).map((volume) => ({
    sortOrder: volume.sortOrder,
    title: volume.title,
    summary: volume.summary ?? "",
    openingHook: volume.openingHook ?? "",
    mainPromise: volume.mainPromise ?? "",
    primaryPressureSource: volume.primaryPressureSource ?? "",
    coreSellingPoint: volume.coreSellingPoint ?? "",
    escalationMode: volume.escalationMode ?? "",
    protagonistChange: volume.protagonistChange ?? "",
    midVolumeRisk: volume.midVolumeRisk ?? "",
    climax: volume.climax ?? "",
    payoffType: volume.payoffType ?? "",
    nextVolumeHook: volume.nextVolumeHook ?? "",
    resetPoint: volume.resetPoint ?? "",
    openPayoffs: volume.openPayoffs,
    chapters: volume.chapters.map((chapter) => ({
      chapterOrder: chapter.chapterOrder,
      title: chapter.title,
      summary: chapter.summary,
      purpose: chapter.purpose ?? "",
      conflictLevel: chapter.conflictLevel ?? null,
      revealLevel: chapter.revealLevel ?? null,
      targetWordCount: chapter.targetWordCount ?? null,
      mustAvoid: chapter.mustAvoid ?? "",
      taskSheet: chapter.taskSheet ?? "",
      payoffRefs: chapter.payoffRefs,
    })),
  })));
}

function detailModeLabel(mode: ChapterDetailMode): string {
  if (mode === "purpose") return "章节目标";
  if (mode === "boundary") return "执行边界";
  return "任务单";
}

function hasChapterDetailDraft(
  chapter: VolumePlan["chapters"][number],
  mode: ChapterDetailMode,
): boolean {
  if (mode === "purpose") {
    return Boolean(chapter.purpose?.trim());
  }
  if (mode === "boundary") {
    return typeof chapter.conflictLevel === "number"
      || typeof chapter.revealLevel === "number"
      || typeof chapter.targetWordCount === "number"
      || Boolean(chapter.mustAvoid?.trim())
      || chapter.payoffRefs.length > 0;
  }
  return Boolean(chapter.taskSheet?.trim());
}

function hasAnyChapterDetailDraft(chapter: VolumePlan["chapters"][number]): boolean {
  return CHAPTER_DETAIL_MODES.some((mode) => hasChapterDetailDraft(chapter, mode));
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
    () => serializeVolumeDraft(normalizedVolumeDraft) !== serializeVolumeDraft(normalizedSavedVolumes),
    [normalizedSavedVolumes, normalizedVolumeDraft],
  );
  const readiness = useMemo(
    () => buildVolumePlanningReadiness({ volumes: normalizedVolumeDraft, strategyPlan, beatSheets }),
    [beatSheets, normalizedVolumeDraft, strategyPlan],
  );

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

  const [isGeneratingChapterDetailBundle, setIsGeneratingChapterDetailBundle] = useState(false);
  const [bundleGeneratingChapterId, setBundleGeneratingChapterId] = useState("");
  const [bundleGeneratingMode, setBundleGeneratingMode] = useState<ChapterDetailMode | "">("");

  const generateMutation = useMutation({
    mutationFn: async (payload: VolumeGenerationPayload): Promise<GeneratedVolumeMutationResult> => {
      const requestDraft = normalizeVolumeDraft(payload.draftVolumesOverride ?? normalizedVolumeDraft);
      const generatedResponse = await generateNovelVolumes(novelId, {
        provider: llm.provider,
        model: llm.model,
        temperature: llm.temperature,
        scope: payload.scope,
        targetVolumeId: payload.targetVolumeId,
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
        respectExistingVolumeCount: requestDraft.length > 0,
      });
      const nextDocument = generatedResponse.data;
      if (!nextDocument) {
        throw new Error("AI 没有返回卷工作区结果。");
      }

      try {
        const persistedResponse = await updateNovelVolumes(novelId, nextDocument);
        return {
          generatedResponse,
          persistedResponse,
          nextDocument: persistedResponse.data ?? nextDocument,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI 生成已完成，但自动保存失败。";
        throw new VolumeGenerationAutoSaveError(message, nextDocument);
      }
    },
    onSuccess: (result, payload) => {
      applyWorkspaceDocument(result.nextDocument);
      if (result.persistedResponse.data) {
        syncSavedVolumeDocumentToCache(result.persistedResponse.data);
      }

      if (payload.suppressSuccessMessage) {
        return;
      }

      if (payload.scope === "strategy") {
        const message = "卷战略建议已生成并自动保存。下一步请先审查，再确认卷骨架。";
        setVolumeGenerationMessage(message);
        setStructuredMessage(message);
        return;
      }
      if (payload.scope === "strategy_critique") {
        const message = "卷战略审稿已完成，问题和建议已写入右侧审稿区。";
        setVolumeGenerationMessage(message);
        return;
      }
      if (payload.scope === "skeleton" || payload.scope === "book") {
        const message = "卷骨架已生成并自动保存。系统已清空旧节奏板，下一步请为当前卷生成节奏板。";
        setVolumeGenerationMessage(message);
        setStructuredMessage(message);
        return;
      }
      if (payload.scope === "beat_sheet") {
        setStructuredMessage("当前卷节奏板已生成并自动保存。现在可以继续拆当前卷章节列表。");
        return;
      }
      if (payload.scope === "chapter_list" || payload.scope === "volume") {
        const updatedVolume = payload.targetVolumeId
          ? result.nextDocument.volumes.find((volume) => volume.id === payload.targetVolumeId)
          : undefined;
        const updatedChapterCount = updatedVolume?.chapters.length ?? 0;
        setStructuredMessage(
          updatedChapterCount > 0
            ? `当前卷章节列表已生成并自动保存，现已更新为 ${updatedChapterCount} 章，相邻卷再平衡建议也已同步更新。`
            : "当前卷章节列表已生成并自动保存，相邻卷再平衡建议也已同步更新。",
        );
        return;
      }
      if (payload.scope === "rebalance") {
        setStructuredMessage("相邻卷再平衡建议已更新。");
        return;
      }

      const label = detailModeLabel(payload.detailMode ?? "purpose");
      setStructuredMessage(`${label}已完成 AI 修正并自动保存。`);
    },
    onError: (error, payload) => {
      if (error instanceof VolumeGenerationAutoSaveError) {
        applyWorkspaceDocument(error.nextDocument);
      }
      const message = error instanceof VolumeGenerationAutoSaveError
        ? `AI 生成已完成，但自动保存失败：${error.message}`
        : error instanceof Error
          ? error.message
          : "卷级方案生成失败。";
      if (payload.scope === "strategy" || payload.scope === "strategy_critique" || payload.scope === "skeleton" || payload.scope === "book") {
        setVolumeGenerationMessage(message);
      }
      setStructuredMessage(message);
    },
  });

  const ensureCharacterGuard = () => {
    if (hasCharacters) {
      return true;
    }
    return window.confirm("当前小说还没有角色。继续生成会降低后续一致性，是否继续？");
  };

  const startStrategyGeneration = () => {
    if (!ensureCharacterGuard()) {
      return;
    }
    const confirmed = window.confirm([
      "将生成卷战略建议，帮助决定推荐卷数、硬规划卷数和各卷角色定位。",
      "这一步不会直接生成卷骨架，也不会拆章节。",
      hasUnsavedVolumeDraft ? "本次会直接使用当前页面未保存草稿作为参考。" : "本次会基于当前工作区状态生成建议。",
    ].join("\n\n"));
    if (!confirmed) {
      return;
    }
    generateMutation.mutate({ scope: "strategy" });
  };

  const startStrategyCritique = () => {
    if (!strategyPlan) {
      setVolumeGenerationMessage("请先生成卷战略建议。");
      return;
    }
    generateMutation.mutate({ scope: "strategy_critique" });
  };

  const startSkeletonGeneration = () => {
    if (!ensureCharacterGuard()) {
      return;
    }
    const confirmed = window.confirm([
      "将根据当前卷战略建议生成或重生成全书卷骨架。",
      "这一步会清空已有节奏板和相邻卷再平衡建议，但不会直接删除章节正文。",
      hasUnsavedVolumeDraft ? "本次会直接使用当前页面草稿作为卷骨架上下文。" : "本次会基于当前卷工作区继续推进。",
    ].join("\n\n"));
    if (!confirmed) {
      return;
    }
    generateMutation.mutate({ scope: "skeleton" });
  };

  const startBeatSheetGeneration = (volumeId: string) => {
    const targetVolume = normalizedVolumeDraft.find((volume) => volume.id === volumeId);
    if (!targetVolume) {
      setStructuredMessage("当前卷不存在，无法生成节奏板。");
      return;
    }
    if (!strategyPlan) {
      setStructuredMessage("请先生成卷战略建议，再生成当前卷节奏板。");
      return;
    }
    if (!ensureCharacterGuard()) {
      return;
    }
    generateMutation.mutate({
      scope: "beat_sheet",
      targetVolumeId: volumeId,
    });
  };

  const startChapterListGeneration = (volumeId: string) => {
    const targetVolume = normalizedVolumeDraft.find((volume) => volume.id === volumeId);
    if (!targetVolume) {
      setStructuredMessage("当前卷不存在，无法生成章节列表。");
      return;
    }
    if (!findBeatSheet(beatSheets, volumeId)) {
      setStructuredMessage("当前卷还没有节奏板，默认不能直接拆章节列表。");
      return;
    }
    if (!ensureCharacterGuard()) {
      return;
    }
    generateMutation.mutate({
      scope: "chapter_list",
      targetVolumeId: volumeId,
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

  const startChapterDetailBundleGeneration = (volumeId: string, chapterId: string) => {
    const targetVolume = normalizedVolumeDraft.find((volume) => volume.id === volumeId);
    const targetChapter = targetVolume?.chapters.find((chapter) => chapter.id === chapterId);
    if (!targetVolume || !targetChapter) {
      setStructuredMessage("当前章节不存在，无法整套生成章节细化。");
      return;
    }
    if (!findBeatSheet(beatSheets, volumeId)) {
      setStructuredMessage("请先生成当前卷节奏板，再做单章整套细化。");
      return;
    }
    if (!ensureCharacterGuard()) {
      return;
    }

    void (async () => {
      let workingDraft = normalizedVolumeDraft;
      setIsGeneratingChapterDetailBundle(true);
      setBundleGeneratingChapterId(chapterId);
      setStructuredMessage(`正在为第${targetChapter.chapterOrder}章连续生成章节目标、执行边界和任务单...`);

      try {
        for (const mode of CHAPTER_DETAIL_MODES) {
          setBundleGeneratingMode(mode);
          const result = await generateMutation.mutateAsync({
            scope: "chapter_detail",
            targetVolumeId: volumeId,
            targetChapterId: chapterId,
            detailMode: mode,
            draftVolumesOverride: workingDraft,
            suppressSuccessMessage: true,
          });
          workingDraft = result.nextDocument.volumes;
          applyWorkspaceDocument(result.nextDocument);
        }
        setStructuredMessage(`第${targetChapter.chapterOrder}章的章节目标、执行边界和任务单已补齐并自动保存。`);
      } catch {
        // onError handles message
      } finally {
        setIsGeneratingChapterDetailBundle(false);
        setBundleGeneratingChapterId("");
        setBundleGeneratingMode("");
      }
    })();
  };

  const handleVolumeFieldChange = (
    volumeId: string,
    field: keyof Pick<VolumePlan, "title" | "summary" | "openingHook" | "mainPromise" | "primaryPressureSource" | "coreSellingPoint" | "escalationMode" | "protagonistChange" | "midVolumeRisk" | "climax" | "payoffType" | "nextVolumeHook" | "resetPoint">,
    value: string,
  ) => {
    updateVolumeDraft((prev) => prev.map((volume) => (
      volume.id === volumeId ? { ...volume, [field]: value } : volume
    )), {
      clearBeatSheets: true,
      clearRebalanceDecisions: true,
    });
  };

  const handleOpenPayoffsChange = (volumeId: string, value: string) => {
    const nextPayoffs = value
      .split(/[\n,，;；、]/)
      .map((item) => item.trim())
      .filter(Boolean);
    updateVolumeDraft((prev) => prev.map((volume) => (
      volume.id === volumeId ? { ...volume, openPayoffs: nextPayoffs } : volume
    )), {
      clearBeatSheets: true,
      clearRebalanceDecisions: true,
    });
  };

  const handleAddVolume = () => {
    updateVolumeDraft((prev) => [...prev, createEmptyVolume(prev.length + 1)], {
      clearBeatSheets: true,
      clearRebalanceDecisions: true,
    });
  };

  const handleRemoveVolume = (volumeId: string) => {
    updateVolumeDraft((prev) => prev.filter((volume) => volume.id !== volumeId), {
      clearBeatSheets: true,
      clearRebalanceDecisions: true,
    });
  };

  const handleMoveVolume = (volumeId: string, direction: -1 | 1) => {
    updateVolumeDraft((prev) => {
      const list = prev.slice();
      const index = list.findIndex((volume) => volume.id === volumeId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= list.length) {
        return prev;
      }
      const [item] = list.splice(index, 1);
      list.splice(targetIndex, 0, item);
      return list;
    }, {
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
    updateVolumeDraft((prev) => prev.map((volume) => (
      volume.id !== volumeId
        ? volume
        : {
          ...volume,
          chapters: volume.chapters.map((chapter) => (
            chapter.id === chapterId ? { ...chapter, [field]: value } : chapter
          )),
        }
    )), {
      clearRebalanceDecisions: field === "title" || field === "summary",
    });
  };

  const handleChapterNumberChange = (
    volumeId: string,
    chapterId: string,
    field: keyof Pick<VolumePlan["chapters"][number], "conflictLevel" | "revealLevel" | "targetWordCount">,
    value: number | null,
  ) => {
    updateVolumeDraft((prev) => prev.map((volume) => (
      volume.id !== volumeId
        ? volume
        : {
          ...volume,
          chapters: volume.chapters.map((chapter) => (
            chapter.id === chapterId ? { ...chapter, [field]: value } : chapter
          )),
        }
    )), {
      clearRebalanceDecisions: true,
    });
  };

  const handleChapterPayoffRefsChange = (volumeId: string, chapterId: string, value: string) => {
    const nextRefs = value
      .split(/[\n,，;；、]/)
      .map((item) => item.trim())
      .filter(Boolean);
    updateVolumeDraft((prev) => prev.map((volume) => (
      volume.id !== volumeId
        ? volume
        : {
          ...volume,
          chapters: volume.chapters.map((chapter) => (
            chapter.id === chapterId ? { ...chapter, payoffRefs: nextRefs } : chapter
          )),
        }
    )));
  };

  const handleAddChapter = (volumeId: string) => {
    updateVolumeDraft((prev) => prev.map((volume) => (
      volume.id !== volumeId
        ? volume
        : {
          ...volume,
          chapters: [...volume.chapters, createEmptyChapter(prev.flatMap((item) => item.chapters).length + 1)],
        }
    )), {
      clearRebalanceDecisions: true,
    });
  };

  const handleRemoveChapter = (volumeId: string, chapterId: string) => {
    updateVolumeDraft((prev) => prev.map((volume) => (
      volume.id !== volumeId
        ? volume
        : {
          ...volume,
          chapters: volume.chapters.filter((chapter) => chapter.id !== chapterId),
        }
    )), {
      clearRebalanceDecisions: true,
    });
  };

  const handleMoveChapter = (volumeId: string, chapterId: string, direction: -1 | 1) => {
    updateVolumeDraft((prev) => prev.map((volume) => {
      if (volume.id !== volumeId) {
        return volume;
      }
      const chaptersInVolume = volume.chapters.slice();
      const index = chaptersInVolume.findIndex((chapter) => chapter.id === chapterId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= chaptersInVolume.length) {
        return volume;
      }
      const [item] = chaptersInVolume.splice(index, 1);
      chaptersInVolume.splice(targetIndex, 0, item);
      return { ...volume, chapters: chaptersInVolume };
    }), {
      clearRebalanceDecisions: true,
    });
  };

  const generationNotice = strategyPlan
    ? "当前工作区已进入二期链路：先审卷战略，再确认卷骨架，之后按卷生成节奏板和章节列表。"
    : "先生成卷战略建议，让系统帮你决定卷数和硬/软规划，再进入卷骨架。";
  const generatingChapterDetailMode: ChapterDetailMode | "" = isGeneratingChapterDetailBundle
    ? bundleGeneratingMode
    : generateMutation.variables?.scope === "chapter_detail"
      ? generateMutation.variables.detailMode ?? ""
      : "";
  const generatingChapterDetailChapterId = isGeneratingChapterDetailBundle
    ? bundleGeneratingChapterId
    : generateMutation.variables?.scope === "chapter_detail"
      ? generateMutation.variables.targetChapterId ?? ""
      : "";
  const isGeneratingChapterDetail = isGeneratingChapterDetailBundle
    || (generateMutation.isPending && generateMutation.variables?.scope === "chapter_detail");

  return {
    normalizedVolumeDraft,
    hasUnsavedVolumeDraft,
    generationNotice,
    readiness,
    isGeneratingStrategy: generateMutation.isPending && generateMutation.variables?.scope === "strategy",
    isCritiquingStrategy: generateMutation.isPending && generateMutation.variables?.scope === "strategy_critique",
    isGeneratingSkeleton: generateMutation.isPending && (generateMutation.variables?.scope === "skeleton" || generateMutation.variables?.scope === "book"),
    isGeneratingBeatSheet: generateMutation.isPending && generateMutation.variables?.scope === "beat_sheet",
    isGeneratingChapterList: generateMutation.isPending && (generateMutation.variables?.scope === "chapter_list" || generateMutation.variables?.scope === "volume"),
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
