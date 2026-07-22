import i18next from "i18next";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Chapter, ReviewIssue } from "@ai-novel/shared/types/novel";
import { updateNovelChapter } from "@/api/novel";
import { generateChapterExecutionContract } from "@/api/novel/chapters";
import { generateNovelChapterSummary } from "@/api/novelChapterSummary";
import {
  buildRepairIssue,
  resolveTargetWordCount,
  type ChapterExecutionStrategy,
} from "../chapterExecution.utils";
import { syncNovelWorkflowStageSilently } from "../novelWorkflow.client";

interface UseChapterExecutionActionsArgs {
  novelId: string;
  selectedChapterId: string;
  selectedChapter?: Chapter;
  strategy: ChapterExecutionStrategy;
  reviewIssues: ReviewIssue[];
  onGenerateChapter: () => void;
  onReviewChapter: (kind: "continuity" | "character_consistency" | "pacing") => void;
  onStartRepair: (issues: ReviewIssue[]) => void;
  onMessage: (message: string) => void;
  isGeneratingChapter: boolean;
  isRepairingChapter: boolean;
  invalidateNovelDetail: () => Promise<void>;
}

type ExecutionContractActionKind = "taskSheet" | "sceneCards" | null;
type RepairActionKind =
  | "autoRepair"
  | "expand"
  | "compress"
  | "strengthenConflict"
  | "enhanceEmotion"
  | "unifyStyle"
  | "addDialogue"
  | "addDescription"
  | null;
type GenerationActionKind = "rewrite" | null;

