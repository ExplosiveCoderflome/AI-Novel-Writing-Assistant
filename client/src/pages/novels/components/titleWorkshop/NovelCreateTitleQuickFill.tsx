import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TitleFactorySuggestion, TitleLibraryEntry } from "@ai-novel/shared/types/title";
import {
  AI_FREEDOM_OPTIONS,
  EMOTION_OPTIONS,
  PACE_OPTIONS,
  POV_OPTIONS,
  WRITING_MODE_OPTIONS,
  type NovelBasicFormState,
} from "../../novelBasicInfo.shared";
import {
  buildTitleLibraryListKey,
  createTitleLibraryEntry,
  generateTitleIdeas,
  listTitleLibrary,
} from "@/api/title";
import { queryKeys } from "@/api/queryKeys";
import AiButton from "@/components/common/AiButton";
import LLMSelector from "@/components/common/LLMSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
import TitleSuggestionList from "@/pages/titles/components/TitleSuggestionList";
import { getClickRateBadgeClass, truncateText } from "@/pages/titles/titleStudio.shared";

interface NovelCreateTitleQuickFillProps {
  basicForm: NovelBasicFormState;
  onApplyTitle: (title: string) => void;
}

const DEFAULT_TITLE_COUNT = 8;
const TITLE_LIBRARY_PAGE_SIZE = 8;

function sortSuggestions(items: TitleFactorySuggestion[]): TitleFactorySuggestion[] {
  return [...items].sort((left, right) => right.clickRate - left.clickRate);
}

function resolveOptionLabel<T extends string>(
  options: Array<{ value: T; label: string }>,
  value: T,
): string | null {
  return options.find((item) => item.value === value)?.label ?? null;
}

