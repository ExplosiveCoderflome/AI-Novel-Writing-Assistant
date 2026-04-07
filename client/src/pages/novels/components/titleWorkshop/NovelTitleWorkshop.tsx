import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TitleFactorySuggestion } from "@ai-novel/shared/types/title";
import { generateNovelTitles } from "@/api/novel";
import { createTitleLibraryEntry } from "@/api/title";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import LLMSelector from "@/components/common/LLMSelector";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
import TitleSuggestionList from "@/pages/titles/components/TitleSuggestionList";

interface NovelTitleWorkshopProps {
  novelId: string;
  currentTitle: string;
  currentDescription?: string;
  genreId?: string;
  onApplyTitle: (title: string) => void;
}
const DEFAULT_NOVEL_TITLE_COUNT = 12;

export default function NovelTitleWorkshop({
  novelId,
  currentTitle,
  currentDescription,
  genreId,
  onApplyTitle,
}: NovelTitleWorkshopProps) {
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const [selectedTitle, setSelectedTitle] = useState(currentTitle);
  const [suggestions, setSuggestions] = useState<TitleFactorySuggestion[]>([]);

  const generateMutation = useMutation({
    mutationFn: () => generateNovelTitles(novelId, {
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
      count: DEFAULT_NOVEL_TITLE_COUNT,
      maxTokens: llm.maxTokens,
    }),
    onSuccess: (response) => {
      const next = [...(response.data?.titles ?? [])].sort((left, right) => right.clickRate - left.clickRate);
      setSuggestions(next);
      setSelectedTitle(next[0]?.title ?? currentTitle);
      toast.success(`已生成 ${next.length} 个标题候选。`);
    },
  });

  const saveMutation = useMutation({
    mutationFn: (suggestion: TitleFactorySuggestion) => createTitleLibraryEntry({
      title: suggestion.title,
      description: currentDescription?.trim().slice(0, 400) || null,
      clickRate: suggestion.clickRate,
      keywords: currentTitle?.trim().slice(0, 160) || null,
      genreId: genreId || null,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.titles.all });
      toast.success("标题已加入标题库。");
    },
  });

  const saveCurrentMutation = useMutation({
    mutationFn: () => createTitleLibraryEntry({
      title: currentTitle,
      description: currentDescription?.trim().slice(0, 400) || null,
      keywords: currentTitle.trim().slice(0, 160),
      genreId: genreId || null,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.titles.all });
      toast.success("当前标题已加入标题库。");
    },
  });

  const handleCopy = async (suggestion: TitleFactorySuggestion) => {
    await navigator.clipboard.writeText(suggestion.title);
    setSelectedTitle(suggestion.title);
    toast.success("标题已复制到剪贴板。");
  };

  const handleApply = (suggestion: TitleFactorySuggestion) => {
    setSelectedTitle(suggestion.title);
    onApplyTitle(suggestion.title);
    toast.success("标题已写入基本信息表单，记得保存。");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/20 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-foreground">项目内标题工坊</div>
            <div className="text-sm leading-6 text-muted-foreground">
              基于当前已保存的小说简介和类型生成候选。如果刚修改过简介或类型，建议先保存基本信息再生成。
            </div>
          </div>
          <Button type="button" variant="outline" disabled={!currentTitle.trim() || saveCurrentMutation.isPending} onClick={() => saveCurrentMutation.mutate()}>
            {saveCurrentMutation.isPending ? "保存中..." : "保存当前标题"}
          </Button>
        </div>
          <div className="mt-4 space-y-3">
            <LLMSelector />
            <div className="flex justify-end">
              <AiButton type="button" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
                {generateMutation.isPending ? "生成中..." : "生成标题候选"}
              </AiButton>
            </div>
          </div>
      </div>

      <TitleSuggestionList
        suggestions={suggestions}
        selectedTitle={selectedTitle}
        primaryActionLabel="应用到项目"
        onPrimaryAction={handleApply}
        onCopy={handleCopy}
        onSave={(suggestion) => saveMutation.mutate(suggestion)}
        savingTitle={saveMutation.isPending ? saveMutation.variables?.title ?? "" : ""}
        emptyMessage="点一次生成，就能得到一批基于当前项目设定的标题候选。"
      />
    </div>
  );
}