export function useChapterExecutionActions({
  novelId,
  selectedChapterId,
  selectedChapter,
  strategy,
  reviewIssues,
  onGenerateChapter,
  onReviewChapter,
  onStartRepair,
  onMessage,
  isGeneratingChapter,
  isRepairingChapter,
  invalidateNovelDetail,
}: UseChapterExecutionActionsArgs) {
  const [executionContractActionKind, setExecutionContractActionKind] = useState<ExecutionContractActionKind>(null);
  const [repairActionKind, setRepairActionKind] = useState<RepairActionKind>(null);
  const [generationActionKind, setGenerationActionKind] = useState<GenerationActionKind>(null);

  const patchChapterMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateNovelChapter>[2]) => updateNovelChapter(novelId, selectedChapterId, payload),
    onSuccess: async () => {
      await invalidateNovelDetail();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_3d21e9d2");
      onMessage(message);
    },
  });

  const summarizeChapterMutation = useMutation({
    mutationFn: () => generateNovelChapterSummary(novelId, selectedChapterId),
    onSuccess: async () => {
      await invalidateNovelDetail();
      await syncNovelWorkflowStageSilently({
        novelId,
        stage: "chapter_execution",
        itemLabel: i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_e2d94dad"),
        chapterId: selectedChapterId || undefined,
        status: "waiting_approval",
      });
      onMessage(i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_788ce765"));
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_7c664292");
      onMessage(message);
    },
  });

  const generateExecutionContractMutation = useMutation({
    mutationFn: () => generateChapterExecutionContract(novelId, selectedChapterId),
    onSuccess: async () => {
      await invalidateNovelDetail();
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_7a1bf74c");
      onMessage(message);
    },
    onSettled: () => {
      setExecutionContractActionKind(null);
    },
  });

  useEffect(() => {
    if (!isRepairingChapter) {
      setRepairActionKind(null);
    }
  }, [isRepairingChapter]);

  useEffect(() => {
    if (!isGeneratingChapter) {
      setGenerationActionKind(null);
    }
  }, [isGeneratingChapter]);

  const ensureChapter = (): Chapter | null => {
    if (!selectedChapterId || !selectedChapter) {
      onMessage(i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_c0bd44c0"));
      return null;
    }
    return selectedChapter;
  };

  const applyStrategy = () => {
    const chapter = ensureChapter();
    if (!chapter) {
      return;
    }
    const targetWordCount = resolveTargetWordCount(strategy);
    const revealLevel = Math.max(0, Math.min(100, Math.round(strategy.conflictLevel * 0.75)));
    patchChapterMutation.mutate({
      targetWordCount,
      conflictLevel: strategy.conflictLevel,
      revealLevel,
      chapterStatus: "pending_generation",
    });
    void syncNovelWorkflowStageSilently({
      novelId,
      stage: "chapter_execution",
      itemLabel: i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_3dc01fd2"),
      chapterId: chapter.id,
      status: "waiting_approval",
    });
    onMessage(i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_4d45dbf2"));
  };

  const rewriteChapter = () => {
    const chapter = ensureChapter();
    if (!chapter) {
      return;
    }
    setGenerationActionKind("rewrite");
    patchChapterMutation.mutate({
      content: "",
      chapterStatus: "pending_generation",
      repairHistory: `${chapter.repairHistory ?? ""}\n[rewrite] ${new Date().toISOString()}`.trim(),
    });
    void syncNovelWorkflowStageSilently({
      novelId,
      stage: "chapter_execution",
      itemLabel: i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_612ac45b"),
      chapterId: chapter.id,
      status: "waiting_approval",
    });
    onGenerateChapter();
    onMessage(i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_3f47b378"));
  };

  const expandChapter = () => {
    if (!ensureChapter()) {
      return;
    }
    setRepairActionKind("expand");
    onStartRepair([
      buildRepairIssue("engagement", i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_02942d0d"), i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_3d1d0fb6")),
    ]);
    onMessage(i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_cd4c368e"));
  };

  const compressChapter = () => {
    if (!ensureChapter()) {
      return;
    }
    setRepairActionKind("compress");
    onStartRepair([
      buildRepairIssue("repetition", i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_18e8ea28"), i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_a0a8960d")),
    ]);
    onMessage(i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_d9f44f8f"));
  };

  const summarizeChapter = () => {
    if (!ensureChapter()) {
      return;
    }
    summarizeChapterMutation.mutate();
  };

  const generateTaskSheet = () => {
    if (!ensureChapter()) {
      return;
    }
    setExecutionContractActionKind("taskSheet");
    generateExecutionContractMutation.mutate(undefined, {
      onSuccess: async (response) => {
        await invalidateNovelDetail();
        const chapterId = response.data?.id ?? selectedChapterId;
        void syncNovelWorkflowStageSilently({
          novelId,
          stage: "chapter_execution",
          itemLabel: i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_210ae9e0"),
          chapterId,
          status: "waiting_approval",
        });
        onMessage(i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_9eac6f90"));
      },
    });
  };

  const generateSceneCards = () => {
    if (!ensureChapter()) {
      return;
    }
    setExecutionContractActionKind("sceneCards");
    generateExecutionContractMutation.mutate(undefined, {
      onSuccess: async (response) => {
        await invalidateNovelDetail();
        const chapterId = response.data?.id ?? selectedChapterId;
        void syncNovelWorkflowStageSilently({
          novelId,
          stage: "chapter_execution",
          itemLabel: i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_2e6c4e10"),
          chapterId,
          status: "waiting_approval",
        });
        onMessage(i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_ab5adb5c"));
      },
    });
  };

  const checkContinuity = () => {
    if (!ensureChapter()) {
      return;
    }
    onReviewChapter("continuity");
    onMessage(i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_a6f6e584"));
  };

  const checkCharacterConsistency = () => {
    if (!ensureChapter()) {
      return;
    }
    onReviewChapter("character_consistency");
    onMessage(i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_26c81642"));
  };

  const checkPacing = () => {
    if (!ensureChapter()) {
      return;
    }
    onReviewChapter("pacing");
    onMessage(i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_192a6a52"));
  };

  const autoRepair = () => {
    if (!ensureChapter()) {
      return;
    }
    setRepairActionKind("autoRepair");
    const issues = reviewIssues.length > 0
      ? reviewIssues
      : [buildRepairIssue("coherence", i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_17b6fe66"), i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_d01035d4"))];
    onStartRepair(issues);
    onMessage(i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_9e93c398"));
  };

  const strengthenConflict = () => {
    if (!ensureChapter()) {
      return;
    }
    setRepairActionKind("strengthenConflict");
    onStartRepair([
      buildRepairIssue("pacing", i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_7d3fb9c8"), i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_a932503e")),
    ]);
    onMessage(i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_05d1fb09"));
  };

  const enhanceEmotion = () => {
    if (!ensureChapter()) {
      return;
    }
    setRepairActionKind("enhanceEmotion");
    onStartRepair([
      buildRepairIssue("engagement", i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_727ed12b"), i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_06b5b08d")),
    ]);
    onMessage(i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_fb41b4ed"));
  };

  const unifyStyle = () => {
    if (!ensureChapter()) {
      return;
    }
    setRepairActionKind("unifyStyle");
    onStartRepair([
      buildRepairIssue("voice", i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_7e885f33"), i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_1638bc02")),
    ]);
    onMessage(i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_81e68d93"));
  };

  const addDialogue = () => {
    if (!ensureChapter()) {
      return;
    }
    setRepairActionKind("addDialogue");
    onStartRepair([
      buildRepairIssue("voice", i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_0511286d"), i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_03515908")),
    ]);
    onMessage(i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_49668d0c"));
  };

  const addDescription = () => {
    if (!ensureChapter()) {
      return;
    }
    setRepairActionKind("addDescription");
    onStartRepair([
      buildRepairIssue("engagement", i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_ac08e8c8"), i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_22d278ec")),
    ]);
    onMessage(i18next.t("gen.pages.novels.hooks.useChapterExecutionActions.gen_33d10303"));
  };

  return {
    isPatchingChapter: patchChapterMutation.isPending,
    isGeneratingExecutionContract: generateExecutionContractMutation.isPending,
    isGeneratingTaskSheet: generateExecutionContractMutation.isPending && executionContractActionKind === "taskSheet",
    isGeneratingSceneCards: generateExecutionContractMutation.isPending && executionContractActionKind === "sceneCards",
    isSummarizingChapter: summarizeChapterMutation.isPending,
    repairActionKind,
    generationActionKind,
    applyStrategy,
    rewriteChapter,
    expandChapter,
    compressChapter,
    summarizeChapter,
    generateTaskSheet,
    generateSceneCards,
    checkContinuity,
    checkCharacterConsistency,
    checkPacing,
    autoRepair,
    strengthenConflict,
    enhanceEmotion,
    unifyStyle,
    addDialogue,
    addDescription,
  };
}
