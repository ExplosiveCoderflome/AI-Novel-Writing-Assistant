import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  WorldOptionRefinementLevel,
  WorldPropertyOption,
} from "@ai-novel/shared/types/worldWizard";
import { flattenGenreTreeOptions, getGenreTree } from "@/api/genre";
import {
  mapWorldLibraryCategoryToLayer,
  serializeWorldGenerationBlueprint,
} from "@ai-novel/shared/types/worldWizard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import LLMSelector from "@/components/common/LLMSelector";
import KnowledgeDocumentPicker from "@/components/knowledge/KnowledgeDocumentPicker";
import {
  analyzeWorldInspiration,
  createWorld,
  getWorldTemplates,
  suggestWorldAxioms,
  updateWorldAxioms,
} from "@/api/world";
import { queryKeys } from "@/api/queryKeys";
import { useLLMStore } from "@/store/llmStore";
import WorldLibraryQuickPick from "./components/generator/WorldLibraryQuickPick";
import WorldPropertyOptionSelector from "./components/generator/WorldPropertyOptionSelector";

type InspirationMode = "free" | "reference" | "random";

interface ConceptCard {
  worldType: string;
  templateKey: string;
  coreImagery: string[];
  tone: string;
  keywords: string[];
  summary: string;
}

const DEFAULT_DIMENSIONS: Record<string, boolean> = {
  foundation: true,
  power: true,
  society: true,
  culture: true,
  history: true,
  conflict: true,
};

const DIMENSION_LABELS: Record<string, string> = {
  foundation: "基础层",
  power: "力量层",
  society: "社会层",
  culture: "文化层",
  history: "历史层",
  conflict: "冲突层",
};

function getDimensionLabel(key: string): string {
  return DIMENSION_LABELS[key] ?? key;
}

function normalizeAxiomTexts(items: unknown): string[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
    .filter(Boolean);
}

function clampOptionsCount(value: number): number {
  return Math.max(4, Math.min(8, Math.floor(value)));
}

