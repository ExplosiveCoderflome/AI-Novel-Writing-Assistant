import i18next from "i18next";
import { useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  previewPrompt,
  type PromptCatalogItem,
  type PromptPreviewPayload,
  type PromptTemplateJson,
} from "@/api/promptWorkbench";
import type { PromptSlotDrafts } from "../promptWorkbenchTypes";

interface PreviewNovel {
  id: string;
  title?: string | null;
}

interface PreviewChapter {
  id: string;
  title?: string | null;
  order?: number | null;
  content?: string | null;
  expectation?: string | null;
  targetWordCount?: number | null;
  taskSheet?: string | null;
}

function buildPreviewExtraContextBlocks(prompt: PromptCatalogItem) {
  if (prompt.id !== "audit.chapter.light" && prompt.id !== "audit.chapter.full") {
    return [];
  }
  return [
    {
      id: "chapter_mission",
      group: "chapter_mission",
      priority: 100,
      content: [
        i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_fa5f7a3e"),
        i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_09492cc9"),
        i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_25d09fe2"),
        "Must advance",
        i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_187854b0"),
        i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_9226a0e2"),
        "Must preserve",
        i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_006c7888"),
      ].join("\n"),
    },
    {
      id: "chapter_boundary",
      group: "chapter_boundary",
      priority: 99,
      required: true,
      content: [
        "Chapter boundary:",
        i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_0f1f1de4"),
        i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_e8b8223d"),
        i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_ccb45e1c"),
        i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_062c8a32"),
        "Do not cross",
        i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_d0388d9d"),
        i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_04008be7"),
        "Protected reveals",
        i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_cebd0922"),
      ].join("\n"),
    },
    {
      id: "structure_obligations",
      group: "structure_obligations",
      priority: 94,
      required: true,
      content: [
        "Structure obligations",
        i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_b5afa73f"),
        i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_c606b03c"),
        i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_94f1c7cb"),
      ].join("\n"),
    },
    {
      id: "local_state",
      group: "local_state",
      priority: 89,
      content: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_c17dae8b"),
    },
    {
      id: "world_rules",
      group: "world_rules",
      priority: 84,
      content: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_b57151aa"),
    },
  ];
}

function buildPreviewExecutionMetadata(
  prompt: PromptCatalogItem,
  hasRealChapterContext: boolean,
): Record<string, unknown> | undefined {
  if (hasRealChapterContext) {
    return undefined;
  }
  const extraContextBlocks = buildPreviewExtraContextBlocks(prompt);
  if (extraContextBlocks.length === 0) {
    return undefined;
  }
  return { extraContextBlocks };
}

