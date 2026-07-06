import { useMemo, useState } from "react";
import type { TitleFactorySuggestion } from "@ai-novel/shared/types/title";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { flattenGenreTreeOptions, type GenreTreeNode } from "@/api/genre";
import { generateNovelTitles, type NovelListResponse } from "@/api/novel";
import { createTitleLibraryEntry } from "@/api/title";
import { queryKeys } from "@/api/queryKeys";
import { generateTitleIdeas } from "@/api/title";
import LLMSelector from "@/components/common/LLMSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
import TitleSuggestionList from "./TitleSuggestionList";

interface TitleFactoryPanelProps {
  genreTree: GenreTreeNode[];
  novels: NovelListResponse["items"];
}

type FactoryMode = "novel" | "brief" | "adapt";

const MODE_COPY: Record<FactoryMode, { title: string; description: string }> = {
  novel: {
    title: "按小说生成",
    description: "读取已保存的小说项目资料，直接产出更贴近当前作品的标题候选。",
  },
  brief: {
    title: "自由工坊",
    description: "只写一句题材、主角卖点或核心冲突，快速试一批不同方向的标题。",
  },
  adapt: {
    title: "参考改编",
    description: "参考一个标题的节奏和命名结构，再结合你的作品信息重新生成。",
  },
};

const controlClassName = "w-full rounded-lg border-0 bg-muted/35 px-3 py-2.5 text-sm outline-none ring-1 ring-transparent transition hover:bg-muted/50 focus:bg-background focus:ring-2 focus:ring-primary/25";
const inputClassName = "h-11 rounded-lg border-0 bg-muted/35 ring-1 ring-transparent transition hover:bg-muted/50 focus-visible:ring-primary/25";
const textareaClassName = `${controlClassName} resize-y leading-6`;

function sortSuggestions<T extends { clickRate: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => right.clickRate - left.clickRate);
}

