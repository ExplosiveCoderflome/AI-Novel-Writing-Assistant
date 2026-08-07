import { useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  previewPrompt,
  testRunPrompt,
  type PromptCatalogItem,
  type PromptPreviewPayload,
  type PromptTestRunPayload,
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
        "Chapter mission: Example chapter",
        "Objective: To have the protagonist discover the old warehouse code and confirm that someone is approaching.",
        "Expectation: This chapter requires advancing the discovery of clues, creating external pressure, and leaving a trail at the end.",
        "Must advance",
        "The protagonist discovers a coded message on the wall and deduces that it points to the Old Town Archives.",
        "Footsteps approached from outside the door, forcing the protagonist to make an immediate choice.",
        "Must preserve",
        "- The code is a real clue, not a hallucination or ordinary graffiti.",
      ].join("\n"),
    },
    {
      id: "chapter_boundary",
      group: "chapter_boundary",
      priority: 99,
      required: true,
      content: [
        "Chapter boundary:",
        "Exclusive event: The protagonist discovers a coded message left by the previous investigator for the first time in the old warehouse.",
        "Entry state: The protagonist enters the old warehouse alone, and the meaning of the code has not yet been confirmed.",
        "Ending state: The protagonist confirms that the cipher points to the Old City Archives and realizes that the pursuers are already outside the door.",
        "Next chapter entry state: The protagonist must decide whether to take away the evidence or set up an ambush to investigate before being exposed.",
        "Do not cross",
        "- The true leader of the Old City organization must not be revealed directly in this chapter.",
        "- The tracker must not be allowed to fully explain the cipher system on the spot.",
        "Protected reveals",
        "- The true identity of the previous investigator.",
      ].join("\n"),
    },
    {
      id: "structure_obligations",
      group: "structure_obligations",
      priority: 94,
      required: true,
      content: [
        "Structure obligations",
        "- You must check whether the chapter has completed the discovery of clues, the approach of pressure, and the choice at the end of the chapter.",
        "- It is necessary to check whether the protagonist's motivation is consistent; the answer to the code cannot be known out of thin air.",
        "- It is necessary to check whether the ending creates new suspense or follow-up pressure.",
      ].join("\n"),
    },
    {
      id: "local_state",
      group: "local_state",
      priority: 89,
      content: "Local state before review:\nThe protagonist is inside an old warehouse, with pursuers approaching from the outside, and the meaning of the coded message has not yet been fully confirmed.",
    },
    {
      id: "world_rules",
      group: "world_rules",
      priority: 84,
      content: "Relevant world rules: The Old City Cipher System is known only to a select few investigators and members of underground organizations.",
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
        || "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
      : "The protagonist walks into the old warehouse and finds the code left by the previous investigator on the wall. Footsteps were approaching outside the door, and he had to determine where the code was pointing before he was exposed.";
    return {
      novelTitle: previewNovel?.title || "Sample novel",
      chapterTitle: previewChapter
        ? `第 ${previewChapter.order ?? "?"} 章 ${previewChapter.title || "Unnamed chapter"}`
        : "Example chapter",
      requestedTypes: ["plot", "character", "continuity"],
      storyModeContext: previewNovel
        ? "Conduct a book preview using the chapter assignments, chapter boundaries, and structural obligations of your chosen novel."
        : "This book prefers the rhythm of a serialized online novel, and the chapters need to continuously advance the conflict and retain the hook at the end of the chapter.",
      content: chapterContent,
      ragContext: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    };
  }

  if (prompt.id === "novel.chapter.writer") {
    const targetWordCount = previewChapter?.targetWordCount ?? 3000;
    const softMinWordCount = Math.max(800, Math.round(targetWordCount * 0.86));
    const softMaxWordCount = Math.max(softMinWordCount + 200, Math.round(targetWordCount * 1.14));
    return {
      novelTitle: previewNovel?.title || "Sample novel",
      chapterOrder: previewChapter?.order ?? 1,
      chapterTitle: previewChapter?.title || "Example chapter",
      mode: "draft",
      targetWordCount,
      minWordCount: softMinWordCount,
      maxWordCount: softMaxWordCount,
    };
  }

  if (prompt.id === "novel.chapter_editor.workspace_diagnosis") {
    return {
      chapterTitle: "Example chapter",
      chapterMission: "Let the protagonist discover key clues.",
      volumePositionLabel: "middle part of volume one",
      volumePhaseLabel: "Conflict unfolds",
      paceDirective: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      previousChapterBridge: "The previous chapter left a trail of clues.",
      nextChapterBridge: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      activePlotThreads: ["Tracking Archive Station"],
      paragraphs: [{ index: 1, text: "The protagonist walks into an old warehouse." }],
      openIssues: [],
    };
  }

  if (prompt.id === "bookAnalysis.character.profile") {
    return {
      generationDepth: "standard",
      selectedDimensions: ["basic", "personality", "arc"],
      character: {
        name: "Lin Che",
        role: "main character",
        briefDescription: "A young investigator forced to track down the secret code of an old warehouse.",
        importance: "high",
        occurringChapters: ["Chapter 1"],
      },
      characterSystemContext: "The protagonist is responsible for advancing the secrets of the old city.",
      notesText: "In Chapter 1, Lin Che discovered the secret code of the old warehouse and realized that someone was following him.",
      ragEvidenceText: "",
    };
  }

  if (prompt.id === "bookAnalysis.character.generate") {
    return {
      generationDepth: "standard",
      selectedDimensions: ["basic", "personality", "arc"],
      characterNames: ["Lin Che", "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."],
      characterSystemContext: "The core characters form a network around the secrets of the old city and the pressures of tracking them down.",
      notesText: "Lin Che discovered the code and Chen Wu had clues about the old city. The two temporarily distrusted each other.",
    };
  }

  if (prompt.id === "image.novel_cover.brief") {
    return {
      sourcePrompt: "The old city warehouse, the secret code on the wall, the footsteps outside the door, and the suspenseful vertical cover.",
      title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      description: "A young investigator discovers a code that changes his fate in an abandoned warehouse in the old city.",
      targetAudience: "Readers who like urban suspense and strong hooks.",
      bookSellingPoint: "Each chapter progresses around a traceable clue.",
      competingFeel: "Tense, restrained, with a bit of a cold movie feel.",
      first30ChapterPromise: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      commercialTags: ["Urban suspense", "Clues tracing", "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."],
      genreLabel: "Urban suspense",
      primaryStoryModeLabel: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      secondaryStoryModeLabel: "identity mystery",
      worldName: "old city",
      worldSummary: "An old city with a calm surface and intertwined underground clues.",
      styleTone: "Cold, compact, and strong image",
      narrativePovLabel: "third person limited perspective",
      pacePreferenceLabel: "Medium to fast pace",
      emotionIntensityLabel: "High-pressure restraint",
    };
  }

  if (prompt.id === "novel.character.castAuto.relations") {
    return {
      storyInput: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      optionTitle: "Old Town Tracking Lineup",
      optionSummary: "The protagonist, the clue giver and the source of pressure form a network of mutual exploration around the secrets of the old city.",
      protagonistName: "Lin Che",
      memberNames: ["Lin Che", "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", "Gu Heng"],
      memberRosterText: "Lin Che: Protagonist, young investigator.\
Chen Wu: Provider of clues, knows the source of the old city’s secret code.\
Gu Heng: Source of pressure, trying to stop the investigation.",
    };
  }

  if (prompt.id === "world.layer.generate") {
    return {
      layerKey: "foundation",
      targetFields: ["background", "geography"],
      worldName: "old city",
      worldType: "Urban anecdotes",
      templateName: "Urban suspense",
      templateDescription: "There is a long-running secret order hidden under the surface of the real city.",
      classicElements: ["old town", "underground organization", "clue code"],
      pitfalls: ["Don't explain all the mysteries at once", "Don’t let rules remain concepts"],
      axioms: "The secret code system in the old city really exists and will affect the characters' actions.",
      summary: "The old city consists of surface living areas and a network of underground clues.",
      blueprintPromptBlock: "The central stage is an abandoned warehouse, an old street and a covered archival station.",
      existingJson: "{}",
      ragContext: "No additional references.",
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
      focusAreas: ["Rhythm", "Sentence pattern", "Picture sense"],
      sourceText: "The footsteps outside the door stopped. Lin Che held her breath and brushed the code on the wall with her fingertips. She suddenly understood that this was not a warning, but an invitation.",
    };
  }

  if (prompt.id === "novel.chapter_editor.rewrite_candidates") {
    return {
      operation: "polish",
      operationLabel: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      scope: "selection",
      customInstruction: "",
      selectedText: "The footsteps outside the door stopped. Lin Che held her breath and brushed the code on the wall with her fingertips.",
      beforeParagraphs: ["There was only one flickering light left in the old warehouse."],
      afterParagraphs: ["Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."],
      goalSummary: "Let the protagonist discover key clues and use external pressure to create end-of-chapter tension.",
      chapterSummary: "The protagonist enters an old warehouse, discovers a secret code, and realizes that the pursuers are approaching.",
      styleSummary: "Cold, restrained, and clear in action details.",
      characterStateSummary: "The protagonist is wary but still willing to take risks to advance the investigation.",
      worldConstraintSummary: "Old City Codes are real clues, not hallucinations or ordinary graffiti.",
      macroContextSummary: "This chapter is responsible for the first threshold that involves the protagonist in the secrets of the old city.",
      resolvedIntentSummary: "Make the sequence more natural and heighten the suspenseful tension.",
      constraintsText: "The three facts that the code exists, that someone is approaching outside the door, and that the protagonist is investigating do not change.",
    };
  }

  return {
    goal: "View prompt word preview",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
    chapterTitle: "Example chapter",
    chapterMission: "Let the protagonist discover key clues.",
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

  const buildPayload = useCallback((): PromptPreviewPayload => {
    if (!prompt) {
      throw new Error("Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.");
    }
    const executionNovelId = novelId || "novel-1";
    const executionChapterId = chapterId || previewChapter?.id || (novelId ? undefined : "chapter-1");
    const hasRealChapterContext = Boolean(novelId && executionChapterId && previewChapter);
    return {
      promptKey: prompt.key,
      promptInput: buildPreviewPromptInput(prompt, previewNovel, previewChapter),
      executionContext: {
        entrypoint,
        novelId: executionNovelId,
        chapterId: executionChapterId,
        userGoal: "View prompt word preview",
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
  }, [
    chapterId,
    entrypoint,
    novelId,
    previewChapter,
    previewNovel,
    prompt,
    slotOverrides,
    templateDraft,
  ]);

  const previewMutation = useMutation({
    mutationFn: () => previewPrompt(buildPayload()),
  });

  const testRunMutation = useMutation({
    mutationFn: (llm?: PromptTestRunPayload["llm"]) => {
      const payload: PromptTestRunPayload = {
        ...buildPayload(),
        ...(llm ? { llm } : {}),
      };
      return testRunPrompt(payload);
    },
  });

  useEffect(() => {
    previewMutation.reset();
    testRunMutation.reset();
  }, [prompt?.key]);

  const generatePreview = useCallback(() => {
    previewMutation.mutate();
  }, [previewMutation]);

  const generateTestRun = useCallback((llm?: PromptTestRunPayload["llm"]) => {
    testRunMutation.mutate(llm);
  }, [testRunMutation]);

  return {
    generatePreview,
    generateTestRun,
    preview: previewMutation.data?.data ?? null,
    previewMutation,
    testRun: testRunMutation.data?.data ?? null,
    testRunMutation,
    resetPreview: previewMutation.reset,
  };
}
