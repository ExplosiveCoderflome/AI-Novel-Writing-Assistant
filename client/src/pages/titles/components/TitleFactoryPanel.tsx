import i18next from "i18next";
import { useMemo, useState } from "react";
import type { TitleFactorySuggestion } from "@ai-novel/shared/types/title";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings2, Sparkles } from "lucide-react";
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
import SelectControl from "@/components/common/SelectControl";

interface TitleFactoryPanelProps {
  genreTree: GenreTreeNode[];
  novels: NovelListResponse["items"];
}

type FactoryMode = "novel" | "brief" | "adapt";

const MODE_COPY: Record<FactoryMode, { title: string; description: string }> = {
  novel: {
    title: i18next.t("dict.gen_c0b5a8ae"),
    description: i18next.t("dict.gen_5a1a30d0"),
  },
  brief: {
    title: i18next.t("dict.gen_5375d812"),
    description: i18next.t("dict.gen_697ece5c"),
  },
  adapt: {
    title: i18next.t("dict.gen_6907616c"),
    description: i18next.t("dict.gen_36c8377c"),
  },
};

const controlClassName = "w-full rounded-xl border-0 bg-background/85 px-3 py-2.5 text-sm outline-none shadow-sm ring-1 ring-border/45 transition hover:bg-background focus:bg-background focus:ring-2 focus:ring-primary/25";
const inputClassName = "h-10 rounded-xl border-0 bg-background/85 shadow-sm ring-1 ring-border/45 transition hover:bg-background focus-visible:ring-primary/25";
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
  const [showModelSettings, setShowModelSettings] = useState(false);

  const selectedNovel = useMemo(
    () => novels.find((item) => item.id === selectedNovelId) ?? null,
    [novels, selectedNovelId],
  );

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (mode === "novel") {
        if (!selectedNovelId) {
          throw new Error(i18next.t("dict.gen_bc7b49a8"));
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
      toast.success(i18next.t("novels.novelCreateTitleQuickFill.kt8gei", { val1: next.length }));
    },
  });

  const saveMutation = useMutation({
    mutationFn: (suggestion: TitleFactorySuggestion) => {
      const resolvedGenreId = mode === "novel" ? selectedNovel?.genre?.id ?? null : genreId || null;
      const description = mode === "novel"
        ? i18next.t("titles.titleFactoryPanel.2g89cm", { val1: selectedNovel?.title ?? "未命名项目" })
        : mode === "adapt"
          ? i18next.t("titles.titleFactoryPanel.9fytaw", { val1: referenceTitle.trim() })
          : brief.trim().slice(0, 400);
      const keywords = mode === "novel"
        ? selectedNovel?.title ?? null
        : mode === "adapt"
          ? i18next.t("titles.titleFactoryPanel.k8c1fq", { val1: referenceTitle.trim() })
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
      toast.success(i18next.t("dict.gen_fccedc6f"));
    },
  });

  const handleCopy = async (suggestion: TitleFactorySuggestion) => {
    await navigator.clipboard.writeText(suggestion.title);
    setSelectedTitle(suggestion.title);
    toast.success(i18next.t("dict.gen_3257008e"));
  };

  const handlePrimaryAction = async (suggestion: TitleFactorySuggestion) => {
    await handleCopy(suggestion);
  };

  const modeCopy = MODE_COPY[mode];

  return (
    <div className="space-y-6">
      <Tabs value={mode} onValueChange={(value) => setMode(value as FactoryMode)}>
        <section className="rounded-3xl bg-muted/[0.18] p-4 sm:p-6">
          <div className="mx-auto max-w-3xl">
            <TabsList className="grid h-11 w-full grid-cols-3 rounded-full bg-background/70 p-1 shadow-sm">
              <TabsTrigger value="novel" className="rounded-full">{i18next.t("dict.gen_c0b5a8ae")}</TabsTrigger>
              <TabsTrigger value="brief" className="rounded-full">{i18next.t("dict.gen_5375d812")}</TabsTrigger>
              <TabsTrigger value="adapt" className="rounded-full">{i18next.t("dict.gen_6907616c")}</TabsTrigger>
            </TabsList>
            <p className="mt-3 text-center text-sm leading-6 text-muted-foreground">{modeCopy.description}</p>
          </div>

          <div className="mx-auto mt-6 max-w-4xl">
            <TabsContent value="novel" className="mt-0 space-y-3">
              <div className="space-y-2">
                <label htmlFor="title-factory-novel" className="text-sm font-medium text-foreground">{i18next.t("titles.titleFactoryPanel.cvtpd2")}</label>
                <SelectControl
                  id="title-factory-novel"
                  className={controlClassName}
                  value={selectedNovelId}
                  onChange={(event) => setSelectedNovelId(event.target.value)}
                >
                  <option value="">{i18next.t("dict.gen_9fc2e26b")}</option>
                  {novels.map((novel) => (
                    <option key={novel.id} value={novel.id}>
                      {novel.title}
                    </option>
                  ))}
                </SelectControl>
              </div>
              <div className="text-xs leading-5 text-muted-foreground">{i18next.t("titles.titleFactoryPanel.hi5g5")}</div>
            </TabsContent>

            <TabsContent value="brief" className="mt-0 grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
              <div className="space-y-3">
                <label htmlFor="title-factory-brief" className="text-sm font-medium text-foreground">{i18next.t("titles.titleFactoryPanel.ap15l2")}</label>
                <textarea
                  id="title-factory-brief"
                  className={`${textareaClassName} min-h-[176px]`}
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                  placeholder={i18next.t("dict.gen_224614a8")}
                />
              </div>
              <div className="space-y-3">
                <label htmlFor="title-factory-genre" className="text-sm font-medium text-foreground">{i18next.t("titles.titleFactoryPanel.g2qjcd")}</label>
                <SelectControl
                  id="title-factory-genre"
                  className={controlClassName}
                  value={genreId}
                  onChange={(event) => setGenreId(event.target.value)}
                >
                  <option value="">{i18next.t("dict.unspecifiedType")}</option>
                  {genreOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.path}
                    </option>
                  ))}
                </SelectControl>
                <p className="text-xs leading-5 text-muted-foreground">{i18next.t("titles.titleFactoryPanel.yfukcj")}</p>
              </div>
            </TabsContent>

            <TabsContent value="adapt" className="mt-0 space-y-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
                <div className="space-y-3">
                  <label htmlFor="title-factory-reference" className="text-sm font-medium text-foreground">{i18next.t("novels.novelCreateTitleQuickFill.b3krzm")}</label>
                  <Input
                    id="title-factory-reference"
                    value={referenceTitle}
                    onChange={(event) => setReferenceTitle(event.target.value)}
                    placeholder={i18next.t("dict.exampleScavengePropertiesDust")}
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-3">
                  <label htmlFor="title-factory-adapt-genre" className="text-sm font-medium text-foreground">{i18next.t("titles.titleFactoryPanel.g2qjcd")}</label>
                  <SelectControl
                    id="title-factory-adapt-genre"
                    className={controlClassName}
                    value={genreId}
                    onChange={(event) => setGenreId(event.target.value)}
                  >
                    <option value="">{i18next.t("dict.unspecifiedType")}</option>
                    {genreOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.path}
                      </option>
                    ))}
                  </SelectControl>
                </div>
              </div>
              <div className="space-y-3">
                <label htmlFor="title-factory-adapt-brief" className="text-sm font-medium text-foreground">{i18next.t("titles.titleFactoryPanel.adcpu2")}</label>
                <textarea
                  id="title-factory-adapt-brief"
                  className={`${textareaClassName} min-h-[132px]`}
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                  placeholder={i18next.t("dict.gen_7bf3fd6a")}
                />
              </div>
            </TabsContent>
          </div>

          <div className="mx-auto mt-6 flex max-w-4xl flex-col gap-3 border-t border-border/40 pt-4 lg:flex-row lg:items-center lg:justify-between">
            <button
              type="button"
              className="inline-flex items-center gap-2 text-left text-xs text-muted-foreground transition hover:text-foreground"
              onClick={() => setShowModelSettings((value) => !value)}
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span>模型 {llm.provider} · {llm.model}</span>
            </button>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <label className="flex items-center gap-2 text-sm">
                <span className="font-medium text-foreground">{i18next.t("dict.gen_0bf60b32")}</span>
                <Input
                  type="number"
                  min={3}
                  max={24}
                  step={1}
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value) || 10)}
                  className={`${inputClassName} w-20`}
                />
              </label>
              <Button
                type="button"
                className="h-10 gap-2 rounded-full px-6"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
              >
                <Sparkles className="h-4 w-4" />
                {generateMutation.isPending ? "生成中..." : "生成标题"}
              </Button>
            </div>
          </div>

          {showModelSettings ? (
            <div className="mx-auto mt-4 max-w-4xl border-t border-border/40 pt-4">
              <LLMSelector showParameters showBadge={false} />
            </div>
          ) : null}
          {generateMutation.error ? (
            <div className="mx-auto mt-4 max-w-4xl rounded-xl bg-destructive/[0.055] px-4 py-3 text-sm text-destructive">
              {generateMutation.error instanceof Error ? generateMutation.error.message : i18next.t("titles.titleFactoryPanel.96ayfb")}
            </div>
          ) : null}
        </section>
      </Tabs>

      <section className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h3 className="text-base font-semibold text-foreground">{i18next.t("dict.gen_e995da4f")}</h3>
          <div className="text-xs text-muted-foreground">
            {suggestions.length > 0 ? i18next.t("titles.titleFactoryPanel.5u8wqo", { val1: suggestions.length }) : "结果会在生成后显示"}
          </div>
        </div>
        <TitleSuggestionList
          layout="grid"
          suggestions={suggestions}
          selectedTitle={selectedTitle}
          primaryActionLabel="复制标题"
          onPrimaryAction={handlePrimaryAction}
          onCopy={handleCopy}
          onSave={(suggestion) => saveMutation.mutate(suggestion)}
          savingTitle={saveMutation.isPending ? saveMutation.variables?.title ?? "" : ""}
          emptyMessage={i18next.t("titles.titleFactoryPanel.5awv6e", { val1: modeCopy.title })}
        />
      </section>
    </div>
  );
}
