import { useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  previewPrompt,
  type PromptCatalogItem,
  type PromptPreviewPayload,
} from "@/api/promptWorkbench";
import type { PromptSlotDrafts } from "../promptWorkbenchTypes";

function buildPreviewPromptInput(prompt: PromptCatalogItem): Record<string, unknown> {
  if (prompt.id === "audit.chapter.light" || prompt.id === "audit.chapter.full") {
    return {
      novelTitle: "示例小说",
      chapterTitle: "示例章节",
      requestedTypes: ["plot", "character", "continuity"],
      storyModeContext: "本书偏连载网文节奏，章节需要持续推进冲突并保留章末钩子。",
      content: "主角走进旧仓库，发现墙上残留着上一任调查员留下的暗号。门外脚步声逼近，他必须在暴露前判断暗号指向哪里。",
      ragContext: "无额外检索补充。",
    };
  }

  if (prompt.id === "novel.chapter.writer") {
    return {
      novelTitle: "示例小说",
      chapterOrder: 1,
      chapterTitle: "示例章节",
      mode: "draft",
      targetWordCount: 3000,
      minWordCount: 2600,
      maxWordCount: 3400,
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
  slotOverrides: PromptSlotDrafts;
}

export function usePromptPreview(input: UsePromptPreviewInput) {
  const { chapterId = "chapter-1", entrypoint, novelId, prompt, slotOverrides } = input;

  const previewMutation = useMutation({
    mutationFn: () => {
      if (!prompt) {
        throw new Error("请选择提示词后再生成预览。");
      }
      const executionNovelId = novelId || "novel-1";
      const payload: PromptPreviewPayload = {
        promptKey: prompt.key,
        promptInput: buildPreviewPromptInput(prompt),
        executionContext: {
          entrypoint,
          novelId: executionNovelId,
          chapterId,
          userGoal: "查看提示词预览",
          resourceBindings: {
            novelId: executionNovelId,
            chapterId,
          },
        },
        maxContextTokens: prompt.contextPolicy.maxTokensBudget,
        slotOverrides,
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
