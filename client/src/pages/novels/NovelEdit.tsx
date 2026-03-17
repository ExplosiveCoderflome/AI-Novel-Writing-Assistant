import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BOOK_ANALYSIS_SECTIONS } from "@ai-novel/shared/types/bookAnalysis";
import type { AuditReport, PipelineRepairMode, PipelineRunMode, QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import NovelEditView from "./components/NovelEditView";
import { getBaseCharacterList } from "@/api/character";
import {
  auditNovelChapter,
  generateChapterPlan,
  getChapterAuditReports,
  getChapterPlan,
  getLatestStateSnapshot,
  getNovelDetail,
  getNovelPipelineJob,
  getNovelQualityReport,
  replanNovel,
} from "@/api/novel";
import { getWorldList } from "@/api/world";
import { queryKeys } from "@/api/queryKeys";
import { useSSE } from "@/hooks/useSSE";
import { useLLMStore } from "@/store/llmStore";
import { buildWorldInjectionSummary, parseStructuredVolumes, type OutlineSyncChapter } from "./novelEdit.utils";
import type { QuickCharacterCreatePayload } from "./components/characterPanel.utils";
import type { ChapterExecutionStrategy } from "./chapterExecution.utils";
import { useNovelCharacterMutations } from "./hooks/useNovelCharacterMutations";
import { useChapterExecutionActions } from "./hooks/useChapterExecutionActions";
import { useNovelContinuationSources } from "./hooks/useNovelContinuationSources";
import { useNovelEditMutations } from "./hooks/useNovelEditMutations";
import { useStorylineVersionControl } from "./hooks/useStorylineVersionControl";
import { createDefaultNovelBasicFormState, patchNovelBasicForm } from "./novelBasicInfo.shared";

function replaceFirstOccurrence(source: string, target: string, replacement: string): string {
  const index = source.indexOf(target);
  if (index < 0) {
    return source;
  }
  return source.slice(0, index) + replacement + source.slice(index + target.length);
}

export default function NovelEdit() {
  const { id = "" } = useParams();
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("basic");
  const [basicForm, setBasicForm] = useState(() => createDefaultNovelBasicFormState());
  const [outlineText, setOutlineText] = useState("");
  const [outlineGenerationPrompt, setOutlineGenerationPrompt] = useState("");
  const [outlineOptimizeInstruction, setOutlineOptimizeInstruction] = useState("");
  const [outlineOptimizePreview, setOutlineOptimizePreview] = useState("");
  const [outlineOptimizeMode, setOutlineOptimizeMode] = useState<"full" | "selection">("full");
  const [outlineOptimizeSourceText, setOutlineOptimizeSourceText] = useState("");
  const [structuredDraftText, setStructuredDraftText] = useState("");
  const [structuredOptimizeInstruction, setStructuredOptimizeInstruction] = useState("");
  const [structuredOptimizePreview, setStructuredOptimizePreview] = useState("");
  const [structuredOptimizeMode, setStructuredOptimizeMode] = useState<"full" | "selection">("full");
  const [structuredOptimizeSourceText, setStructuredOptimizeSourceText] = useState("");
  const [currentJobId, setCurrentJobId] = useState("");
  const [pipelineForm, setPipelineForm] = useState({
    startOrder: 1,
    endOrder: 10,
    maxRetries: 2,
    runMode: "fast" as PipelineRunMode,
    autoReview: true,
    autoRepair: true,
    skipCompleted: true,
    qualityThreshold: 75,
    repairMode: "light_repair" as PipelineRepairMode,
  });
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [reviewResult, setReviewResult] = useState<{
    score: QualityScore;
    issues: ReviewIssue[];
    auditReports?: AuditReport[];
  } | null>(null);
  const [pipelineMessage, setPipelineMessage] = useState("");
  const [structuredMessage, setStructuredMessage] = useState("");
  const [chapterOperationMessage, setChapterOperationMessage] = useState("");
  const [chapterStrategy, setChapterStrategy] = useState<ChapterExecutionStrategy>({ runMode: "fast", wordSize: "medium", conflictLevel: 60, pace: "balanced", aiFreedom: "medium" });
  const [characterMessage, setCharacterMessage] = useState("");
  const [repairBeforeContent, setRepairBeforeContent] = useState("");
  const [repairAfterContent, setRepairAfterContent] = useState("");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [selectedBaseCharacterId, setSelectedBaseCharacterId] = useState("");
  const [quickCharacterForm, setQuickCharacterForm] = useState({
    name: "",
    role: "主角",
  });
  const [characterForm, setCharacterForm] = useState({
    name: "",
    role: "",
    personality: "",
    background: "",
    development: "",
    currentState: "",
    currentGoal: "",
  });

  const novelDetailQuery = useQuery({
    queryKey: queryKeys.novels.detail(id),
    queryFn: () => getNovelDetail(id),
    enabled: Boolean(id),
  });

  const qualityReportQuery = useQuery({
    queryKey: queryKeys.novels.qualityReport(id),
    queryFn: () => getNovelQualityReport(id),
    enabled: Boolean(id),
  });

  const latestStateSnapshotQuery = useQuery({
    queryKey: queryKeys.novels.latestStateSnapshot(id),
    queryFn: () => getLatestStateSnapshot(id),
    enabled: Boolean(id),
  });

  const chapterPlanQuery = useQuery({
    queryKey: queryKeys.novels.chapterPlan(id, selectedChapterId || "none"),
    queryFn: () => getChapterPlan(id, selectedChapterId),
    enabled: Boolean(id && selectedChapterId),
  });

  const chapterAuditReportsQuery = useQuery({
    queryKey: queryKeys.novels.chapterAuditReports(id, selectedChapterId || "none"),
    queryFn: () => getChapterAuditReports(id, selectedChapterId),
    enabled: Boolean(id && selectedChapterId),
  });

  const baseCharacterListQuery = useQuery({
    queryKey: queryKeys.baseCharacters.all,
    queryFn: () => getBaseCharacterList(),
  });

  const worldListQuery = useQuery({
    queryKey: queryKeys.worlds.all,
    queryFn: getWorldList,
  });

  const {
    sourceBookAnalysesQuery,
    sourceNovelOptions,
    sourceKnowledgeOptions,
    sourceNovelBookAnalysisOptions,
  } = useNovelContinuationSources(id, {
    writingMode: basicForm.writingMode,
    continuationSourceType: basicForm.continuationSourceType,
    sourceNovelId: basicForm.sourceNovelId,
    sourceKnowledgeDocumentId: basicForm.sourceKnowledgeDocumentId,
  });

  const pipelineJobQuery = useQuery({
    queryKey: queryKeys.novels.pipelineJob(id, currentJobId || "none"),
    queryFn: () => getNovelPipelineJob(id, currentJobId),
    enabled: Boolean(id && currentJobId),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      if (status === "queued" || status === "running") {
        return 1500;
      }
      return false;
    },
  });

  const structuredVolumes = useMemo(
    () => parseStructuredVolumes(structuredDraftText),
    [structuredDraftText],
  );
  const chapters = useMemo(() => novelDetailQuery.data?.data?.chapters ?? [], [novelDetailQuery.data?.data?.chapters]);
  const outlineSyncChapters = useMemo<OutlineSyncChapter[]>(
    () => chapters.map((chapter) => ({
      id: chapter.id,
      order: chapter.order,
      title: chapter.title,
      content: chapter.content ?? "",
      expectation: chapter.expectation ?? "",
      targetWordCount: chapter.targetWordCount ?? null,
      conflictLevel: chapter.conflictLevel ?? null,
      revealLevel: chapter.revealLevel ?? null,
      mustAvoid: chapter.mustAvoid ?? null,
      taskSheet: chapter.taskSheet ?? null,
    })),
    [chapters],
  );
  const selectedChapter = useMemo(
    () => chapters.find((item) => item.id === selectedChapterId),
    [chapters, selectedChapterId],
  );
  const characters = novelDetailQuery.data?.data?.characters ?? [];
  const baseCharacters = baseCharacterListQuery.data?.data ?? [];
  const selectedCharacter = useMemo(
    () => characters.find((item) => item.id === selectedCharacterId),
    [characters, selectedCharacterId],
  );
  const selectedBaseCharacter = useMemo(
    () => baseCharacters.find((item) => item.id === selectedBaseCharacterId),
    [baseCharacters, selectedBaseCharacterId],
  );
  const importedBaseCharacterIds = useMemo(
    () => new Set(
      characters
        .map((item) => item.baseCharacterId)
        .filter((item): item is string => Boolean(item)),
    ),
    [characters],
  );
  const hasCharacters = characters.length > 0;
  const coreCharacterCount = useMemo(
    () => characters.filter((item) => /主角|反派/.test(item.role)).length,
    [characters],
  );
  const bible = novelDetailQuery.data?.data?.bible;
  const plotBeats = novelDetailQuery.data?.data?.plotBeats ?? [];
  const maxOrder = useMemo(
    () => chapters.reduce((max, chapter) => Math.max(max, chapter.order), 1),
    [chapters],
  );
  const worldInjectionSummary = useMemo(
    () => buildWorldInjectionSummary(novelDetailQuery.data?.data?.world),
    [novelDetailQuery.data?.data?.world],
  );
  const qualitySummary = qualityReportQuery.data?.data?.summary;
  const chapterQualityReport = useMemo(() => (qualityReportQuery.data?.data?.chapterReports ?? []).find((item) => item.chapterId === selectedChapterId), [qualityReportQuery.data?.data?.chapterReports, selectedChapterId]);
  const chapterPlan = chapterPlanQuery.data?.data ?? null;
  const latestStateSnapshot = latestStateSnapshotQuery.data?.data ?? null;
  const chapterAuditReports = chapterAuditReportsQuery.data?.data ?? [];
  const openAuditIssueIds = useMemo(
    () => chapterAuditReports.flatMap((report) => report.issues.filter((issue) => issue.status === "open").map((issue) => issue.id)),
    [chapterAuditReports],
  );

  useEffect(() => {
    const detail = novelDetailQuery.data?.data;
    if (!detail) {
      return;
    }
    setBasicForm({
      title: detail.title,
      description: detail.description ?? "",
      worldId: detail.worldId ?? "",
      status: detail.status,
      writingMode: detail.writingMode ?? "original",
      projectMode: detail.projectMode ?? "co_pilot",
      narrativePov: detail.narrativePov ?? "third_person",
      pacePreference: detail.pacePreference ?? "balanced",
      styleTone: detail.styleTone ?? "",
      emotionIntensity: detail.emotionIntensity ?? "medium",
      aiFreedom: detail.aiFreedom ?? "medium",
      defaultChapterLength: detail.defaultChapterLength ?? 2800,
      projectStatus: detail.projectStatus ?? "not_started",
      storylineStatus: detail.storylineStatus ?? "not_started",
      outlineStatus: detail.outlineStatus ?? "not_started",
      resourceReadyScore: detail.resourceReadyScore ?? 0,
      continuationSourceType: detail.sourceKnowledgeDocumentId ? "knowledge_document" : "novel",
      sourceNovelId: detail.sourceNovelId ?? "",
      sourceKnowledgeDocumentId: detail.sourceKnowledgeDocumentId ?? "",
      continuationBookAnalysisId: detail.continuationBookAnalysisId ?? "",
      continuationBookAnalysisSections: detail.continuationBookAnalysisSections ?? [],
    });
    setOutlineText(detail.outline ?? "");
    setStructuredDraftText(detail.structuredOutline ?? "");
    setPipelineForm((prev) => ({
      ...prev,
      endOrder: Math.max(prev.endOrder, Math.max(10, detail.chapters.length || 10)),
    }));
  }, [novelDetailQuery.data?.data]);

  useEffect(() => {
    if (!selectedChapterId && chapters.length > 0) {
      setSelectedChapterId(chapters[0].id);
    }
  }, [chapters, selectedChapterId]);

  useEffect(() => {
    if (!selectedCharacterId && characters.length > 0) {
      setSelectedCharacterId(characters[0].id);
    }
  }, [characters, selectedCharacterId]);

  useEffect(() => {
    if (!selectedBaseCharacterId && baseCharacters.length > 0) {
      setSelectedBaseCharacterId(baseCharacters[0].id);
    }
  }, [baseCharacters, selectedBaseCharacterId]);

  useEffect(() => {
    if (
      basicForm.writingMode !== "continuation"
      || !basicForm.continuationBookAnalysisId
    ) {
      return;
    }
    if (sourceBookAnalysesQuery.isLoading || sourceBookAnalysesQuery.isFetching) {
      return;
    }
    const exists = sourceNovelBookAnalysisOptions.some((item) => item.id === basicForm.continuationBookAnalysisId);
    if (exists) {
      return;
    }
    setBasicForm((prev) => ({
      ...prev,
      continuationBookAnalysisId: "",
      continuationBookAnalysisSections: [],
    }));
  }, [
    basicForm.continuationBookAnalysisId,
    basicForm.continuationSourceType,
    basicForm.writingMode,
    sourceBookAnalysesQuery.isFetching,
    sourceBookAnalysesQuery.isLoading,
    sourceNovelBookAnalysisOptions,
  ]);

  useEffect(() => {
    if (!selectedCharacter) {
      setCharacterForm({
        name: "",
        role: "",
        personality: "",
        background: "",
        development: "",
        currentState: "",
        currentGoal: "",
      });
      return;
    }
    setCharacterForm({
      name: selectedCharacter.name ?? "",
      role: selectedCharacter.role ?? "",
      personality: selectedCharacter.personality ?? "",
      background: selectedCharacter.background ?? "",
      development: selectedCharacter.development ?? "",
      currentState: selectedCharacter.currentState ?? "",
      currentGoal: selectedCharacter.currentGoal ?? "",
    });
  }, [selectedCharacter]);

  const invalidateNovelDetail = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.qualityReport(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.latestStateSnapshot(id) });
    if (selectedChapterId) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterPlan(id, selectedChapterId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterAuditReports(id, selectedChapterId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterStateSnapshot(id, selectedChapterId) });
    }
  };

  const outlineSSE = useSSE({ onDone: (fullContent) => setOutlineText(fullContent) });
  const structuredSSE = useSSE({
    onDone: async (fullContent) => {
      setStructuredDraftText(fullContent);
      await invalidateNovelDetail();
    },
  });
  const chapterSSE = useSSE({ onDone: invalidateNovelDetail });
  const bibleSSE = useSSE({ onDone: invalidateNovelDetail });
  const beatsSSE = useSSE({ onDone: invalidateNovelDetail });
  const repairSSE = useSSE({
    onDone: async (fullContent) => {
      setRepairAfterContent(fullContent);
      await invalidateNovelDetail();
    },
  });

  const {
    saveBasicMutation,
    saveOutlineMutation,
    saveStructuredMutation,
    optimizeOutlineMutation,
    optimizeStructuredMutation,
    syncStructuredChaptersMutation,
    createChapterMutation,
    runPipelineMutation,
    reviewMutation,
    hookMutation,
  } = useNovelEditMutations({
    id,
    basicForm,
    hasCharacters,
    outlineText,
    outlineOptimizeInstruction,
    setOutlineOptimizePreview,
    setOutlineOptimizeMode,
    setOutlineOptimizeSourceText,
    structuredDraftText,
    structuredOptimizeInstruction,
    setStructuredOptimizePreview,
    setStructuredOptimizeMode,
    setStructuredOptimizeSourceText,
    structuredVolumes,
    llm,
    pipelineForm,
    selectedChapterId,
    chapterCount: novelDetailQuery.data?.data?.chapters?.length ?? 0,
    setActiveTab,
    setSelectedChapterId,
    setCurrentJobId,
    setPipelineMessage,
    setStructuredMessage,
    setReviewResult,
    queryClient,
    invalidateNovelDetail,
    chapters: outlineSyncChapters,
  });

  const generateChapterPlanMutation = useMutation({
    mutationFn: () => generateChapterPlan(id, selectedChapterId, {
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    }),
    onSuccess: async () => {
      setChapterOperationMessage("章节计划已生成。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterPlan(id, selectedChapterId) });
    },
  });

  const replanChapterMutation = useMutation({
    mutationFn: () => replanNovel(id, {
      chapterId: selectedChapterId,
      reason: "manual_replan_from_chapter_tab",
      triggerType: "manual",
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    }),
    onSuccess: async () => {
      setChapterOperationMessage("章节已完成重规划。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterPlan(id, selectedChapterId) });
    },
  });

  const fullAuditMutation = useMutation({
    mutationFn: () => auditNovelChapter(id, selectedChapterId, "full", {
      provider: llm.provider,
      model: llm.model,
      temperature: 0.1,
    }),
    onSuccess: async (response) => {
      setReviewResult(response.data ?? null);
      setChapterOperationMessage("完整审计已完成。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.chapterAuditReports(id, selectedChapterId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.qualityReport(id) });
    },
  });

  const {
    characterTimelineQuery,
    syncTimelineMutation,
    syncAllTimelineMutation,
    evolveCharacterMutation,
    worldCheckMutation,
    saveCharacterMutation,
    importBaseCharacterMutation,
    quickCreateCharacterMutation,
    deleteCharacterMutation,
  } = useNovelCharacterMutations({
    id,
    selectedCharacterId,
    selectedBaseCharacter,
    characters,
    pipelineForm,
    llm,
    characterForm,
    quickCharacterForm,
    queryClient,
    setCharacterMessage,
    setSelectedCharacterId,
    setQuickCharacterForm,
  });

  const {
    storylineMessage,
    storylineVersions,
    selectedVersionId,
    setSelectedVersionId,
    diffResult,
    impactResult,
    createDraftVersionMutation,
    activateVersionMutation,
    freezeVersionMutation,
    diffMutation,
    analyzeDraftImpactMutation,
    analyzeVersionImpactMutation,
    loadSelectedVersionToDraft,
  } = useStorylineVersionControl({
    novelId: id,
    draftText: outlineText,
    setDraftText: setOutlineText,
    queryClient,
    invalidateNovelDetail,
  });

  const startOutlineGeneration = () => {
    if (!hasCharacters) {
      const confirmed = window.confirm("当前小说还没有角色。继续生成发展走向会降低后续一致性，是否继续？");
      if (!confirmed) {
        return;
      }
    }
    if (outlineText.trim()) {
      const confirmed = window.confirm("将生成新的主线草稿。生成后建议先查看差异与影响分析，再设为生效版。是否继续？");
      if (!confirmed) {
        return;
      }
    }
    void outlineSSE.start(`/novels/${id}/outline/generate`, {
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
      initialPrompt: outlineGenerationPrompt.trim() || undefined,
    });
  };

  const goToCharacterTab = () => setActiveTab("character");
  const handleGenerateSelectedChapter = () => {
    if (!selectedChapter) {
      return;
    }
    void chapterSSE.start(`/novels/${id}/chapters/${selectedChapter.id}/generate`, {
      provider: llm.provider,
      model: llm.model,
      previousChaptersSummary: [],
    });
  };
  const startChapterRepair = (issues: ReviewIssue[]) => { if (!selectedChapterId) { setChapterOperationMessage("请先选择章节。"); return; } setRepairBeforeContent(selectedChapter?.content ?? ""); setRepairAfterContent(""); void repairSSE.start(`/novels/${id}/chapters/${selectedChapterId}/repair`, { provider: llm.provider, model: llm.model, reviewIssues: issues, auditIssueIds: openAuditIssueIds }); };
  const chapterExecutionActions = useChapterExecutionActions({ novelId: id, selectedChapterId, selectedChapter, strategy: chapterStrategy, reviewIssues: reviewResult?.issues ?? [], onGenerateChapter: handleGenerateSelectedChapter, onReviewChapter: () => reviewMutation.mutate(), onStartRepair: startChapterRepair, onMessage: setChapterOperationMessage, invalidateNovelDetail });

  const basicTab = {
    basicForm,
    worldOptions: worldListQuery.data?.data ?? [],
    sourceNovelOptions,
    sourceKnowledgeOptions,
    sourceNovelBookAnalysisOptions,
    isLoadingSourceNovelBookAnalyses: sourceBookAnalysesQuery.isLoading,
    availableBookAnalysisSections: [...BOOK_ANALYSIS_SECTIONS],
    onFormChange: (patch: Partial<typeof basicForm>) => setBasicForm((prev) => patchNovelBasicForm(prev, patch)),
    onSave: () => saveBasicMutation.mutate(),
    isSaving: saveBasicMutation.isPending,
  };
  const outlineTab = { worldInjectionSummary, hasCharacters, isGenerating: outlineSSE.isStreaming, streamContent: outlineSSE.content, onGenerate: startOutlineGeneration, onStop: outlineSSE.abort, onAbortStream: outlineSSE.abort, onGoToCharacterTab: goToCharacterTab, generationPrompt: outlineGenerationPrompt, onGenerationPromptChange: setOutlineGenerationPrompt, draftText: outlineText, onDraftTextChange: setOutlineText, onSave: () => saveOutlineMutation.mutate(), isSaving: saveOutlineMutation.isPending, optimizeInstruction: outlineOptimizeInstruction, onOptimizeInstructionChange: setOutlineOptimizeInstruction, onOptimizeFull: () => { setOutlineOptimizeMode("full"); setOutlineOptimizeSourceText(""); optimizeOutlineMutation.mutate({ mode: "full" }); }, onOptimizeSelection: (selectedText: string) => { setOutlineOptimizeMode("selection"); setOutlineOptimizeSourceText(selectedText); optimizeOutlineMutation.mutate({ mode: "selection", selectedText }); }, isOptimizing: optimizeOutlineMutation.isPending, optimizePreview: outlineOptimizePreview, onApplyOptimizePreview: () => { if (outlineOptimizeMode === "selection" && outlineOptimizeSourceText.trim()) { setOutlineText((prev) => replaceFirstOccurrence(prev, outlineOptimizeSourceText, outlineOptimizePreview)); } else { setOutlineText(outlineOptimizePreview); } setOutlineOptimizePreview(""); setOutlineOptimizeSourceText(""); setOutlineOptimizeMode("full"); }, onCancelOptimizePreview: () => { setOutlineOptimizePreview(""); setOutlineOptimizeSourceText(""); setOutlineOptimizeMode("full"); }, storylineMessage, storylineVersions, selectedVersionId, onSelectedVersionChange: setSelectedVersionId, onCreateDraftVersion: () => createDraftVersionMutation.mutate(), isCreatingDraftVersion: createDraftVersionMutation.isPending, onLoadSelectedVersionToDraft: loadSelectedVersionToDraft, onActivateVersion: () => activateVersionMutation.mutate(), isActivatingVersion: activateVersionMutation.isPending, onFreezeVersion: () => freezeVersionMutation.mutate(), isFreezingVersion: freezeVersionMutation.isPending, onLoadVersionDiff: () => diffMutation.mutate(), isLoadingVersionDiff: diffMutation.isPending, diffResult, onAnalyzeDraftImpact: () => analyzeDraftImpactMutation.mutate(), isAnalyzingDraftImpact: analyzeDraftImpactMutation.isPending, onAnalyzeVersionImpact: () => analyzeVersionImpactMutation.mutate(), isAnalyzingVersionImpact: analyzeVersionImpactMutation.isPending, impactResult };
  const structuredTab = { worldInjectionSummary, hasCharacters, isGenerating: structuredSSE.isStreaming, streamContent: structuredSSE.content, onGenerate: () => void structuredSSE.start(`/novels/${id}/structured-outline/generate`, { provider: llm.provider, model: llm.model }), onStop: structuredSSE.abort, onAbortStream: structuredSSE.abort, onGoToCharacterTab: goToCharacterTab, onApplySync: (options: { preserveContent: boolean; applyDeletes: boolean }) => syncStructuredChaptersMutation.mutate(options), isApplyingSync: syncStructuredChaptersMutation.isPending, syncMessage: structuredMessage, draftText: structuredDraftText, onDraftTextChange: setStructuredDraftText, onSave: () => saveStructuredMutation.mutate(), isSaving: saveStructuredMutation.isPending, optimizeInstruction: structuredOptimizeInstruction, onOptimizeInstructionChange: setStructuredOptimizeInstruction, onOptimizeFull: () => { setStructuredOptimizeMode("full"); setStructuredOptimizeSourceText(""); optimizeStructuredMutation.mutate({ mode: "full" }); }, onOptimizeSelection: (selectedText: string) => { setStructuredOptimizeMode("selection"); setStructuredOptimizeSourceText(selectedText); optimizeStructuredMutation.mutate({ mode: "selection", selectedText }); }, isOptimizing: optimizeStructuredMutation.isPending, optimizePreview: structuredOptimizePreview, onApplyOptimizePreview: () => { if (structuredOptimizeMode === "selection" && structuredOptimizeSourceText.trim()) { setStructuredDraftText((prev) => replaceFirstOccurrence(prev, structuredOptimizeSourceText, structuredOptimizePreview)); } else { setStructuredDraftText(structuredOptimizePreview); } setStructuredOptimizePreview(""); setStructuredOptimizeSourceText(""); setStructuredOptimizeMode("full"); }, onCancelOptimizePreview: () => { setStructuredOptimizePreview(""); setStructuredOptimizeSourceText(""); setStructuredOptimizeMode("full"); }, structuredVolumes, chapters: outlineSyncChapters };
  const chapterTab = { novelId: id, worldInjectionSummary, hasCharacters, chapters, selectedChapterId, selectedChapter, onSelectChapter: setSelectedChapterId, onGoToCharacterTab: goToCharacterTab, onCreateChapter: () => createChapterMutation.mutate(), isCreatingChapter: createChapterMutation.isPending, chapterOperationMessage, strategy: chapterStrategy, onStrategyChange: (field: "runMode" | "wordSize" | "conflictLevel" | "pace" | "aiFreedom", value: string | number) => setChapterStrategy((prev) => ({ ...prev, [field]: value } as ChapterExecutionStrategy)), onApplyStrategy: chapterExecutionActions.applyStrategy, isApplyingStrategy: chapterExecutionActions.isPatchingChapter, onGenerateSelectedChapter: handleGenerateSelectedChapter, onRewriteChapter: chapterExecutionActions.rewriteChapter, onExpandChapter: chapterExecutionActions.expandChapter, onCompressChapter: chapterExecutionActions.compressChapter, onSummarizeChapter: chapterExecutionActions.summarizeChapter, onGenerateTaskSheet: chapterExecutionActions.generateTaskSheet, onGenerateSceneCards: chapterExecutionActions.generateSceneCards, onGenerateChapterPlan: () => generateChapterPlanMutation.mutate(), onReplanChapter: () => replanChapterMutation.mutate(), onRunFullAudit: () => fullAuditMutation.mutate(), onCheckContinuity: chapterExecutionActions.checkContinuity, onCheckCharacterConsistency: chapterExecutionActions.checkCharacterConsistency, onCheckPacing: chapterExecutionActions.checkPacing, onAutoRepair: chapterExecutionActions.autoRepair, onStrengthenConflict: chapterExecutionActions.strengthenConflict, onEnhanceEmotion: chapterExecutionActions.enhanceEmotion, onUnifyStyle: chapterExecutionActions.unifyStyle, onAddDialogue: chapterExecutionActions.addDialogue, onAddDescription: chapterExecutionActions.addDescription, isReviewingChapter: reviewMutation.isPending, isRepairingChapter: repairSSE.isStreaming, reviewResult, chapterPlan, latestStateSnapshot, chapterAuditReports, isGeneratingChapterPlan: generateChapterPlanMutation.isPending, isReplanningChapter: replanChapterMutation.isPending, isRunningFullAudit: fullAuditMutation.isPending, chapterQualityReport, repairStreamContent: repairSSE.content, isRepairStreaming: repairSSE.isStreaming, onAbortRepair: repairSSE.abort, streamContent: chapterSSE.content, isStreaming: chapterSSE.isStreaming, onAbortStream: chapterSSE.abort };
  const pipelineTab = { novelId: id, worldInjectionSummary, hasCharacters, onGoToCharacterTab: goToCharacterTab, pipelineForm, onPipelineFormChange: (field: "startOrder" | "endOrder" | "maxRetries" | "runMode" | "autoReview" | "autoRepair" | "skipCompleted" | "qualityThreshold" | "repairMode", value: number | boolean | string) => setPipelineForm((prev) => ({ ...prev, [field]: value } as typeof prev)), maxOrder, onGenerateBible: () => void bibleSSE.start(`/novels/${id}/bible/generate`, { provider: llm.provider, model: llm.model, temperature: 0.6 }), onAbortBible: bibleSSE.abort, isBibleStreaming: bibleSSE.isStreaming, bibleStreamContent: bibleSSE.content, onGenerateBeats: () => void beatsSSE.start(`/novels/${id}/beats/generate`, { provider: llm.provider, model: llm.model, targetChapters: pipelineForm.endOrder }), onAbortBeats: beatsSSE.abort, isBeatsStreaming: beatsSSE.isStreaming, beatsStreamContent: beatsSSE.content, onRunPipeline: (patch?: Partial<typeof pipelineForm>) => runPipelineMutation.mutate(patch), isRunningPipeline: runPipelineMutation.isPending, pipelineMessage, pipelineJob: pipelineJobQuery.data?.data, chapters, selectedChapterId, onSelectedChapterChange: setSelectedChapterId, onReviewChapter: () => reviewMutation.mutate(), isReviewing: reviewMutation.isPending, onRepairChapter: () => { setRepairBeforeContent(selectedChapter?.content ?? ""); setRepairAfterContent(""); void repairSSE.start(`/novels/${id}/chapters/${selectedChapterId}/repair`, { provider: llm.provider, model: llm.model, reviewIssues: reviewResult?.issues ?? [], auditIssueIds: openAuditIssueIds }); }, isRepairing: repairSSE.isStreaming, onGenerateHook: () => hookMutation.mutate(), isGeneratingHook: hookMutation.isPending, reviewResult, repairBeforeContent, repairAfterContent, repairStreamContent: repairSSE.content, isRepairStreaming: repairSSE.isStreaming, onAbortRepair: repairSSE.abort, qualitySummary, chapterReports: qualityReportQuery.data?.data?.chapterReports ?? [], bible, plotBeats };
  const characterTab = { characterMessage, quickCharacterForm, onQuickCharacterFormChange: (field: "name" | "role", value: string) => setQuickCharacterForm((prev) => ({ ...prev, [field]: value })), onQuickCreateCharacter: (payload: QuickCharacterCreatePayload) => quickCreateCharacterMutation.mutate(payload), isQuickCreating: quickCreateCharacterMutation.isPending, characters, coreCharacterCount, baseCharacters, selectedBaseCharacterId, onSelectedBaseCharacterChange: setSelectedBaseCharacterId, selectedBaseCharacter, importedBaseCharacterIds, onImportBaseCharacter: () => importBaseCharacterMutation.mutate(), isImportingBaseCharacter: importBaseCharacterMutation.isPending, selectedCharacterId, onSelectedCharacterChange: setSelectedCharacterId, onDeleteCharacter: (characterId: string) => deleteCharacterMutation.mutate(characterId), isDeletingCharacter: deleteCharacterMutation.isPending, deletingCharacterId: deleteCharacterMutation.variables ?? "", onSyncTimeline: () => syncTimelineMutation.mutate(), isSyncingTimeline: syncTimelineMutation.isPending, onSyncAllTimeline: () => syncAllTimelineMutation.mutate(), isSyncingAllTimeline: syncAllTimelineMutation.isPending, onEvolveCharacter: () => evolveCharacterMutation.mutate(), isEvolvingCharacter: evolveCharacterMutation.isPending, onWorldCheck: () => worldCheckMutation.mutate(), isCheckingWorld: worldCheckMutation.isPending, selectedCharacter, characterForm, onCharacterFormChange: (field: "name" | "role" | "personality" | "background" | "development" | "currentState" | "currentGoal", value: string) => setCharacterForm((prev) => ({ ...prev, [field]: value })), onSaveCharacter: () => saveCharacterMutation.mutate(), isSavingCharacter: saveCharacterMutation.isPending, timelineEvents: characterTimelineQuery.data?.data ?? [] };

  return <NovelEditView id={id} activeTab={activeTab} onActiveTabChange={setActiveTab} basicTab={basicTab} outlineTab={outlineTab} structuredTab={structuredTab} chapterTab={chapterTab} pipelineTab={pipelineTab} characterTab={characterTab} />;
}
