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
        "Chapter mission: 示例章节",
        "Objective: 让主角发现旧仓库暗号，并确认有人正在逼近。",
        "Expectation: 本章需要推进线索发现、制造外部压力，并在结尾留下追踪钩子。",
        "Must advance",
        "- 主角发现墙上暗号并判断它指向旧城档案站。",
        "- 门外脚步声逼近，迫使主角做出即时选择。",
        "Must preserve",
        "- 暗号是真实线索，不是幻觉或普通涂鸦。",
      ].join("\n"),
    },
    {
      id: "chapter_boundary",
      group: "chapter_boundary",
      priority: 99,
      required: true,
      content: [
        "Chapter boundary:",
        "Exclusive event: 主角第一次在旧仓库发现上一任调查员留下的暗号。",
        "Entry state: 主角独自进入旧仓库，尚未确认暗号含义。",
        "Ending state: 主角确认暗号指向旧城档案站，同时意识到追踪者已经到门外。",
        "Next chapter entry state: 主角必须在暴露前决定带走证据还是设伏反查。",
        "Do not cross",
        "- 不得在本章直接揭开旧城组织的真实首领。",
        "- 不得让追踪者当场完整解释暗号系统。",
        "Protected reveals",
        "- 上一任调查员的真实身份。",
      ].join("\n"),
    },
    {
      id: "structure_obligations",
      group: "structure_obligations",
      priority: 94,
      required: true,
      content: [
        "Structure obligations",
        "- 必须检查本章是否完成线索发现、压力逼近和章末选择点。",
        "- 必须检查主角行动动机是否连续，不能凭空知道暗号答案。",
        "- 必须检查结尾是否形成新的悬念或追踪压力。",
      ].join("\n"),
    },
    {
      id: "local_state",
      group: "local_state",
      priority: 89,
      content: "Local state before review:\n主角身处旧仓库内部，外部追踪者正在靠近，暗号含义尚未完全确认。",
    },
    {
      id: "world_rules",
      group: "world_rules",
      priority: 84,
      content: "Relevant world rules\n- 旧城暗号系统只由少数调查员和地下组织成员掌握。",
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
        || "当前章节暂无正文。"
      : "主角走进旧仓库，发现墙上残留着上一任调查员留下的暗号。门外脚步声逼近，他必须在暴露前判断暗号指向哪里。";
    return {
      novelTitle: previewNovel?.title || "示例小说",
      chapterTitle: previewChapter
        ? `第 ${previewChapter.order ?? "?"} 章 ${previewChapter.title || "未命名章节"}`
        : "示例章节",
      requestedTypes: ["plot", "character", "continuity"],
      storyModeContext: previewNovel
        ? "使用所选小说的章节任务、章节边界和结构义务进行本书预览。"
        : "本书偏连载网文节奏，章节需要持续推进冲突并保留章末钩子。",
      content: chapterContent,
      ragContext: "无额外检索补充。",
    };
  }

  if (prompt.id === "novel.chapter.writer") {
    const targetWordCount = previewChapter?.targetWordCount ?? 3000;
    const softMinWordCount = Math.max(800, Math.round(targetWordCount * 0.86));
    const softMaxWordCount = Math.max(softMinWordCount + 200, Math.round(targetWordCount * 1.14));
    return {
      novelTitle: previewNovel?.title || "示例小说",
      chapterOrder: previewChapter?.order ?? 1,
      chapterTitle: previewChapter?.title || "示例章节",
      mode: "draft",
      targetWordCount,
      minWordCount: softMinWordCount,
      maxWordCount: softMaxWordCount,
    };
  }

  if (prompt.id === "novel.chapter_editor.workspace_diagnosis") {
    return {
      chapterTitle: "示例章节",
      chapterMission: "让主角发现关键线索。",
      volumePositionLabel: "第一卷中段",
      volumePhaseLabel: "冲突展开",
      paceDirective: "加快推进",
      previousChapterBridge: "上一章留下追踪线索。",
      nextChapterBridge: "下一章进入正面对抗。",
      activePlotThreads: ["追踪档案站"],
      paragraphs: [{ index: 1, text: "主角走进旧仓库。" }],
      openIssues: [],
    };
  }

  if (prompt.id === "bookAnalysis.character.profile") {
    return {
      generationDepth: "standard",
      selectedDimensions: ["basic", "personality", "arc"],
      character: {
        name: "林澈",
        role: "主角",
        briefDescription: "被迫追查旧仓库暗号的年轻调查员。",
        importance: "high",
        occurringChapters: ["第 1 章"],
      },
      characterSystemContext: "主角承担揭开旧城秘密的推进职责。",
      notesText: "第 1 章中，林澈发现旧仓库暗号，并意识到有人正在追踪他。",
      ragEvidenceText: "",
    };
  }

  if (prompt.id === "bookAnalysis.character.generate") {
    return {
      generationDepth: "standard",
      selectedDimensions: ["basic", "personality", "arc"],
      characterNames: ["林澈", "沈雾"],
      characterSystemContext: "核心角色围绕旧城秘密和追踪压力形成关系网。",
      notesText: "林澈发现暗号，沈雾掌握旧城线索，两人暂时互不信任。",
    };
  }

  if (prompt.id === "image.novel_cover.brief") {
    return {
      sourcePrompt: "旧城仓库、墙上暗号、门外脚步声、悬疑感强的竖版封面。",
      title: "旧城暗号",
      description: "年轻调查员在旧城废仓中发现改变命运的暗号。",
      targetAudience: "喜欢都市悬疑和强钩子开篇的读者。",
      bookSellingPoint: "每章都围绕一个可追查的线索推进。",
      competingFeel: "紧张、克制、带一点冷色电影感。",
      first30ChapterPromise: "揭开旧城暗号背后的组织，并让主角卷入更大的阴谋。",
      commercialTags: ["都市悬疑", "线索追查", "高压开局"],
      genreLabel: "都市悬疑",
      primaryStoryModeLabel: "线索推进",
      secondaryStoryModeLabel: "身份谜团",
      worldName: "旧城",
      worldSummary: "一座表面平静、地下线索交错的旧城区。",
      styleTone: "冷峻、紧凑、画面感强",
      narrativePovLabel: "第三人称有限视角",
      pacePreferenceLabel: "中快节奏",
      emotionIntensityLabel: "高压克制",
    };
  }

  if (prompt.id === "novel.character.castAuto.relations") {
    return {
      storyInput: "主角在旧城追查暗号，逐步发现身边人的隐瞒与组织压力。",
      optionTitle: "旧城追踪阵容",
      optionSummary: "主角、线索提供者和压力来源围绕旧城秘密形成互相试探的关系网。",
      protagonistName: "林澈",
      memberNames: ["林澈", "沈雾", "顾衡"],
      memberRosterText: "林澈：主角，年轻调查员。\n沈雾：线索提供者，知道旧城暗号来源。\n顾衡：压力来源，试图阻止调查。",
    };
  }

  if (prompt.id === "world.layer.generate") {
    return {
      layerKey: "foundation",
      targetFields: ["background", "geography"],
      worldName: "旧城",
      worldType: "都市异闻",
      templateName: "都市悬疑",
      templateDescription: "现实城市表层下隐藏长期运转的秘密秩序。",
      classicElements: ["旧城区", "地下组织", "线索暗号"],
      pitfalls: ["不要把所有谜团一次解释完", "不要让规则只停留在概念"],
      axioms: "旧城的暗号系统真实存在，并会影响人物行动。",
      summary: "旧城由表面生活区和地下线索网络构成。",
      blueprintPromptBlock: "核心舞台是废弃仓库、老街和被遮蔽的档案站。",
      existingJson: "{}",
      ragContext: "无额外参考。",
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
      focusAreas: ["节奏", "句式", "画面感"],
      sourceText: "门外脚步声停住了。林澈按住呼吸，指尖擦过墙上的暗号，忽然明白这不是警告，而是邀请。",
    };
  }

  if (prompt.id === "novel.chapter_editor.rewrite_candidates") {
    return {
      operation: "polish",
      operationLabel: "润色选中片段",
      scope: "selection",
      customInstruction: "",
      selectedText: "门外脚步声停住了。林澈按住呼吸，指尖擦过墙上的暗号。",
      beforeParagraphs: ["旧仓库里只剩一盏忽明忽暗的灯。"],
      afterParagraphs: ["下一秒，铁门被人从外面轻轻推开。"],
      goalSummary: "让主角发现关键线索，并用外部压力制造章末紧张感。",
      chapterSummary: "主角进入旧仓库，发现暗号，同时意识到追踪者已经逼近。",
      styleSummary: "冷峻、克制、动作细节清晰。",
      characterStateSummary: "主角警惕但仍愿意冒险推进调查。",
      worldConstraintSummary: "旧城暗号是真实线索，不是幻觉或普通涂鸦。",
      macroContextSummary: "本章负责把主角卷入旧城秘密的第一层门槛。",
      resolvedIntentSummary: "让片段更自然，并加强悬疑压力。",
      constraintsText: "不改变暗号存在、门外有人逼近和主角正在调查这三个事实。",
    };
  }

  return {
    goal: "查看提示词预览",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
    chapterTitle: "示例章节",
    chapterMission: "让主角发现关键线索。",
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
        throw new Error("请选择提示词后再生成预览。");
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
          userGoal: "查看提示词预览",
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