export default function TitleFactoryPanel({ genreTree, novels }: TitleFactoryPanelProps) {
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const genreOptions = useMemo(() => flattenGenreTreeOptions(genreTree), [genreTree]);
  const [mode, setMode] = useState<FactoryMode>("novel");
  const [selectedNovelId, setSelectedNovelId] = useState("");
  const [brief, setBrief] = useState("");
  const [referenceTitle, setReferenceTitle] = useState("");
  const [genreId, setGenreId] = useState("");
  const [count, setCount] = useState(10);
  const [selectedTitle, setSelectedTitle] = useState("");
  const [suggestions, setSuggestions] = useState<TitleFactorySuggestion[]>([]);

  const selectedNovel = useMemo(
    () => novels.find((item) => item.id === selectedNovelId) ?? null,
    [novels, selectedNovelId],
  );

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (mode === "novel") {
        if (!selectedNovelId) {
          throw new Error("请先选择一个小说项目。");
        }
        const response = await generateNovelTitles(selectedNovelId, {
          provider: llm.provider,
          model: llm.model,
          temperature: llm.temperature,
          count,
          maxTokens: llm.maxTokens,
        });
        return response.data?.titles ?? [];
      }

      const response = await generateTitleIdeas({
        mode,
        brief,
        referenceTitle,
        genreId: genreId || null,
        count,
        provider: llm.provider,
        model: llm.model,
        temperature: llm.temperature,
        maxTokens: llm.maxTokens,
      });
      return response.data?.titles ?? [];
    },
    onSuccess: (rows) => {
      const next = sortSuggestions(rows);
      setSuggestions(next);
      setSelectedTitle(next[0]?.title ?? "");
      toast.success(`已生成 ${next.length} 个标题候选。`);
    },
  });

  const saveMutation = useMutation({
    mutationFn: (suggestion: TitleFactorySuggestion) => {
      const resolvedGenreId = mode === "novel" ? selectedNovel?.genre?.id ?? null : genreId || null;
      const description = mode === "novel"
        ? `来源项目：${selectedNovel?.title ?? "未命名项目"}`
        : mode === "adapt"
          ? `参考标题：${referenceTitle.trim()}`
          : brief.trim().slice(0, 400);
      const keywords = mode === "novel"
        ? selectedNovel?.title ?? null
        : mode === "adapt"
          ? `改编灵感 / ${referenceTitle.trim()}`
          : brief.trim().slice(0, 160);
      return createTitleLibraryEntry({
        title: suggestion.title,
        clickRate: suggestion.clickRate,
        description: description || null,
        keywords,
        genreId: resolvedGenreId,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.titles.all });
      toast.success("标题已加入标题库。");
    },
  });

  const handleCopy = async (suggestion: TitleFactorySuggestion) => {
    await navigator.clipboard.writeText(suggestion.title);
    setSelectedTitle(suggestion.title);
    toast.success("标题已复制到剪贴板。");
  };

  const handlePrimaryAction = async (suggestion: TitleFactorySuggestion) => {
    await handleCopy(suggestion);
  };

  const modeCopy = MODE_COPY[mode];

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-5 border-b border-border/60 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-normal text-foreground">{modeCopy.title}</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{modeCopy.description}</p>
        </div>

        <div className="min-w-0 lg:w-[520px]">
          <div className="mb-2 text-xs font-medium text-muted-foreground">本次生成模型</div>
          <LLMSelector showParameters showBadge={false} showHelperText={false} />
        </div>
      </div>

      <Tabs value={mode} onValueChange={(value) => setMode(value as FactoryMode)} className="space-y-5">
        <TabsList className="grid h-10 w-full grid-cols-3 bg-muted/35 p-1 md:max-w-xl">
          <TabsTrigger value="novel">按小说生成</TabsTrigger>
          <TabsTrigger value="brief">自由工坊</TabsTrigger>
          <TabsTrigger value="adapt">参考改编</TabsTrigger>
        </TabsList>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
          <div className="min-w-0">
            <TabsContent value="novel" className="mt-0 space-y-3">
              <label htmlFor="title-factory-novel" className="text-sm font-medium text-foreground">
                选择小说项目
              </label>
              <select
                id="title-factory-novel"
                className={controlClassName}
                value={selectedNovelId}
                onChange={(event) => setSelectedNovelId(event.target.value)}
              >
                <option value="">请选择项目</option>
                {novels.map((novel) => (
                  <option key={novel.id} value={novel.id}>
                    {novel.title}
                  </option>
                ))}
              </select>
              <div className="text-xs leading-5 text-muted-foreground">
                适合已填写简介和类型的作品，系统会结合项目资料生成候选标题。
              </div>
            </TabsContent>

            <TabsContent value="brief" className="mt-0 grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
              <div className="space-y-3">
                <label htmlFor="title-factory-brief" className="text-sm font-medium text-foreground">
                  创作简报
                </label>
                <textarea
                  id="title-factory-brief"
                  className={`${textareaClassName} min-h-[168px]`}
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                  placeholder="描述题材、主角卖点、冲突、文风和读者期待。越具体，标题越有区分度。"
                />
              </div>
              <div className="space-y-3">
                <label htmlFor="title-factory-genre" className="text-sm font-medium text-foreground">
                  类型过滤
                </label>
                <select
                  id="title-factory-genre"
                  className={controlClassName}
                  value={genreId}
                  onChange={(event) => setGenreId(event.target.value)}
                >
                  <option value="">不指定类型</option>
                  {genreOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.path}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-5 text-muted-foreground">
                  不确定类型时可以留空，让模型先按简报自行判断标题方向。
                </p>
              </div>
            </TabsContent>

            <TabsContent value="adapt" className="mt-0 grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
              <div className="space-y-4">
                <div className="space-y-3">
                  <label htmlFor="title-factory-reference" className="text-sm font-medium text-foreground">
                    参考标题
                  </label>
                  <Input
                    id="title-factory-reference"
                    value={referenceTitle}
                    onChange={(event) => setReferenceTitle(event.target.value)}
                    placeholder="例如：我在废土捡属性"
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-3">
                  <label htmlFor="title-factory-adapt-brief" className="text-sm font-medium text-foreground">
                    当前作品简报
                  </label>
                  <textarea
                    id="title-factory-adapt-brief"
                    className={`${textareaClassName} min-h-[132px]`}
                    value={brief}
                    onChange={(event) => setBrief(event.target.value)}
                    placeholder="说明你的作品题材、人物与卖点。系统会参考标题节奏，但不会直接照抄。"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <label htmlFor="title-factory-adapt-genre" className="text-sm font-medium text-foreground">
                  类型过滤
                </label>
                <select
                  id="title-factory-adapt-genre"
                  className={controlClassName}
                  value={genreId}
                  onChange={(event) => setGenreId(event.target.value)}
                >
                  <option value="">不指定类型</option>
                  {genreOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.path}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-5 text-muted-foreground">
                  参考标题只提供节奏，不会把原标题作为最终候选直接复写。
                </p>
              </div>
            </TabsContent>
          </div>

          <div className="space-y-3 border-t border-border/60 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <label className="space-y-2 text-sm">
              <span className="font-medium text-foreground">生成数量</span>
              <Input
                type="number"
                min={3}
                max={24}
                step={1}
                value={count}
                onChange={(event) => setCount(Number(event.target.value) || 10)}
                className={`${inputClassName} w-28`}
              />
            </label>
            <Button
              type="button"
              className="w-full gap-2"
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
            >
              <Sparkles className="h-4 w-4" />
              {generateMutation.isPending ? "生成中..." : "生成标题"}
            </Button>
            <p className="text-xs leading-5 text-muted-foreground">
              生成后可以复制标题，或把值得复用的候选加入标题库。
            </p>
          </div>
        </div>
      </Tabs>

      <section className="space-y-3 border-t border-border/60 pt-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h3 className="text-base font-semibold text-foreground">候选结果</h3>
          <div className="text-xs text-muted-foreground">
            {suggestions.length > 0 ? `已按点击潜力排序，共 ${suggestions.length} 个` : "结果会在生成后显示"}
          </div>
        </div>
        <TitleSuggestionList
          suggestions={suggestions}
          selectedTitle={selectedTitle}
          primaryActionLabel="复制标题"
          onPrimaryAction={handlePrimaryAction}
          onCopy={handleCopy}
          onSave={(suggestion) => saveMutation.mutate(suggestion)}
          savingTitle={saveMutation.isPending ? saveMutation.variables?.title ?? "" : ""}
          emptyMessage="选择一种工坊模式后开始生成，结果会在这里出现。"
        />
      </section>
    </div>
  );
}