function buildGenerationBrief(basicForm: NovelBasicFormState): string {
  const lines = [
    basicForm.description.trim() ? `作品概述：${basicForm.description.trim()}` : "",
    basicForm.title.trim() ? `当前草拟标题：${basicForm.title.trim()}` : "",
    `创作模式：${resolveOptionLabel(WRITING_MODE_OPTIONS, basicForm.writingMode) ?? basicForm.writingMode}`,
    `叙事视角：${resolveOptionLabel(POV_OPTIONS, basicForm.narrativePov) ?? basicForm.narrativePov}`,
    `节奏偏好：${resolveOptionLabel(PACE_OPTIONS, basicForm.pacePreference) ?? basicForm.pacePreference}`,
    `情绪浓度：${resolveOptionLabel(EMOTION_OPTIONS, basicForm.emotionIntensity) ?? basicForm.emotionIntensity}`,
    `AI 自由度：${resolveOptionLabel(AI_FREEDOM_OPTIONS, basicForm.aiFreedom) ?? basicForm.aiFreedom}`,
    basicForm.styleTone.trim() ? `文风关键词：${basicForm.styleTone.trim()}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function renderLibraryDescription(entry: TitleLibraryEntry): string {
  if (entry.description?.trim()) {
    return truncateText(entry.description, 100);
  }
  if (entry.keywords?.trim()) {
    return `关键词：${truncateText(entry.keywords, 80)}`;
  }
  return "标题库候选，可直接写入当前创建表单。";
}

function joinKeywords(...values: Array<string | null | undefined>): string | null {
  const next = values
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" / ")
    .slice(0, 160);
  return next || null;
}

export default function NovelCreateTitleQuickFill({
  basicForm,
  onApplyTitle,
}: NovelCreateTitleQuickFillProps) {
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"generate" | "library">("generate");
  const [count, setCount] = useState(DEFAULT_TITLE_COUNT);
  const [search, setSearch] = useState("");
  const [manualBrief, setManualBrief] = useState("");
  const [referenceTitle, setReferenceTitle] = useState("");
  const [suggestions, setSuggestions] = useState<TitleFactorySuggestion[]>([]);

  const autoBrief = useMemo(() => buildGenerationBrief(basicForm), [basicForm]);
  const resolvedBrief = useMemo(
    () => [autoBrief, manualBrief.trim() ? `额外补充：${manualBrief.trim()}` : ""].filter(Boolean).join("\n"),
    [autoBrief, manualBrief],
  );
  const generationMode = referenceTitle.trim() ? "adapt" : "brief";
  const hasGenerationContext = Boolean(resolvedBrief.trim() || referenceTitle.trim());

  const titleLibraryParams = useMemo(
    () => ({
      page: 1,
      pageSize: TITLE_LIBRARY_PAGE_SIZE,
      search: search.trim() || undefined,
      genreId: basicForm.genreId || undefined,
      sort: "clickRate" as const,
    }),
    [basicForm.genreId, search],
  );
  const titleLibraryParamsKey = useMemo(
    () => buildTitleLibraryListKey(titleLibraryParams),
    [titleLibraryParams],
  );

  const libraryQuery = useQuery({
    queryKey: queryKeys.titles.list(titleLibraryParamsKey),
    queryFn: () => listTitleLibrary(titleLibraryParams),
    staleTime: 60 * 1000,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!hasGenerationContext) {
        throw new Error("请先填写一句标题简报，或补一个参考标题后再生成。");
      }
      const response = await generateTitleIdeas({
        mode: generationMode,
        brief: resolvedBrief || undefined,
        referenceTitle: referenceTitle.trim() || undefined,
        genreId: basicForm.genreId || null,
        count: Math.min(24, Math.max(3, Math.floor(count) || DEFAULT_TITLE_COUNT)),
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
      toast.success(`已生成 ${next.length} 个标题候选。`);
    },
  });

  const saveMutation = useMutation({
    mutationFn: (suggestion: TitleFactorySuggestion) => createTitleLibraryEntry({
      title: suggestion.title,
      description: basicForm.description.trim().slice(0, 400) || manualBrief.trim().slice(0, 400) || null,
      clickRate: suggestion.clickRate,
      keywords: joinKeywords(basicForm.title, referenceTitle, basicForm.styleTone),
      genreId: basicForm.genreId || null,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.titles.all });
      toast.success("标题已加入标题库。");
    },
  });

  const handleApplyTitle = (title: string, source: "generated" | "library") => {
    onApplyTitle(title);
    setOpen(false);
    toast.success(source === "generated" ? "标题候选已写入创建表单。" : "标题库标题已写入创建表单。");
  };

  const handleCopySuggestion = async (suggestion: TitleFactorySuggestion) => {
    await navigator.clipboard.writeText(suggestion.title);
    toast.success("标题已复制到剪贴板。");
  };

  return (
    <>
      <div className="flex items-center justify-end">
        <AiButton type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          标题快速选填
        </AiButton>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>标题快速选填</DialogTitle>
            <DialogDescription>
              不做绑定关系，只是帮你更快把标题写进创建表单。可以直接生成候选，也可以从标题库挑一个回填。
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={mode}
            onValueChange={(value) => setMode(value as "generate" | "library")}
            className="space-y-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="generate">快速生成</TabsTrigger>
              <TabsTrigger value="library">标题库选择</TabsTrigger>
            </TabsList>

            <TabsContent value="generate" className="space-y-4">
              <div className="rounded-lg border bg-background/80 p-3">
                <div className="text-xs leading-6 text-muted-foreground">
                  会优先读取当前创建页里已经填写的简介、题材、文风、节奏和叙事视角。你也可以在下面临时补充一句简报，不用先回到表单里填写。
                </div>
                <div className="mt-3">
                  <LLMSelector />
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="space-y-2">
                    <label
                      htmlFor="novel-create-title-quick-brief"
                      className="text-sm font-medium text-foreground"
                    >
                      补充标题简报
                    </label>
                    <textarea
                      id="novel-create-title-quick-brief"
                      className="min-h-[132px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      value={manualBrief}
                      onChange={(event) => setManualBrief(event.target.value)}
                      placeholder="例如：末世废土里，一个被流放的维修师意外掌握古代机甲核心，想要标题更有硬核设定感和命运感。"
                    />
                    <div className="text-xs leading-6 text-muted-foreground">
                      这里只影响这一次生成，不会自动回写到小说创建表单。
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label
                        htmlFor="novel-create-title-reference"
                        className="text-sm font-medium text-foreground"
                      >
                        参考标题
                      </label>
                      <Input
                        id="novel-create-title-reference"
                        value={referenceTitle}
                        onChange={(event) => setReferenceTitle(event.target.value)}
                        placeholder="可选，填了会按参考改编式生成"
                      />
                    </div>
                    <div className="rounded-md border bg-muted/20 p-3 text-xs leading-6 text-muted-foreground">
                      {referenceTitle.trim()
                        ? "当前会参考你输入的标题节奏和命名结构，再结合这本小说的信息重新产出候选。"
                        : "留空时会按简报直接生成。如果你心里已经有一个风格方向，可以在这里填参考标题。"}
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-md border bg-muted/20 p-3">
                  <div className="text-xs font-medium text-foreground">当前已自动读取的创建页信息</div>
                  <div className="mt-2 whitespace-pre-wrap text-xs leading-6 text-muted-foreground">
                    {autoBrief || "创建页里暂时还没有足够的信息。你可以直接在上面的“补充标题简报”里写一句题材、卖点或冲突再生成。"}
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">生成数量</span>
                    <Input
                      type="number"
                      min={3}
                      max={24}
                      step={1}
                      value={count}
                      onChange={(event) => setCount(Number(event.target.value) || DEFAULT_TITLE_COUNT)}
                      className="w-[120px]"
                    />
                  </label>
                  <AiButton
                    type="button"
                    onClick={() => generateMutation.mutate()}
                    disabled={generateMutation.isPending || !hasGenerationContext}
                  >
                    {generateMutation.isPending ? "生成中..." : "生成标题候选"}
                  </AiButton>
                </div>

                {!hasGenerationContext ? (
                  <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
                    至少先补一句标题简报，或填写一个参考标题；如果创建页里已经有简介、类型或文风，也会自动参与生成。
                  </div>
                ) : null}
              </div>

              <TitleSuggestionList
                suggestions={suggestions}
                selectedTitle={basicForm.title}
                primaryActionLabel="填入标题"
                onPrimaryAction={(suggestion) => handleApplyTitle(suggestion.title, "generated")}
                onCopy={handleCopySuggestion}
                onSave={(suggestion) => saveMutation.mutate(suggestion)}
                savingTitle={saveMutation.isPending ? saveMutation.variables?.title ?? "" : ""}
                emptyMessage="可以直接在上面的补充标题简报里写一句题材或卖点，再点一次生成，结果会直接作为创建页的标题候选。"
              />
            </TabsContent>

            <TabsContent value="library" className="space-y-4">
              <div className="flex flex-col gap-3 rounded-lg border bg-background/80 p-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-foreground">从标题库快速选用</div>
                  <div className="text-xs leading-6 text-muted-foreground">
                    默认按点击率排序
                    {basicForm.genreId ? "，并按当前题材基底过滤" : ""}
                    。
                  </div>
                </div>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索标题关键词"
                  className="md:max-w-xs"
                />
              </div>

              {libraryQuery.isLoading ? (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  标题库加载中...
                </div>
              ) : (libraryQuery.data?.data?.items ?? []).length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  当前条件下还没有可用标题。可以切到“快速生成”先产出一批候选。
                </div>
              ) : (
                <div className="grid gap-3">
                  {(libraryQuery.data?.data?.items ?? []).map((entry) => {
                    const isSelected = basicForm.title.trim() === entry.title.trim();
                    return (
                      <div
                        key={entry.id}
                        className={`rounded-xl border p-4 transition ${
                          isSelected ? "border-primary/50 bg-primary/5" : "border-border/70 bg-background"
                        }`}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {typeof entry.clickRate === "number" ? (
                                <Badge className={getClickRateBadgeClass(entry.clickRate)}>
                                  预估 {entry.clickRate}
                                </Badge>
                              ) : null}
                              {typeof entry.usedCount === "number" ? (
                                <Badge variant="secondary">已用 {entry.usedCount}</Badge>
                              ) : null}
                              {entry.genre?.name ? <Badge variant="outline">{entry.genre.name}</Badge> : null}
                              {isSelected ? <Badge variant="outline">当前选中</Badge> : null}
                            </div>
                            <div className="text-lg font-semibold text-foreground">{entry.title}</div>
                            <div className="text-sm leading-6 text-muted-foreground">
                              {renderLibraryDescription(entry)}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Button type="button" size="sm" onClick={() => handleApplyTitle(entry.title, "library")}>
                              填入标题
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
