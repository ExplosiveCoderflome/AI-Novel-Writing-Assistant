import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createEmptyWorldReferenceSeedBundle,
  createEmptyWorldReferenceSeedSelection,
  serializeWorldGenerationBlueprint,
  WORLD_SKELETON_PRESET_COUNTS,
  type WorldOptionRefinementLevel,
  type WorldPropertyOption,
  type WorldReferenceAnchor,
  type WorldReferenceMode,
  type WorldReferenceSeedBundle,
  type WorldReferenceSeedSelection,
  type WorldGenerationBlueprint,
  type WorldReferenceContext,
  type WorldSkeletonGenerationCounts,
  type WorldSkeletonGenerationPayload,
  type WorldSkeletonPreset,
} from "@ai-novel/shared/types/worldWizard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import LLMSelector from "@/components/common/LLMSelector";
import {
  createWorld,
  generateWorldSkeleton,
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
  type InspirationMode,
  type WorldGeneratorConceptCard,
} from "./components/generator/worldGeneratorShared";
import { useWorldGeneratorDerivedState } from "./components/generator/useWorldGeneratorDerivedState";
export default function WorldGenerator() {
  const llm = useLLMStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
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
  const [skeletonPreset, setSkeletonPreset] = useState<WorldSkeletonPreset>("standard");
  const [skeletonCounts, setSkeletonCounts] = useState<WorldSkeletonGenerationCounts>(
    WORLD_SKELETON_PRESET_COUNTS.standard,
  );
  const [skeleton, setSkeleton] = useState<WorldSkeletonGenerationPayload | null>(null);

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
    selectedTemplate,
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
    setSkeleton(null);
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
          throw new Error("世界分析结果缺少概念卡。");
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
        setSkeleton(null);
        setStep(2);
      } catch (error) {
        const message = error instanceof Error ? error.message : "世界分析结果解析失败。";
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
  const buildGenerationBlueprint = (): WorldGenerationBlueprint => {
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

      return {
        version: 1,
        classicElements: selectedClassicElements,
        propertySelections: selectedPropertySelections,
        referenceContext: buildReferenceContext(),
      };
  };
  const buildReferenceContext = (): WorldReferenceContext | null => {
    return isReferenceMode
      ? {
        mode: referenceMode,
        preserveElements,
        allowedChanges,
        forbiddenElements,
        anchors: referenceAnchors,
        referenceSeeds,
        selectedSeedIds: selectedReferenceSeedIds,
      }
      : null;
  };
  const generateSkeletonMutation = useMutation({
    mutationFn: async () => {
      const response = await generateWorldSkeleton({
        idea: [
          inspirationText.trim(),
          concept?.summary ? `概念卡：${concept.summary}` : "",
        ].filter(Boolean).join("\n\n") || "生成一个可用于小说创作的世界样本。",
        worldType: selectedGenre?.path || concept?.worldType || matchedTemplateWorldType || selectedTemplate?.worldType || "自定义",
        template: selectedTemplate?.name ?? "自定义",
        referenceContext: buildReferenceContext(),
        blueprint: buildGenerationBlueprint(),
        options: {
          preset: skeletonPreset,
          counts: skeletonCounts,
        },
        provider: llm.provider,
        model: llm.model,
      });
      return response.data;
    },
    onSuccess: (payload) => {
      setSkeleton(payload ?? null);
      setStep(3);
    },
  });
  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!skeleton) {
        throw new Error("请先生成世界骨架。");
      }
      const blueprint = buildGenerationBlueprint();
      return createWorld({
        name: worldName.trim() || skeleton.concept.name || "未命名世界",
        description: skeleton.structuredData.profile.summary || skeleton.concept.oneSentence,
        worldType: selectedGenre?.path || concept?.worldType || matchedTemplateWorldType || selectedTemplate?.worldType || "自定义",
        templateKey: selectedTemplate?.key ?? "custom",
        selectedDimensions: JSON.stringify(selectedDimensions),
        selectedElements: serializeWorldGenerationBlueprint(blueprint),
        knowledgeDocumentIds: effectiveKnowledgeDocumentIds,
        structure: skeleton.structuredData,
        bindingSupport: skeleton.bindingSupport,
      });
    },
    onSuccess: async (response) => {
      const createdId = response.data?.id;
      await queryClient.invalidateQueries({ queryKey: queryKeys.worlds.all });
      if (createdId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.worlds.detail(createdId) });
        void navigate(`/worlds/${createdId}/workspace`);
      }
    },
  });
  const handlePresetChange = (preset: WorldSkeletonPreset) => {
    setSkeletonPreset(preset);
    setSkeletonCounts(WORLD_SKELETON_PRESET_COUNTS[preset]);
    setSkeleton(null);
  };
  const handleCountChange = (key: keyof WorldSkeletonGenerationCounts, value: number) => {
    setSkeletonCounts((prev) => ({ ...prev, [key]: value }));
    setSkeleton(null);
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>创建世界样本</CardTitle>
          <LLMSelector />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-4">
            <Button variant={step === 1 ? "default" : "secondary"} onClick={() => setStep(1)}>
              1. 世界意图
            </Button>
            <Button variant={step === 2 ? "default" : "secondary"} onClick={() => setStep(2)} disabled={!concept}>
              2. 世界规模
            </Button>
            <Button variant={step === 3 ? "default" : "secondary"} onClick={() => setStep(3)} disabled={!skeleton}>
              3. 骨架预览
            </Button>
            <Button variant={step === 4 ? "default" : "secondary"} onClick={() => setStep(4)} disabled={!skeleton}>
              4. 保存世界
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
              preset={skeletonPreset}
              counts={skeletonCounts}
              generating={generateSkeletonMutation.isPending}
              onPresetChange={handlePresetChange}
              onCountChange={handleCountChange}
              onGenerateSkeleton={() => generateSkeletonMutation.mutate()}
            />
          ) : null}

          {(step === 3 || step === 4) && skeleton ? (
            <WorldGeneratorStepThree
              skeleton={skeleton}
              savePending={finalizeMutation.isPending}
              onBackToScale={() => setStep(2)}
              onSave={() => finalizeMutation.mutate()}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
