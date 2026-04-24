import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createEmptyWorldReferenceSeedBundle,
  createEmptyWorldReferenceSeedSelection,
  mapWorldLibraryCategoryToLayer,
  serializeWorldGenerationBlueprint,
  type WorldOptionRefinementLevel,
  type WorldPropertyOption,
  type WorldReferenceAnchor,
  type WorldReferenceMode,
  type WorldReferenceSeedBundle,
  type WorldReferenceSeedSelection,
} from "@ai-novel/shared/types/worldWizard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import LLMSelector from "@/components/common/LLMSelector";
import {
  createWorld,
  suggestWorldAxioms,
  updateWorldAxioms,
  WORLD_INSPIRATION_ANALYZE_STREAM_PATH,
  type WorldInspirationAnalysisResult,
} from "@/api/world";
import { queryKeys } from "@/api/queryKeys";
import { useSSE } from "@/hooks/useSSE";
import { useLLMStore } from "@/store/llmStore";
import WorldGeneratorStepOne from "./components/generator/WorldGeneratorStepOne";
import WorldGeneratorStepTwo from "./components/generator/WorldGeneratorStepTwo";
import WorldGeneratorStepThree from "./components/generator/WorldGeneratorStepThree";
import {
  buildDefaultPropertySelectionState,
  buildDefaultReferenceSeedSelection,
  clampOptionsCount,
  DEFAULT_DIMENSIONS,
  normalizeAxiomTexts,
  REFERENCE_SEED_SELECTION_KEYS,
  type InspirationMode,
  type WorldGeneratorConceptCard,
} from "./components/generator/worldGeneratorShared";
import { useWorldGeneratorDerivedState } from "./components/generator/useWorldGeneratorDerivedState";
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
  const [referenceMode, setReferenceMode] = useState<WorldReferenceMode>("adapt_world");
  const [preserveText, setPreserveText] = useState("");
  const [allowedChangesText, setAllowedChangesText] = useState("");
  const [forbiddenText, setForbiddenText] = useState("");
  const [optionRefinementLevel, setOptionRefinementLevel] = useState<WorldOptionRefinementLevel>("standard");
  const [optionsCount, setOptionsCount] = useState(6);
  const [concept, setConcept] = useState<WorldGeneratorConceptCard | null>(null);
  const [propertyOptions, setPropertyOptions] = useState<WorldPropertyOption[]>([]);
  const [referenceAnchors, setReferenceAnchors] = useState<WorldReferenceAnchor[]>([]);
  const [referenceSeeds, setReferenceSeeds] = useState<WorldReferenceSeedBundle>(createEmptyWorldReferenceSeedBundle());
  const [selectedReferenceSeedIds, setSelectedReferenceSeedIds] = useState<WorldReferenceSeedSelection>(
    createEmptyWorldReferenceSeedSelection(),
  );
  const [selectedTemplateKey, setSelectedTemplateKey] = useState("custom");
  const [selectedDimensions, setSelectedDimensions] = useState<Record<string, boolean>>(DEFAULT_DIMENSIONS);
  const [selectedClassicElements, setSelectedClassicElements] = useState<string[]>([]);
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [selectedPropertyChoices, setSelectedPropertyChoices] = useState<Record<string, string>>({});
  const [propertyDetails, setPropertyDetails] = useState<Record<string, string>>({});
  const [inspirationSourceMeta, setInspirationSourceMeta] = useState<{
    extracted: boolean;
    originalLength: number;
    chunkCount: number;
  } | null>(null);
  const [worldId, setWorldId] = useState("");
  const [axioms, setAxioms] = useState<string[]>([]);

  const {
    genreTreeQuery,
    genreOptions,
    selectedGenre,
    isReferenceMode,
    effectiveKnowledgeDocumentIds,
    preserveElements,
    allowedChanges,
    forbiddenElements,
    matchedTemplateWorldType,
    worldTypeAnalysisHint,
    filteredTemplates,
    templateSelectValue,
    selectedTemplate,
    existingPropertyOptionIds,
  } = useWorldGeneratorDerivedState({
    selectedGenreId,
    inspirationMode,
    selectedKnowledgeDocumentIds,
    preserveText,
    allowedChangesText,
    forbiddenText,
    selectedTemplateKey,
    propertyOptions,
  });
  const currentTypeLabel = selectedGenre?.path || concept?.worldType || selectedTemplate?.worldType || "-";
  const libraryQuickPickWorldType = matchedTemplateWorldType || selectedGenre?.name || concept?.worldType || undefined;
  const resetGeneratedState = () => {
    setConcept(null);
    setPropertyOptions([]);
    setReferenceAnchors([]);
    setReferenceSeeds(createEmptyWorldReferenceSeedBundle());
    setSelectedReferenceSeedIds(createEmptyWorldReferenceSeedSelection());
    setSelectedTemplateKey("custom");
    setSelectedClassicElements([]);
    setSelectedPropertyIds([]);
    setSelectedPropertyChoices({});
    setPropertyDetails({});
    setInspirationSourceMeta(null);
    setWorldId("");
    setAxioms([]);
  };
  const analyzeStream = useSSE({
    onDone: async (fullContent) => {
      try {
        const response = JSON.parse(fullContent) as WorldInspirationAnalysisResult;
        const nextConcept = response?.conceptCard;
        const nextPropertyOptions = response.propertyOptions ?? [];
        const nextReferenceSeeds = response.referenceSeeds ?? createEmptyWorldReferenceSeedBundle();
        const defaultPropertySelection = buildDefaultPropertySelectionState(nextPropertyOptions);

        if (!nextConcept) {
          throw new Error("世界观分析结果缺少概念卡。");
        }

        setConcept(nextConcept);
        setPropertyOptions(nextPropertyOptions);
        setReferenceAnchors(response.referenceAnchors ?? []);
        setReferenceSeeds(nextReferenceSeeds);
        setSelectedTemplateKey(nextConcept.templateKey || "custom");
        setSelectedPropertyIds(defaultPropertySelection.selectedIds);
        setSelectedPropertyChoices(defaultPropertySelection.selectedChoiceIds);
        setSelectedReferenceSeedIds(buildDefaultReferenceSeedSelection(nextReferenceSeeds));
        setPropertyDetails({});
        setInspirationSourceMeta(response.sourceMeta ?? null);
        setWorldId("");
        setAxioms([]);
        setStep(2);
      } catch (error) {
        const message = error instanceof Error ? error.message : "世界观分析结果解析失败。";
        toast.error(message);
      }
    },
  });
  useEffect(() => {
    if (analyzeStream.error) {
      toast.error(analyzeStream.error);
    }
  }, [analyzeStream.error]);
  const canAnalyze =
    !analyzeStream.isStreaming
    && Boolean(selectedGenre)
    && (
      inspirationMode === "random"
      || (isReferenceMode
        ? Boolean(inspirationText.trim() || effectiveKnowledgeDocumentIds.length > 0)
        : Boolean(inspirationText.trim()))
    );
  const handleAnalyze = () => {
    resetGeneratedState();
    void analyzeStream.start(WORLD_INSPIRATION_ANALYZE_STREAM_PATH, {
      input: inspirationText,
      mode: inspirationMode,
      worldType: worldTypeAnalysisHint || undefined,
      knowledgeDocumentIds: effectiveKnowledgeDocumentIds,
      referenceMode: isReferenceMode ? referenceMode : undefined,
      preserveElements: isReferenceMode ? preserveElements : undefined,
      allowedChanges: isReferenceMode ? allowedChanges : undefined,
      forbiddenElements: isReferenceMode ? forbiddenElements : undefined,
      refinementLevel: optionRefinementLevel,
      optionsCount,
      provider: llm.provider,
      model: llm.model,
    });
  };
  const createDraftMutation = useMutation({
    mutationFn: async () => {
      const selectedPropertySelections = selectedPropertyIds
        .map((optionId) => {
          const option = propertyOptions.find((item) => item.id === optionId);
          if (!option) {
            return null;
          }
          const selectedChoice = option.choices?.find((choice) => choice.id === selectedPropertyChoices[option.id]);
          return {
            optionId: option.id,
            name: option.name,
            description: option.description,
            targetLayer: option.targetLayer,
            detail: propertyDetails[option.id]?.trim() || null,
            choiceId: selectedChoice?.id ?? null,
            choiceLabel: selectedChoice?.label ?? null,
            choiceSummary: selectedChoice?.summary ?? null,
            source: option.source,
            libraryItemId: option.libraryItemId ?? null,
            sourceCategory: option.sourceCategory ?? null,
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
          referenceContext: isReferenceMode
            ? {
              mode: referenceMode,
              preserveElements,
              allowedChanges,
              forbiddenElements,
              anchors: referenceAnchors,
              referenceSeeds,
              selectedSeedIds: selectedReferenceSeedIds,
            }
            : null,
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
    const option = propertyOptions.find((item) => item.id === optionId);
    setSelectedPropertyIds((prev) =>
      checked ? Array.from(new Set([...prev, optionId])) : prev.filter((item) => item !== optionId),
    );
    if (checked && option?.choices?.length) {
      setSelectedPropertyChoices((prev) => ({
        ...prev,
        [optionId]: prev[optionId] ?? option.choices?.[0]?.id ?? "",
      }));
    }
    if (!checked) {
      setSelectedPropertyChoices((prev) => {
        const next = { ...prev };
        delete next[optionId];
        return next;
      });
      setPropertyDetails((prev) => {
        const next = { ...prev };
        delete next[optionId];
        return next;
      });
    }
  };
  const handleToggleReferenceSeed = (
    group: keyof WorldReferenceSeedBundle,
    id: string,
    checked: boolean,
  ) => {
    const selectionKey = REFERENCE_SEED_SELECTION_KEYS[group];
    setSelectedReferenceSeedIds((prev) => ({
      ...prev,
      [selectionKey]: checked
        ? Array.from(new Set([...prev[selectionKey], id]))
        : prev[selectionKey].filter((item) => item !== id),
    }));
  };
  const handleToggleAllReferenceSeeds = (group: keyof WorldReferenceSeedBundle, checked: boolean) => {
    const selectionKey = REFERENCE_SEED_SELECTION_KEYS[group];
    const nextIds = checked ? referenceSeeds[group].map((item) => item.id) : [];
    setSelectedReferenceSeedIds((prev) => ({
      ...prev,
      [selectionKey]: nextIds,
    }));
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
          sourceCategory: item.category,
        },
      ];
    });
    setSelectedPropertyIds((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
  };
  return (
    <div className="mobile-page-world-generator space-y-4">
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
            <WorldGeneratorStepOne
              worldName={worldName}
              selectedGenreId={selectedGenreId}
              selectedGenre={selectedGenre}
              genreOptions={genreOptions}
              genreLoading={genreTreeQuery.isLoading}
              inspirationMode={inspirationMode}
              referenceMode={referenceMode}
              selectedKnowledgeDocumentIds={selectedKnowledgeDocumentIds}
              preserveText={preserveText}
              allowedChangesText={allowedChangesText}
              forbiddenText={forbiddenText}
              inspirationText={inspirationText}
              optionRefinementLevel={optionRefinementLevel}
              optionsCount={optionsCount}
              canAnalyze={canAnalyze}
              analyzeStreaming={analyzeStream.isStreaming}
              analyzeButtonLabel={
                analyzeStream.isStreaming
                  ? (analyzeStream.latestRun?.message ?? "分析中...")
                  : (isReferenceMode ? "提取原作锚点与架空方向" : "生成概念卡与属性选项")
              }
              analyzeProgressMessage={analyzeStream.latestRun?.message}
              inspirationSourceMeta={inspirationSourceMeta}
              concept={concept}
              propertyOptionsCount={propertyOptions.length}
              referenceAnchors={referenceAnchors}
              onWorldNameChange={setWorldName}
              onGenreChange={(value) => {
                setSelectedGenreId(value);
                resetGeneratedState();
              }}
              onOpenGenreManager={() => void navigate("/genres")}
              onInspirationModeChange={(value) => {
                setInspirationMode(value);
                setSelectedClassicElements([]);
                if (value !== "reference") {
                  setSelectedKnowledgeDocumentIds([]);
                }
                resetGeneratedState();
              }}
              onKnowledgeDocumentIdsChange={(ids) => {
                setSelectedKnowledgeDocumentIds(ids);
                setInspirationSourceMeta(null);
              }}
              onReferenceModeChange={(value) => {
                setReferenceMode(value);
                resetGeneratedState();
              }}
              onPreserveTextChange={(value) => {
                setPreserveText(value);
                setInspirationSourceMeta(null);
              }}
              onAllowedChangesTextChange={(value) => {
                setAllowedChangesText(value);
                setInspirationSourceMeta(null);
              }}
              onForbiddenTextChange={(value) => {
                setForbiddenText(value);
                setInspirationSourceMeta(null);
              }}
              onInspirationTextChange={(value) => {
                setInspirationText(value);
                setInspirationSourceMeta(null);
              }}
              onOptionRefinementLevelChange={setOptionRefinementLevel}
              onOptionsCountChange={(value) => setOptionsCount(clampOptionsCount(value))}
              onAnalyze={handleAnalyze}
            />
          ) : null}

          {step === 2 ? (
            <WorldGeneratorStepTwo
              isReferenceMode={isReferenceMode}
              referenceMode={referenceMode}
              referenceAnchors={referenceAnchors}
              preserveElements={preserveElements}
              allowedChanges={allowedChanges}
              forbiddenElements={forbiddenElements}
              referenceSeeds={referenceSeeds}
              selectedReferenceSeedIds={selectedReferenceSeedIds}
              filteredTemplates={filteredTemplates}
              templateSelectValue={templateSelectValue}
              selectedTemplate={selectedTemplate}
              selectedDimensions={selectedDimensions}
              selectedClassicElements={selectedClassicElements}
              propertyOptions={propertyOptions}
              selectedPropertyIds={selectedPropertyIds}
              propertyDetails={propertyDetails}
              selectedPropertyChoices={selectedPropertyChoices}
              existingPropertyOptionIds={existingPropertyOptionIds}
              currentTypeLabel={currentTypeLabel}
              libraryQuickPickWorldType={libraryQuickPickWorldType}
              createDraftPending={createDraftMutation.isPending}
              onTemplateChange={(value) => {
                setSelectedTemplateKey(value);
                setSelectedClassicElements([]);
              }}
              onToggleDimension={(key, checked) =>
                setSelectedDimensions((prev) => ({ ...prev, [key]: checked }))
              }
              onToggleClassicElement={handleToggleClassicElement}
              onToggleReferenceSeed={handleToggleReferenceSeed}
              onToggleAllReferenceSeeds={handleToggleAllReferenceSeeds}
              onTogglePropertyOption={handleTogglePropertyOption}
              onPropertyChoiceSelect={(optionId, choiceId) =>
                setSelectedPropertyChoices((prev) => ({ ...prev, [optionId]: choiceId }))
              }
              onPropertyDetailChange={(optionId, detail) =>
                setPropertyDetails((prev) => ({ ...prev, [optionId]: detail }))
              }
              onAddLibraryOption={handleAddLibraryOption}
              onCreateDraft={() => createDraftMutation.mutate()}
            />
          ) : null}

          {step === 3 ? (
            <WorldGeneratorStepThree
              axioms={axioms}
              finalizePending={finalizeMutation.isPending}
              onAxiomChange={(index, value) =>
                setAxioms((prev) => prev.map((item, itemIndex) => (itemIndex === index ? value : item)))
              }
              onAddAxiom={() => setAxioms((prev) => [...prev, ""])}
              onFinalize={() => finalizeMutation.mutate()}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
