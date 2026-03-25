import { useMemo, type Dispatch, type SetStateAction } from "react";
import { useMutation } from "@tanstack/react-query";
import type { VolumePlan } from "@ai-novel/shared/types/novel";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { generateNovelVolumes } from "@/api/novel";
import {
  createEmptyChapter,
  createEmptyVolume,
  normalizeVolumeDraft,
} from "../volumePlan.utils";

type ChapterDetailMode = "purpose" | "boundary" | "task_sheet";

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
  savedVolumes: VolumePlan[];
  setVolumeDraft: Dispatch<SetStateAction<VolumePlan[]>>;
  setVolumeGenerationMessage: (value: string) => void;
  setStructuredMessage: (value: string) => void;
}

function serializeVolumeDraft(volumes: VolumePlan[]): string {
  return JSON.stringify(normalizeVolumeDraft(volumes).map((volume) => ({
    sortOrder: volume.sortOrder,
    title: volume.title,
    summary: volume.summary ?? "",
    mainPromise: volume.mainPromise ?? "",
    escalationMode: volume.escalationMode ?? "",
    protagonistChange: volume.protagonistChange ?? "",
    climax: volume.climax ?? "",
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

function hasMeaningfulChapterList(volume: VolumePlan | undefined): boolean {
  if (!volume) {
    return false;
  }
  return volume.chapters.some((chapter) => (
    chapter.summary.trim().length > 0
    || chapter.title.trim() !== `第${chapter.chapterOrder}章`
  ));
}

function detailModeLabel(mode: ChapterDetailMode): string {
  if (mode === "purpose") return "章节目标";
  if (mode === "boundary") return "执行边界";
  return "任务单";
}

export function useNovelVolumePlanning({
  novelId,
  hasCharacters,
  llm,
  estimatedChapterCount,
  volumeDraft,
  savedVolumes,
  setVolumeDraft,
  setVolumeGenerationMessage,
  setStructuredMessage,
}: UseNovelVolumePlanningArgs) {
  const normalizedVolumeDraft = useMemo(
    () => normalizeVolumeDraft(volumeDraft),
    [volumeDraft],
  );
  const normalizedSavedVolumes = useMemo(
    () => normalizeVolumeDraft(savedVolumes),
    [savedVolumes],
  );
  const hasUnsavedVolumeDraft = useMemo(
    () => serializeVolumeDraft(normalizedVolumeDraft) !== serializeVolumeDraft(normalizedSavedVolumes),
    [normalizedSavedVolumes, normalizedVolumeDraft],
  );

  const updateVolumeDraft = (updater: (prev: VolumePlan[]) => VolumePlan[]) => {
    setVolumeDraft((prev) => normalizeVolumeDraft(updater(prev)));
  };

  const generateMutation = useMutation({
    mutationFn: (payload: {
      scope: "book" | "volume" | "chapter_detail";
      targetVolumeId?: string;
      targetChapterId?: string;
      detailMode?: ChapterDetailMode;
    }) => generateNovelVolumes(novelId, {
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
      scope: payload.scope,
      targetVolumeId: payload.targetVolumeId,
      targetChapterId: payload.targetChapterId,
      detailMode: payload.detailMode,
      draftVolumes: normalizedVolumeDraft.length > 0 ? normalizedVolumeDraft : undefined,
      estimatedChapterCount: typeof estimatedChapterCount === "number" && estimatedChapterCount > 0
        ? estimatedChapterCount
        : undefined,
      respectExistingVolumeCount: normalizedVolumeDraft.length > 0,
    }),
    onSuccess: (response, payload) => {
      setVolumeDraft(response.data?.volumes ?? []);

      if (payload.scope === "book") {
        const message = normalizedVolumeDraft.length > 0
          ? `全书卷骨架已重生成，当前保留 ${normalizedVolumeDraft.length} 卷。章节列表请按卷单独生成。`
          : "全书卷骨架已生成。下一步请按卷生成章节列表。";
        setVolumeGenerationMessage(message);
        setStructuredMessage(message);
        return;
      }

      if (payload.scope === "volume") {
        const targetVolume = normalizedVolumeDraft.find((volume) => volume.id === payload.targetVolumeId);
        setStructuredMessage(`已生成${targetVolume ? `《${targetVolume.title}》` : "当前卷"}的章节列表，本次只填写标题和摘要。`);
        return;
      }

      const label = detailModeLabel(payload.detailMode ?? "purpose");
      setStructuredMessage(`${label}已生成，你可以继续手动微调。`);
    },
    onError: (error, payload) => {
      const message = error instanceof Error ? error.message : "卷级方案生成失败。";
      if (payload.scope === "book") {
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

  const startBookGeneration = () => {
    if (!ensureCharacterGuard()) {
      return;
    }
    const volumeCount = normalizedVolumeDraft.length;
    const confirmed = window.confirm(
      volumeCount > 0
        ? [
          `将重写全书卷骨架，并默认保持当前 ${volumeCount} 卷。`,
          "这一步不会生成章节列表，也不会自动补章节目标、执行边界和任务单。",
          hasUnsavedVolumeDraft ? "本次会直接使用当前页面未保存草稿，不需要先保存。" : "本次会使用当前卷工作台作为生成上下文。",
        ].join("\n\n")
        : [
          "将根据宏观规划初始化全书卷骨架。",
          "这一步不会生成章节列表；章节列表需要后续按卷单独生成。",
          hasUnsavedVolumeDraft ? "本次会优先使用当前页面草稿。" : "如果你刚改了项目设定，当前页面里的预计章节数也会参与本次生成。",
        ].join("\n\n"),
    );
    if (!confirmed) {
      return;
    }
    generateMutation.mutate({ scope: "book" });
  };

  const startVolumeChapterGeneration = (volumeId: string) => {
    const targetVolume = normalizedVolumeDraft.find((volume) => volume.id === volumeId);
    if (!targetVolume) {
      setStructuredMessage("当前卷不存在，无法生成章节列表。");
      return;
    }
    if (!ensureCharacterGuard()) {
      return;
    }
    const actionLabel = hasMeaningfulChapterList(targetVolume) ? "重写" : "生成";
    const confirmed = window.confirm([
      `将${actionLabel}第${targetVolume.sortOrder}卷《${targetVolume.title}》的章节列表。`,
      "本次只会生成章节标题和章节摘要，不会自动补章节目标、执行边界和任务单。",
      "只会修改当前卷，其他卷不会被重算。",
      hasUnsavedVolumeDraft ? "本次会直接使用当前页面未保存草稿作为上下文。" : "本次会基于当前卷工作台生成。",
    ].join("\n\n"));
    if (!confirmed) {
      return;
    }
    generateMutation.mutate({
      scope: "volume",
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
    if (!ensureCharacterGuard()) {
      return;
    }
    const confirmed = window.confirm([
      `将为第${targetChapter.chapterOrder}章《${targetChapter.title}》生成${detailModeLabel(detailMode)}。`,
      "本次只补当前章节这一块信息，不会改动本章摘要，也不会影响其他章节。",
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

  const handleVolumeFieldChange = (
    volumeId: string,
    field: keyof Pick<VolumePlan, "title" | "summary" | "mainPromise" | "escalationMode" | "protagonistChange" | "climax" | "nextVolumeHook" | "resetPoint">,
    value: string,
  ) => {
    updateVolumeDraft((prev) => prev.map((volume) => (
      volume.id === volumeId ? { ...volume, [field]: value } : volume
    )));
  };

  const handleOpenPayoffsChange = (volumeId: string, value: string) => {
    const nextPayoffs = value
      .split(/[\n,，;；、]/)
      .map((item) => item.trim())
      .filter(Boolean);
    updateVolumeDraft((prev) => prev.map((volume) => (
      volume.id === volumeId ? { ...volume, openPayoffs: nextPayoffs } : volume
    )));
  };

  const handleAddVolume = () => {
    updateVolumeDraft((prev) => [
      ...prev,
      createEmptyVolume(prev.length + 1),
    ]);
  };

  const handleRemoveVolume = (volumeId: string) => {
    updateVolumeDraft((prev) => prev.filter((volume) => volume.id !== volumeId));
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
    )));
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
    )));
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
          chapters: [
            ...volume.chapters,
            createEmptyChapter(prev.flatMap((item) => item.chapters).length + 1),
          ],
        }
    )));
  };

  const handleRemoveChapter = (volumeId: string, chapterId: string) => {
    updateVolumeDraft((prev) => prev.map((volume) => (
      volume.id !== volumeId
        ? volume
        : {
          ...volume,
          chapters: volume.chapters.filter((chapter) => chapter.id !== chapterId),
        }
    )));
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
    }));
  };

  const generationNotice = hasUnsavedVolumeDraft
    ? "当前有未保存草稿。本次会直接使用页面最新草稿。全书骨架、章节列表、章节细化已拆成三步。"
    : normalizedVolumeDraft.length > 0
      ? `当前默认锁定 ${normalizedVolumeDraft.length} 卷。全书骨架不会自动生成章节列表，章节细化也需要单独触发。`
      : "先生成全书卷骨架，再按卷生成章节列表；章节目标、执行边界、任务单都改成按需生成。";
  const generatingChapterDetailMode: ChapterDetailMode | "" = generateMutation.variables?.scope === "chapter_detail"
    ? generateMutation.variables.detailMode ?? ""
    : "";
  const generatingChapterDetailChapterId = generateMutation.variables?.scope === "chapter_detail"
    ? generateMutation.variables.targetChapterId ?? ""
    : "";

  return {
    normalizedVolumeDraft,
    hasUnsavedVolumeDraft,
    generationNotice,
    isGeneratingBook: generateMutation.isPending && generateMutation.variables?.scope === "book",
    isGeneratingVolume: generateMutation.isPending && generateMutation.variables?.scope === "volume",
    isGeneratingChapterDetail: generateMutation.isPending && generateMutation.variables?.scope === "chapter_detail",
    generatingChapterDetailMode,
    generatingChapterDetailChapterId,
    startBookGeneration,
    startVolumeGeneration: startVolumeChapterGeneration,
    startChapterDetailGeneration,
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