export default function WorldGenerator() {
  const llm = useLLMStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [worldName, setWorldName] = useState("");
  const [selectedGenreId, setSelectedGenreId] = useState("");
  const [inspirationMode, setInspirationMode] = useState<InspirationMode>("free");
  const [inspirationText, setInspirationText] = useState("");
  const [selectedKnowledgeDocumentIds, setSelectedKnowledgeDocumentIds] = useState<string[]>([]);
  const [optionRefinementLevel, setOptionRefinementLevel] = useState<WorldOptionRefinementLevel>("standard");
  const [optionsCount, setOptionsCount] = useState(6);
  const [concept, setConcept] = useState<ConceptCard | null>(null);
  const [propertyOptions, setPropertyOptions] = useState<WorldPropertyOption[]>([]);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("custom");
  const [selectedDimensions, setSelectedDimensions] = useState<Record<string, boolean>>(DEFAULT_DIMENSIONS);
  const [selectedClassicElements, setSelectedClassicElements] = useState<string[]>([]);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [propertyDetails, setPropertyDetails] = useState<Record<string, string>>({});
  const [inspirationSourceMeta, setInspirationSourceMeta] = useState<{
    extracted: boolean;
    originalLength: number;
    chunkCount: number;
  } | null>(null);
  const [worldId, setWorldId] = useState("");
  const [axioms, setAxioms] = useState<string[]>([]);

  const templateQuery = useQuery({
    queryKey: queryKeys.worlds.templates,
    queryFn: getWorldTemplates,
  });
  const genreTreeQuery = useQuery({
    queryKey: queryKeys.genres.all,
    queryFn: getGenreTree,
  });

  const templates = templateQuery.data?.data ?? [];
  const genreTree = genreTreeQuery.data?.data ?? [];
  const genreOptions = useMemo(() => flattenGenreTreeOptions(genreTree), [genreTree]);
  const selectedGenre = useMemo(
    () => genreOptions.find((item) => item.id === selectedGenreId) ?? null,
    [genreOptions, selectedGenreId],
  );
  const effectiveKnowledgeDocumentIds = inspirationMode === "reference" ? selectedKnowledgeDocumentIds : [];
  const selectedGenrePathSegments = useMemo(
    () =>
      (selectedGenre?.path ?? "")
        .split("/")
        .map((item) => item.trim())
        .filter(Boolean),
    [selectedGenre],
  );
  const matchedTemplateWorldType = useMemo(() => {
    if (selectedGenrePathSegments.length === 0) {
      return "";
    }
    const matchedTemplate = templates.find((template) =>
      selectedGenrePathSegments.includes(template.worldType.trim()),
    );
    return matchedTemplate?.worldType ?? selectedGenrePathSegments[selectedGenrePathSegments.length - 1] ?? "";
  }, [selectedGenrePathSegments, templates]);
  const worldTypeAnalysisHint = useMemo(() => {
    if (!selectedGenre) {
      return "";
    }
    return [
      `主类型：${selectedGenre.name}`,
      `类型路径：${selectedGenre.path}`,
      selectedGenre.description?.trim() ? `类型说明：${selectedGenre.description.trim()}` : "",
      selectedGenre.template?.trim() ? `类型模板：${selectedGenre.template.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }, [selectedGenre]);

  const filteredTemplates = useMemo(() => {
    if (!matchedTemplateWorldType) {
      return templates;
    }

    const matched = templates.filter(
      (template) => template.worldType === matchedTemplateWorldType || template.key === "custom",
    );
    return matched.length > 0 ? matched : templates;
  }, [matchedTemplateWorldType, templates]);

  const templateSelectValue = useMemo(() => {
    if (filteredTemplates.some((item) => item.key === selectedTemplateKey)) {
      return selectedTemplateKey;
    }
    return filteredTemplates[0]?.key ?? "custom";
  }, [filteredTemplates, selectedTemplateKey]);

  const selectedTemplate = useMemo(
    () =>
      filteredTemplates.find((item) => item.key === templateSelectValue)
      ?? templates.find((item) => item.key === templateSelectValue)
      ?? templates[0],
    [filteredTemplates, templateSelectValue, templates],
  );

  const existingPropertyOptionIds = useMemo(
    () => propertyOptions.map((item) => item.id),
    [propertyOptions],
  );

  const resetGeneratedState = () => {
    setConcept(null);
    setPropertyOptions([]);
    setSelectedTemplateKey("custom");
    setSelectedPropertyIds([]);
    setPropertyDetails({});
    setInspirationSourceMeta(null);
    setWorldId("");
    setAxioms([]);
  };

  const analyzeMutation = useMutation({
    mutationFn: () =>
      analyzeWorldInspiration({
        input: inspirationText,
        mode: inspirationMode,
        worldType: worldTypeAnalysisHint || undefined,
        knowledgeDocumentIds: effectiveKnowledgeDocumentIds,
        refinementLevel: optionRefinementLevel,
        optionsCount,
        provider: llm.provider,
        model: llm.model,
      }),
    onSuccess: (response) => {
      const nextConcept = response.data?.conceptCard;
      if (!nextConcept) {
        return;
      }
      setConcept(nextConcept);
      setPropertyOptions(response.data?.propertyOptions ?? []);
      setSelectedTemplateKey(nextConcept.templateKey || "custom");
      setSelectedPropertyIds([]);
      setPropertyDetails({});
      setInspirationSourceMeta(response.data?.sourceMeta ?? null);
      setWorldId("");
      setAxioms([]);
      setStep(2);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "世界观分析失败，请重试。";
      toast.error(message);
    },
  });

  const canAnalyze =
    !analyzeMutation.isPending
    && Boolean(selectedGenre)
    && (
      inspirationMode === "random"
      || (inspirationMode === "reference"
        ? Boolean(inspirationText.trim() || effectiveKnowledgeDocumentIds.length > 0)
        : Boolean(inspirationText.trim()))
    );

  const createDraftMutation = useMutation({
    mutationFn: async () => {
      const selectedPropertySelections = selectedPropertyIds
        .map((optionId) => {
          const option = propertyOptions.find((item) => item.id === optionId);
          if (!option) {
            return null;
          }
          return {
            optionId: option.id,
            name: option.name,
            description: option.description,
            targetLayer: option.targetLayer,
            detail: propertyDetails[option.id]?.trim() || null,
            source: option.source,
            libraryItemId: option.libraryItemId ?? null,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      const createResp = await createWorld({
        name: worldName.trim() || "未命名世界",
        description: concept?.summary ?? inspirationText,
        worldType: selectedGenre?.path || concept?.worldType || matchedTemplateWorldType || selectedTemplate?.worldType || "自定义",
        templateKey: selectedTemplate?.key ?? "custom",
        selectedDimensions: JSON.stringify(selectedDimensions),
        selectedElements: serializeWorldGenerationBlueprint({
          version: 1,
          classicElements: selectedClassicElements,
          propertySelections: selectedPropertySelections,
        }),
        knowledgeDocumentIds: effectiveKnowledgeDocumentIds,
      });
      const createdId = createResp.data?.id;
      if (!createdId) {
        throw new Error("创建世界草稿失败。");
      }
      const axiomResp = await suggestWorldAxioms(createdId, {
        provider: llm.provider,
        model: llm.model,
      });
      return {
        worldId: createdId,
        axioms: axiomResp.data ?? [],
      };
    },
    onSuccess: async (payload) => {
      setWorldId(payload.worldId);
      setAxioms(normalizeAxiomTexts(payload.axioms));
      setStep(3);
      await queryClient.invalidateQueries({ queryKey: queryKeys.worlds.all });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!worldId) {
        throw new Error("世界草稿不存在。");
      }
      return updateWorldAxioms(worldId, axioms.filter((item) => item.trim()));
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.worlds.detail(worldId) });
      void navigate(`/worlds/${worldId}/workspace`);
    },
  });

  const handleToggleClassicElement = (element: string, checked: boolean) => {
    setSelectedClassicElements((prev) =>
      checked ? [...prev, element] : prev.filter((item) => item !== element),
    );
  };

  const handleTogglePropertyOption = (optionId: string, checked: boolean) => {
    setSelectedPropertyIds((prev) =>
      checked ? Array.from(new Set([...prev, optionId])) : prev.filter((item) => item !== optionId),
    );
    if (!checked) {
      setPropertyDetails((prev) => {
        const next = { ...prev };
        delete next[optionId];
        return next;
      });
    }
  };

  const handlePropertyDetailChange = (optionId: string, detail: string) => {
    setPropertyDetails((prev) => ({ ...prev, [optionId]: detail }));
  };

  const handleAddLibraryOption = (item: {
    id: string;
    name: string;
    description?: string | null;
    category: string;
  }) => {
    setPropertyOptions((prev) => {
      if (prev.some((option) => option.id === item.id)) {
        return prev;
      }
      return [
        ...prev,
        {
          id: item.id,
          name: item.name,
          description: item.description?.trim() || `${item.name} 的素材库设定。`,
          targetLayer: mapWorldLibraryCategoryToLayer(item.category),
          reason: "来自素材库的可复用设定。",
          source: "library",
          libraryItemId: item.id,
        },
      ];
    });
    setSelectedPropertyIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>世界观向导（阶段 1-3）</CardTitle>
          <LLMSelector />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button variant={step === 1 ? "default" : "secondary"} onClick={() => setStep(1)}>
              1. 灵感捕获
            </Button>
            <Button variant={step === 2 ? "default" : "secondary"} onClick={() => setStep(2)} disabled={!concept}>
              2. 模板与蓝图
            </Button>
            <Button variant={step === 3 ? "default" : "secondary"} onClick={() => setStep(3)} disabled={!worldId}>
              3. 核心公理
            </Button>
          </div>

          {step === 1 ? (
            <div className="space-y-3">
              <input
                className="w-full rounded-md border p-2 text-sm"
                placeholder="世界名称（可选）"
                value={worldName}
                onChange={(event) => setWorldName(event.target.value)}
              />

              <div className="space-y-2">
                <div className="text-sm font-medium">世界类型</div>
                <select
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={selectedGenreId}
                  disabled={genreTreeQuery.isLoading || genreOptions.length === 0}
                  onChange={(event) => {
                    setSelectedGenreId(event.target.value);
                    resetGeneratedState();
                  }}
                >
                  <option value="">
                    {genreTreeQuery.isLoading ? "正在加载类型..." : "请选择通用类型"}
                  </option>
                  {genreOptions.map((genre) => (
                    <option key={genre.id} value={genre.id}>
                      {genre.path}
                    </option>
                  ))}
                </select>
                {selectedGenre ? (
                  <div className="rounded-md border p-3 text-xs text-muted-foreground space-y-1">
                    <div>当前类型路径：{selectedGenre.path}</div>
                    {selectedGenre.description?.trim() ? (
                      <div>类型说明：{selectedGenre.description.trim()}</div>
                    ) : null}
                    {selectedGenre.template?.trim() ? (
                      <div className="whitespace-pre-wrap">类型模板：{selectedGenre.template.trim()}</div>
                    ) : null}
                  </div>
                ) : null}
                {genreTreeQuery.isLoading ? (
                  <div className="text-xs text-muted-foreground">正在加载通用类型树...</div>
                ) : null}
                {!genreTreeQuery.isLoading && genreOptions.length === 0 ? (
                  <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground space-y-2">
                    <div>当前还没有可用类型。世界观向导会统一使用通用类型管理。</div>
                    <Button type="button" variant="outline" onClick={() => void navigate("/genres")}>
                      去类型管理
                    </Button>
                  </div>
                ) : null}
                <div className="text-xs text-muted-foreground">
                  这里直接复用通用类型管理，不再使用模板内置类型列表作为入口。
                </div>
                <div className="text-xs text-muted-foreground">
                  先确定题材类型，再生成概念卡、前置属性和后续模板筛选。
                </div>
              </div>

              <select
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={inspirationMode}
                onChange={(event) => {
                  const nextMode = event.target.value as InspirationMode;
                  setInspirationMode(nextMode);
                  if (nextMode !== "reference") {
                    setSelectedKnowledgeDocumentIds([]);
                  }
                  resetGeneratedState();
                }}
              >
                <option value="free">自由输入</option>
                <option value="reference">参考作品</option>
                <option value="random">随机灵感</option>
              </select>

              {inspirationMode === "reference" ? (
                <KnowledgeDocumentPicker
                  selectedIds={selectedKnowledgeDocumentIds}
                  onChange={(next) => {
                    setSelectedKnowledgeDocumentIds(next ?? []);
                    setInspirationSourceMeta(null);
                  }}
                  title="参考知识库文档"
                  description="仅在参考作品模式下使用。统一从知识库选择参考文档，不再单独上传作品。"
                  queryStatus="enabled"
                />
              ) : null}

              <textarea
                className="min-h-[180px] w-full rounded-md border p-2 text-sm"
                placeholder={
                  inspirationMode === "reference"
                    ? "粘贴参考片段，或仅选择上方知识库文档"
                    : "描述你的世界灵感"
                }
                value={inspirationText}
                onChange={(event) => {
                  setInspirationText(event.target.value);
                  setInspirationSourceMeta(null);
                }}
              />

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border p-3 text-sm space-y-2">
                  <div className="font-medium">属性选项细化程度</div>
                  <select
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={optionRefinementLevel}
                    onChange={(event) => setOptionRefinementLevel(event.target.value as WorldOptionRefinementLevel)}
                  >
                    <option value="basic">基础</option>
                    <option value="standard">标准</option>
                    <option value="detailed">详细</option>
                  </select>
                </div>

                <div className="rounded-md border p-3 text-sm space-y-2">
                  <div className="font-medium">生成前置属性数量</div>
                  <input
                    className="w-full rounded-md border p-2 text-sm"
                    type="number"
                    min={4}
                    max={8}
                    value={optionsCount}
                    onChange={(event) => setOptionsCount(clampOptionsCount(Number(event.target.value) || 6))}
                  />
                  <div className="text-xs text-muted-foreground">
                    这一步会参考旧版 V2 的思路，先生成可选择的世界属性，再进入正式创建。
                  </div>
                </div>
              </div>

              <Button
                onClick={() => analyzeMutation.mutate()}
                disabled={!canAnalyze}
              >
                {analyzeMutation.isPending ? "分析中..." : "生成概念卡与属性选项"}
              </Button>

              {inspirationSourceMeta?.extracted ? (
                <div className="text-xs text-muted-foreground">
                  已自动分段提取：原文 {inspirationSourceMeta.originalLength} 字符，切分 {inspirationSourceMeta.chunkCount} 段。
                </div>
              ) : null}

              {concept ? (
                <div className="rounded-md border p-3 text-sm space-y-2">
                  <div className="font-medium">概念卡</div>
                  <div>类型：{concept.worldType}</div>
                  <div>基调：{concept.tone}</div>
                  <div>关键词：{concept.keywords.join(" / ") || "-"}</div>
                  <div>前置属性选项：{propertyOptions.length}</div>
                  <div className="whitespace-pre-wrap">{concept.summary}</div>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <select
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={templateSelectValue}
                onChange={(event) => {
                  setSelectedTemplateKey(event.target.value);
                  setSelectedClassicElements([]);
                }}
              >
                {filteredTemplates.map((template) => (
                  <option key={template.key} value={template.key}>
                    {template.name}
                  </option>
                ))}
              </select>

              <div className="rounded-md border p-3 text-sm space-y-2">
                <div className="font-medium">{selectedTemplate?.description ?? "-"}</div>
                <div className="text-xs text-muted-foreground">
                  当前类型：{selectedGenre?.path || concept?.worldType || selectedTemplate?.worldType || "-"}
                </div>
                <div className="text-xs text-muted-foreground">
                  坑点提醒：{selectedTemplate?.pitfalls.join(" | ") || "-"}
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  {Object.keys(selectedDimensions).map((key) => (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedDimensions[key])}
                        onChange={(event) =>
                          setSelectedDimensions((prev) => ({ ...prev, [key]: event.target.checked }))
                        }
                      />
                      {getDimensionLabel(key)}
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium mb-2">经典元素</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {(selectedTemplate?.classicElements ?? []).map((element) => (
                    <label key={element} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedClassicElements.includes(element)}
                        onChange={(event) => handleToggleClassicElement(element, event.target.checked)}
                      />
                      {element}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="font-medium text-sm">前置世界属性</div>
                <WorldPropertyOptionSelector
                  options={propertyOptions}
                  selectedIds={selectedPropertyIds}
                  details={propertyDetails}
                  onToggle={handleTogglePropertyOption}
                  onDetailChange={handlePropertyDetailChange}
                />
              </div>

              <WorldLibraryQuickPick
                worldType={matchedTemplateWorldType || selectedGenre?.name || concept?.worldType || undefined}
                existingOptionIds={existingPropertyOptionIds}
                onAdd={handleAddLibraryOption}
              />

              <Button onClick={() => createDraftMutation.mutate()} disabled={createDraftMutation.isPending}>
                {createDraftMutation.isPending ? "创建中..." : "创建草稿并生成公理建议"}
              </Button>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3">
              {axioms.map((axiom, index) => (
                <Input
                  key={`${index}-${axiom}`}
                  value={axiom}
                  onChange={(event) =>
                    setAxioms((prev) => prev.map((item, idx) => (idx === index ? event.target.value : item)))
                  }
                />
              ))}
              <Button variant="secondary" onClick={() => setAxioms((prev) => [...prev, ""])}>
                新增公理
              </Button>
              <Button onClick={() => finalizeMutation.mutate()} disabled={finalizeMutation.isPending}>
                {finalizeMutation.isPending ? "保存中..." : "进入世界工作台"}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