function buildPreviewPromptInput(
  prompt: PromptCatalogItem,
  previewNovel?: PreviewNovel | null,
  previewChapter?: PreviewChapter | null,
): Record<string, unknown> {
  if (prompt.id === "audit.chapter.light" || prompt.id === "audit.chapter.full") {
    const chapterContent = previewChapter
      ? previewChapter.content?.trim()
        || previewChapter.taskSheet?.trim()
        || previewChapter.expectation?.trim()
        || i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_07c0b1cc")
      : i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_e7f2b0ba");
    return {
      novelTitle: previewNovel?.title || i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_7a479795"),
      chapterTitle: previewChapter
        ? `第 ${previewChapter.order ?? "?"} 章 ${previewChapter.title || i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_db55d102")}`
        : i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_922be4ec"),
      requestedTypes: ["plot", "character", "continuity"],
      storyModeContext: previewNovel
        ? i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_a79b9784")
        : i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_62608d31"),
      content: chapterContent,
      ragContext: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_a9794fc2"),
    };
  }

  if (prompt.id === "novel.chapter.writer") {
    const targetWordCount = previewChapter?.targetWordCount ?? 3000;
    const softMinWordCount = Math.max(800, Math.round(targetWordCount * 0.86));
    const softMaxWordCount = Math.max(softMinWordCount + 200, Math.round(targetWordCount * 1.14));
    return {
      novelTitle: previewNovel?.title || i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_7a479795"),
      chapterOrder: previewChapter?.order ?? 1,
      chapterTitle: previewChapter?.title || i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_922be4ec"),
      mode: "draft",
      targetWordCount,
      minWordCount: softMinWordCount,
      maxWordCount: softMaxWordCount,
    };
  }

  if (prompt.id === "novel.chapter_editor.workspace_diagnosis") {
    return {
      chapterTitle: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_922be4ec"),
      chapterMission: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_baf94af2"),
      volumePositionLabel: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_9ca42306"),
      volumePhaseLabel: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_bd3b7f55"),
      paceDirective: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_ad61eb88"),
      previousChapterBridge: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.previousChapterTrail"),
      nextChapterBridge: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.enterPositiveConflict"),
      activePlotThreads: [i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_60c5c0a7")],
      paragraphs: [{ index: 1, text: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.mainCharacterEntersOldWarehouse") }],
      openIssues: [],
    };
  }

  if (prompt.id === "bookAnalysis.character.profile") {
    return {
      generationDepth: "standard",
      selectedDimensions: ["basic", "personality", "arc"],
      character: {
        name: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_e4abe8b6"),
        role: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.mainCharacter"),
        briefDescription: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_66fde00e"),
        importance: "high",
        occurringChapters: [i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_b74c6edc")],
      },
      characterSystemContext: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_86738028"),
      notesText: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_64bb617b"),
      ragEvidenceText: "",
    };
  }

  if (prompt.id === "bookAnalysis.character.generate") {
    return {
      generationDepth: "standard",
      selectedDimensions: ["basic", "personality", "arc"],
      characterNames: [i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_e4abe8b6"), i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_cf3fd6b1")],
      characterSystemContext: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_04956884"),
      notesText: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_aa409add"),
    };
  }

  if (prompt.id === "image.novel_cover.brief") {
    return {
      sourcePrompt: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_ebf7234e"),
      title: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_a11ed98f"),
      description: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_a7dd2e1b"),
      targetAudience: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_254602e3"),
      bookSellingPoint: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_21fd768c"),
      competingFeel: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_360a6ce1"),
      first30ChapterPromise: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_000f10cc"),
      commercialTags: [i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_b6f72e6e"), i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_bc75b56a"), i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_ec9fda10")],
      genreLabel: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_b6f72e6e"),
      primaryStoryModeLabel: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_7128794b"),
      secondaryStoryModeLabel: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_9e9456bf"),
      worldName: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_cd574c1e"),
      worldSummary: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_b9a14988"),
      styleTone: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_c35d44c5"),
      narrativePovLabel: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_d6180b7f"),
      pacePreferenceLabel: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_a53ec413"),
      emotionIntensityLabel: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_20da5903"),
    };
  }

  if (prompt.id === "novel.character.castAuto.relations") {
    return {
      storyInput: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_b544a42f"),
      optionTitle: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_b9a8b7e7"),
      optionSummary: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_9358433b"),
      protagonistName: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_e4abe8b6"),
      memberNames: [i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_e4abe8b6"), i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_cf3fd6b1"), i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_2f6eaf4c")],
      memberRosterText: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_93de760e"),
    };
  }

  if (prompt.id === "world.layer.generate") {
    return {
      layerKey: "foundation",
      targetFields: ["background", "geography"],
      worldName: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_cd574c1e"),
      worldType: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_49ce2313"),
      templateName: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_b6f72e6e"),
      templateDescription: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_9f62b479"),
      classicElements: [i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_a7fc11d2"), i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_d727f8ce"), i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_5fce8ed9")],
      pitfalls: [i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_b1e2d9de"), i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_e3f7033c")],
      axioms: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_de691fea"),
      summary: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_4f216488"),
      blueprintPromptBlock: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_18260977"),
      existingJson: "{}",
      ragContext: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_a0cfcb1f"),
    };
  }

  if (prompt.id === "world.layer.localize") {
    return {
      layerKey: "foundation",
      layerFields: ["background", "geography"],
      sourcePayloadJson: JSON.stringify({
        background: "Old city has a hidden clue network.",
        geography: "Warehouse district, old streets, archive station.",
      }),
    };
  }

  if (prompt.id === "writingFormula.extract.stream") {
    return {
      extractLevel: "standard",
      focusAreas: [i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_dd608458"), i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_885bfeeb"), i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_eb4de658")],
      sourceText: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_e95c1e5b"),
    };
  }

  if (prompt.id === "novel.chapter_editor.rewrite_candidates") {
    return {
      operation: "polish",
      operationLabel: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_88f06f8a"),
      scope: "selection",
      customInstruction: "",
      selectedText: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_73a4c830"),
      beforeParagraphs: [i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_2f243a17")],
      afterParagraphs: [i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_24063769")],
      goalSummary: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_2b987484"),
      chapterSummary: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_25f2ae57"),
      styleSummary: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_f51abd1d"),
      characterStateSummary: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_6fb0fb48"),
      worldConstraintSummary: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_86f576a8"),
      macroContextSummary: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_f763afce"),
      resolvedIntentSummary: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_1354797c"),
      constraintsText: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_af58b965"),
    };
  }

  return {
    goal: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_497aacb7"),
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
    chapterTitle: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_922be4ec"),
    chapterMission: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_baf94af2"),
  };
}

interface UsePromptPreviewInput {
  prompt: PromptCatalogItem | null;
  entrypoint: string;
  novelId?: string;
  chapterId?: string;
  previewNovel?: PreviewNovel | null;
  previewChapter?: PreviewChapter | null;
  slotOverrides: PromptSlotDrafts;
  templateDraft?: PromptTemplateJson;
}

export function usePromptPreview(input: UsePromptPreviewInput) {
  const {
    chapterId,
    entrypoint,
    novelId,
    previewChapter,
    previewNovel,
    prompt,
    slotOverrides,
    templateDraft,
  } = input;

  const previewMutation = useMutation({
    mutationFn: () => {
      if (!prompt) {
        throw new Error(i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_7ea1f499"));
      }
      const executionNovelId = novelId || "novel-1";
      const executionChapterId = chapterId || previewChapter?.id || (novelId ? undefined : "chapter-1");
      const hasRealChapterContext = Boolean(novelId && executionChapterId && previewChapter);
      const payload: PromptPreviewPayload = {
        promptKey: prompt.key,
        promptInput: buildPreviewPromptInput(prompt, previewNovel, previewChapter),
        executionContext: {
          entrypoint,
          novelId: executionNovelId,
          chapterId: executionChapterId,
          userGoal: i18next.t("gen.pages.promptWorkbench.hooks.usePromptPreview.gen_497aacb7"),
          resourceBindings: {
            novelId: executionNovelId,
            ...(executionChapterId ? { chapterId: executionChapterId } : {}),
          },
          metadata: buildPreviewExecutionMetadata(prompt, hasRealChapterContext),
        },
        maxContextTokens: prompt.contextPolicy.maxTokensBudget,
        slotOverrides,
        templateDraft,
      };
      return previewPrompt(payload);
    },
  });

  useEffect(() => {
    previewMutation.reset();
  }, [prompt?.key]);

  const generatePreview = useCallback(() => {
    previewMutation.mutate();
  }, [previewMutation]);

  return {
    generatePreview,
    preview: previewMutation.data?.data ?? null,
    previewMutation,
    resetPreview: previewMutation.reset,
  };
}
