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
    title: "Generate by novel",
    description: "Read the saved novel project data and directly generate title candidates that are closer to the current work.",
  },
  brief: {
    title: "free workshop",
    description: "Just write one sentence about the theme, the protagonist’s selling point or the core conflict, and quickly try out a batch of titles in different directions.",
  },
  adapt: {
    title: "Reference adaptation",
    description: "Refer to the rhythm and naming structure of a title, and then regenerate it based on your work information.",
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
          throw new Error("Please select a fiction project first.");
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
        ? `来源项目：${selectedNovel?.title ?? "Unnamed project"}`
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
      toast.success("The title has been added to the title library.");
    },
  });

  const handleCopy = async (suggestion: TitleFactorySuggestion) => {
    await navigator.clipboard.writeText(suggestion.title);
    setSelectedTitle(suggestion.title);
    toast.success("Title copied to clipboard.");
  };

  const handlePrimaryAction = async (suggestion: TitleFactorySuggestion) => {
    await handleCopy(suggestion);
  };

  const modeCopy = MODE_COPY[mode];

  return (
    <div className="space-y-6">
      <Tabs value={mode} onValueChange={(value) => setMode(value as FactoryMode)}>
        <section className="rounded-2xl bg-muted/[0.18] p-4 shadow-[0_18px_52px_rgba(15,23,42,0.07)] sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-normal text-foreground">{modeCopy.title}</h2>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{modeCopy.description}</p>
            </div>

            <TabsList className="grid h-10 w-full grid-cols-3 bg-background/70 p-1 shadow-sm lg:w-[420px]">
              <TabsTrigger value="novel">Generate by novel</TabsTrigger>
              <TabsTrigger value="brief">free workshop</TabsTrigger>
              <TabsTrigger value="adapt">Reference adaptation</TabsTrigger>
            </TabsList>
          </div>

          <div className="mt-6">
            <TabsContent value="novel" className="mt-0 space-y-3">
              <div className="grid gap-3 md:grid-cols-[132px_minmax(0,1fr)] md:items-center">
                <label htmlFor="title-factory-novel" className="text-sm font-medium text-foreground">
                  Select a novel project
                                                  </label>
                <SelectControl
                  id="title-factory-novel"
                  className={controlClassName}
                  value={selectedNovelId}
                  onChange={(event) => setSelectedNovelId(event.target.value)}
                >
                  <option value="">Please select an item</option>
                  {novels.map((novel) => (
                    <option key={novel.id} value={novel.id}>
                      {novel.title}
                    </option>
                  ))}
                </SelectControl>
              </div>
              <div className="pl-0 text-xs leading-5 text-muted-foreground md:pl-[132px]">
                Suitable for works that have filled in the introduction and type, the system will generate candidate titles based on the project information.
                                            </div>
            </TabsContent>

            <TabsContent value="brief" className="mt-0 grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
              <div className="space-y-3">
                <label htmlFor="title-factory-brief" className="text-sm font-medium text-foreground">
                  Create a brief
                                                  </label>
                <textarea
                  id="title-factory-brief"
                  className={`${textareaClassName} min-h-[176px]`}
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                  placeholder="Describe the subject matter, protagonist’s selling point, conflict, writing style, and reader expectations. The more specific the title, the more distinguishing it will be."
                />
              </div>
              <div className="space-y-3">
                <label htmlFor="title-factory-genre" className="text-sm font-medium text-foreground">
                  Type filtering
                                                  </label>
                <SelectControl
                  id="title-factory-genre"
                  className={controlClassName}
                  value={genreId}
                  onChange={(event) => setGenreId(event.target.value)}
                >
                  <option value="">No type specified</option>
                  {genreOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.path}
                    </option>
                  ))}
                </SelectControl>
                <p className="text-xs leading-5 text-muted-foreground">
                  If you are not sure about the type, you can leave it blank and let the model determine the title direction based on the briefing first.
                                                  </p>
              </div>
            </TabsContent>

            <TabsContent value="adapt" className="mt-0 space-y-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
                <div className="space-y-3">
                  <label htmlFor="title-factory-reference" className="text-sm font-medium text-foreground">
                    Reference title
                                                        </label>
                  <Input
                    id="title-factory-reference"
                    value={referenceTitle}
                    onChange={(event) => setReferenceTitle(event.target.value)}
                    placeholder="For example: I am picking up attributes in the wasteland"
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-3">
                  <label htmlFor="title-factory-adapt-genre" className="text-sm font-medium text-foreground">
                    Type filtering
                                                        </label>
                  <SelectControl
                    id="title-factory-adapt-genre"
                    className={controlClassName}
                    value={genreId}
                    onChange={(event) => setGenreId(event.target.value)}
                  >
                    <option value="">No type specified</option>
                    {genreOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.path}
                      </option>
                    ))}
                  </SelectControl>
                </div>
              </div>
              <div className="space-y-3">
                <label htmlFor="title-factory-adapt-brief" className="text-sm font-medium text-foreground">
                  Work Brief
                                                  </label>
                <textarea
                  id="title-factory-adapt-brief"
                  className={`${textareaClassName} min-h-[132px]`}
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                  placeholder="Explain the subject matter, characters and selling points of your work. The system will refer to the title rhythm, but will not copy it directly."
                />
              </div>
            </TabsContent>
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-border/55 pt-4 lg:flex-row lg:items-center lg:justify-between">
            <button
              type="button"
              className="inline-flex items-center gap-2 text-left text-xs text-muted-foreground transition hover:text-foreground"
              onClick={() => setShowModelSettings((value) => !value)}
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span>Model {llm.provider} · {llm.model}</span>
            </button>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <label className="flex items-center gap-2 text-sm">
                <span className="font-medium text-foreground">quantity</span>
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
                className="h-10 gap-2 px-5"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
              >
                <Sparkles className="h-4 w-4" />
                {generateMutation.isPending ? "Generating..." : "generate title"}
              </Button>
            </div>
          </div>

          {showModelSettings ? (
            <div className="mt-4 border-t border-border/55 pt-4">
              <LLMSelector showParameters showBadge={false} />
            </div>
          ) : null}
        </section>
      </Tabs>

      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <h3 className="text-base font-semibold text-foreground">Candidate results</h3>
          <div className="text-xs text-muted-foreground">
            {suggestions.length > 0 ? `已按点击潜力排序，共 ${suggestions.length} 个` : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}
          </div>
        </div>
        <TitleSuggestionList
          suggestions={suggestions}
          selectedTitle={selectedTitle}
          primaryActionLabel="Copy title"
          onPrimaryAction={handlePrimaryAction}
          onCopy={handleCopy}
          onSave={(suggestion) => saveMutation.mutate(suggestion)}
          savingTitle={saveMutation.isPending ? saveMutation.variables?.title ?? "" : ""}
          emptyMessage="Start generating after selecting a workshop mode, and the results will appear here."
        />
      </section>
    </div>
  );
}
