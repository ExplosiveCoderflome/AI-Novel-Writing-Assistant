import { useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  previewPrompt,
  type PromptCatalogItem,
  type PromptPreviewPayload,
} from "@/api/promptWorkbench";
import type { PromptSlotDrafts } from "../promptWorkbenchTypes";

function buildPreviewPromptInput(prompt: PromptCatalogItem): Record<string, unknown> {
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
