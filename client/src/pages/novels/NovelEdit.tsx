import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BOOK_ANALYSIS_SECTIONS, type BookAnalysis, type BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import type { QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import NovelEditView from "./components/NovelEditView";
import { getBaseCharacterList } from "@/api/character";
import { listBookAnalyses } from "@/api/bookAnalysis";
import {
  createNovelChapter,
  generateChapterHook,
  getNovelDetail,
  getNovelList,
  getNovelPipelineJob,
  getNovelQualityReport,
  optimizeNovelOutlinePreview,
  optimizeNovelStructuredOutlinePreview,
  reviewNovelChapter,
  runNovelPipeline,
  updateNovel,
} from "@/api/novel";
import { getNovelKnowledgeDocuments, listKnowledgeDocuments } from "@/api/knowledge";
import { getWorldList } from "@/api/world";
import { queryKeys } from "@/api/queryKeys";
import { useSSE } from "@/hooks/useSSE";
import { useLLMStore } from "@/store/llmStore";
import { buildWorldInjectionSummary, parseStructuredVolumes } from "./novelEdit.utils";
import { useNovelCharacterMutations } from "./hooks/useNovelCharacterMutations";

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
  const [basicForm, setBasicForm] = useState({
    title: "",
    description: "",
    worldId: "",
    status: "draft" as "draft" | "published",
    writingMode: "original" as "original" | "continuation",
    continuationSourceType: "novel" as "novel" | "knowledge_document",
    sourceNovelId: "",
    sourceKnowledgeDocumentId: "",
    continuationBookAnalysisId: "",
    continuationBookAnalysisSections: [] as BookAnalysisSectionKey[],
  });
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
  });
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [reviewResult, setReviewResult] = useState<{
    score: QualityScore;
    issues: ReviewIssue[];
  } | null>(null);
  const [pipelineMessage, setPipelineMessage] = useState("");
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

  const baseCharacterListQuery = useQuery({
    queryKey: queryKeys.baseCharacters.all,
    queryFn: () => getBaseCharacterList(),
  });

  const worldListQuery = useQuery({
    queryKey: queryKeys.worlds.all,
    queryFn: getWorldList,
  });

  const sourceNovelListQuery = useQuery({
    queryKey: ["novels", "source-options", 200],
    queryFn: async () => {
      const firstPage = await getNovelList({ page: 1, limit: 100 });
      const firstItems = firstPage.data?.items ?? [];
      const totalPages = firstPage.data?.totalPages ?? 1;
      if (totalPages <= 1) {
        return firstItems;
      }
      const secondPage = await getNovelList({ page: 2, limit: 100 });
      return [...firstItems, ...(secondPage.data?.items ?? [])];
    },
  });

  const sourceKnowledgeListQuery = useQuery({
    queryKey: ["knowledge", "source-options"],
    queryFn: async () => {
      const response = await listKnowledgeDocuments({ status: "enabled" });
      return response.data ?? [];
    },
  });

  const sourceBookAnalysesQuery = useQuery({
    queryKey: [
      "book-analysis",
      "continuation-source-options",
      basicForm.continuationSourceType,
      basicForm.sourceNovelId,
      basicForm.sourceKnowledgeDocumentId,
    ],
    enabled: (
      basicForm.writingMode === "continuation"
      && (
        (basicForm.continuationSourceType === "novel" && Boolean(basicForm.sourceNovelId))
        || (basicForm.continuationSourceType === "knowledge_document" && Boolean(basicForm.sourceKnowledgeDocumentId))
      )
    ),
    queryFn: async () => {
      if (basicForm.continuationSourceType === "knowledge_document") {
        if (!basicForm.sourceKnowledgeDocumentId) {
          return [] as BookAnalysis[];
        }
        const response = await listBookAnalyses({
          documentId: basicForm.sourceKnowledgeDocumentId,
          status: "succeeded",
        });
        return (response.data ?? []).sort((a, b) => {
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
      }

      if (!basicForm.sourceNovelId) {
        return [] as BookAnalysis[];
      }
      const bindingResponse = await getNovelKnowledgeDocuments(basicForm.sourceNovelId);
      const documentIds = Array.from(new Set((bindingResponse.data ?? []).map((item) => item.id)));
      if (documentIds.length === 0) {
        return [] as BookAnalysis[];
      }
      const responses = await Promise.all(
        documentIds.map((documentId) => listBookAnalyses({ documentId, status: "succeeded" })),
      );
      const merged = new Map<string, BookAnalysis>();
      for (const response of responses) {
        for (const item of response.data ?? []) {
          merged.set(item.id, item);
        }
      }
      return Array.from(merged.values()).sort((a, b) => {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    },
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
  const sourceNovelOptions = useMemo(
    () => (sourceNovelListQuery.data ?? [])
      .filter((item) => item.id !== id)
      .map((item) => ({ id: item.id, title: item.title })),
    [id, sourceNovelListQuery.data],
  );
  const sourceKnowledgeOptions = useMemo(
    () => (sourceKnowledgeListQuery.data ?? [])
      .map((item) => ({ id: item.id, title: item.title })),
    [sourceKnowledgeListQuery.data],
  );
  const sourceNovelBookAnalysisOptions = useMemo(
    () => (sourceBookAnalysesQuery.data ?? [])
      .map((item) => ({
        id: item.id,
        title: item.title,
        documentTitle: item.documentTitle,
        documentVersionNumber: item.documentVersionNumber,
      })),
    [sourceBookAnalysesQuery.data],
  );
  const qualitySummary = qualityReportQuery.data?.data?.summary;

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

  const saveBasicMutation = useMutation({
    mutationFn: () =>
      updateNovel(id, {
        title: basicForm.title,
        description: basicForm.description,
        worldId: basicForm.worldId || null,
        status: basicForm.status,
        writingMode: basicForm.writingMode,
        sourceNovelId: basicForm.writingMode === "continuation" && basicForm.continuationSourceType === "novel"
          ? (basicForm.sourceNovelId || null)
          : null,
        sourceKnowledgeDocumentId: basicForm.writingMode === "continuation" && basicForm.continuationSourceType === "knowledge_document"
          ? (basicForm.sourceKnowledgeDocumentId || null)
          : null,
        continuationBookAnalysisId: basicForm.writingMode === "continuation"
          && (
            (basicForm.continuationSourceType === "novel" && Boolean(basicForm.sourceNovelId))
            || (basicForm.continuationSourceType === "knowledge_document" && Boolean(basicForm.sourceKnowledgeDocumentId))
          )
          ? (basicForm.continuationBookAnalysisId || null)
          : null,
        continuationBookAnalysisSections:
          basicForm.writingMode === "continuation"
            && (
              (basicForm.continuationSourceType === "novel" && Boolean(basicForm.sourceNovelId))
              || (basicForm.continuationSourceType === "knowledge_document" && Boolean(basicForm.sourceKnowledgeDocumentId))
            )
            && basicForm.continuationBookAnalysisId
            ? (basicForm.continuationBookAnalysisSections.length > 0 ? basicForm.continuationBookAnalysisSections : null)
            : null,
      }),
    onSuccess: async () => {
      await invalidateNovelDetail();
      if (!hasCharacters) {
        setActiveTab("character");
      }
    },
  });

  const saveOutlineMutation = useMutation({
    mutationFn: () => updateNovel(id, { outline: outlineText }),
    onSuccess: invalidateNovelDetail,
  });

  const saveStructuredMutation = useMutation({
    mutationFn: () => updateNovel(id, { structuredOutline: structuredDraftText }),
    onSuccess: invalidateNovelDetail,
  });

  const optimizeOutlineMutation = useMutation({
    mutationFn: (payload: { mode: "full" | "selection"; selectedText?: string }) =>
      optimizeNovelOutlinePreview(id, {
        currentDraft: outlineText,
        instruction: outlineOptimizeInstruction,
        mode: payload.mode,
        selectedText: payload.selectedText,
        provider: llm.provider,
        model: llm.model,
        temperature: llm.temperature,
      }),
    onSuccess: (response) => {
      setOutlineOptimizePreview(response.data?.optimizedDraft ?? "");
      setOutlineOptimizeMode(response.data?.mode ?? "full");
      setOutlineOptimizeSourceText(response.data?.selectedText ?? "");
    },
  });

  const optimizeStructuredMutation = useMutation({
    mutationFn: (payload: { mode: "full" | "selection"; selectedText?: string }) =>
      optimizeNovelStructuredOutlinePreview(id, {
        currentDraft: structuredDraftText,
        instruction: structuredOptimizeInstruction,
        mode: payload.mode,
        selectedText: payload.selectedText,
        provider: llm.provider,
        model: llm.model,
        temperature: llm.temperature,
      }),
    onSuccess: (response) => {
      setStructuredOptimizePreview(response.data?.optimizedDraft ?? "");
      setStructuredOptimizeMode(response.data?.mode ?? "full");
      setStructuredOptimizeSourceText(response.data?.selectedText ?? "");
    },
  });

  const batchCreateMutation = useMutation({
    mutationFn: async () => {
      if (structuredVolumes.length === 0) {
        return;
      }
      const chapterList = structuredVolumes.flatMap((volume) => volume.chapters ?? []);
      await Promise.all(
        chapterList.map((chapter) =>
          createNovelChapter(id, {
            title: chapter.title,
            order: chapter.order,
            content: "",
            expectation: chapter.summary,
          })),
      );
    },
    onSuccess: invalidateNovelDetail,
  });

  const createChapterMutation = useMutation({
    mutationFn: () =>
      createNovelChapter(id, {
        title: `新章节${((novelDetailQuery.data?.data?.chapters?.length ?? 0) + 1).toString()}`,
        order: (novelDetailQuery.data?.data?.chapters?.length ?? 0) + 1,
        content: "",
      }),
    onSuccess: async (response) => {
      if (response.data?.id) {
        setSelectedChapterId(response.data.id);
      }
      await invalidateNovelDetail();
    },
  });

  const runPipelineMutation = useMutation({
    mutationFn: () =>
      runNovelPipeline(id, {
        startOrder: pipelineForm.startOrder,
        endOrder: pipelineForm.endOrder,
        maxRetries: pipelineForm.maxRetries,
        provider: llm.provider,
        model: llm.model,
        temperature: llm.temperature,
      }),
    onSuccess: async (response) => {
      if (response.data?.id) {
        setCurrentJobId(response.data.id);
      }
      setPipelineMessage(response.message ?? "批量任务已启动。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.pipelineJob(id, response.data?.id ?? "none") });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      reviewNovelChapter(id, selectedChapterId, {
        provider: llm.provider,
        model: llm.model,
        temperature: 0.1,
      }),
    onSuccess: async (response) => {
      setReviewResult(response.data ?? null);
      setPipelineMessage("章节审校完成。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.qualityReport(id) });
    },
  });

  const hookMutation = useMutation({
    mutationFn: () =>
      generateChapterHook(id, {
        chapterId: selectedChapterId || undefined,
        provider: llm.provider,
        model: llm.model,
        temperature: llm.temperature,
      }),
    onSuccess: async () => {
      setPipelineMessage("章节钩子已生成。");
      await invalidateNovelDetail();
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

  const startOutlineGeneration = () => {
    if (!hasCharacters) {
      const confirmed = window.confirm("当前小说还没有角色。继续生成发展走向会降低后续一致性，是否继续？");
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

  const basicTab = {
    basicForm,
    worldOptions: worldListQuery.data?.data ?? [],
    sourceNovelOptions,
    sourceKnowledgeOptions,
    sourceNovelBookAnalysisOptions,
    isLoadingSourceNovelBookAnalyses: sourceBookAnalysesQuery.isLoading,
    availableBookAnalysisSections: [...BOOK_ANALYSIS_SECTIONS],
    onFormChange: (patch: Partial<typeof basicForm>) => setBasicForm((prev) => {
      const next = { ...prev, ...patch };
      if (next.writingMode === "original") {
        next.sourceNovelId = "";
        next.sourceKnowledgeDocumentId = "";
        next.continuationBookAnalysisId = "";
        next.continuationBookAnalysisSections = [];
      } else if (next.continuationSourceType === "novel") {
        next.sourceKnowledgeDocumentId = "";
      } else if (next.continuationSourceType === "knowledge_document") {
        next.sourceNovelId = "";
      }
      if (
        patch.continuationSourceType !== undefined
        && patch.continuationSourceType !== prev.continuationSourceType
      ) {
        next.continuationBookAnalysisId = "";
        next.continuationBookAnalysisSections = [];
      }
      if (
        next.continuationSourceType === "novel"
        && patch.sourceNovelId !== undefined
        && patch.sourceNovelId !== prev.sourceNovelId
      ) {
        next.continuationBookAnalysisId = "";
        next.continuationBookAnalysisSections = [];
      }
      if (
        next.continuationSourceType === "knowledge_document"
        && patch.sourceKnowledgeDocumentId !== undefined
        && patch.sourceKnowledgeDocumentId !== prev.sourceKnowledgeDocumentId
      ) {
        next.continuationBookAnalysisId = "";
        next.continuationBookAnalysisSections = [];
      }
      if (patch.continuationBookAnalysisId !== undefined && !patch.continuationBookAnalysisId) {
        next.continuationBookAnalysisSections = [];
      }
      return next;
    }),
    onSave: () => saveBasicMutation.mutate(),
    isSaving: saveBasicMutation.isPending,
  };
  const outlineTab = { worldInjectionSummary, hasCharacters, isGenerating: outlineSSE.isStreaming, streamContent: outlineSSE.content, onGenerate: startOutlineGeneration, onStop: outlineSSE.abort, onAbortStream: outlineSSE.abort, onGoToCharacterTab: goToCharacterTab, generationPrompt: outlineGenerationPrompt, onGenerationPromptChange: setOutlineGenerationPrompt, draftText: outlineText, onDraftTextChange: setOutlineText, onSave: () => saveOutlineMutation.mutate(), isSaving: saveOutlineMutation.isPending, optimizeInstruction: outlineOptimizeInstruction, onOptimizeInstructionChange: setOutlineOptimizeInstruction, onOptimizeFull: () => { setOutlineOptimizeMode("full"); setOutlineOptimizeSourceText(""); optimizeOutlineMutation.mutate({ mode: "full" }); }, onOptimizeSelection: (selectedText: string) => { setOutlineOptimizeMode("selection"); setOutlineOptimizeSourceText(selectedText); optimizeOutlineMutation.mutate({ mode: "selection", selectedText }); }, isOptimizing: optimizeOutlineMutation.isPending, optimizePreview: outlineOptimizePreview, onApplyOptimizePreview: () => { if (outlineOptimizeMode === "selection" && outlineOptimizeSourceText.trim()) { setOutlineText((prev) => replaceFirstOccurrence(prev, outlineOptimizeSourceText, outlineOptimizePreview)); } else { setOutlineText(outlineOptimizePreview); } setOutlineOptimizePreview(""); setOutlineOptimizeSourceText(""); setOutlineOptimizeMode("full"); }, onCancelOptimizePreview: () => { setOutlineOptimizePreview(""); setOutlineOptimizeSourceText(""); setOutlineOptimizeMode("full"); } };
  const structuredTab = { worldInjectionSummary, hasCharacters, isGenerating: structuredSSE.isStreaming, streamContent: structuredSSE.content, onGenerate: () => void structuredSSE.start(`/novels/${id}/structured-outline/generate`, { provider: llm.provider, model: llm.model }), onStop: structuredSSE.abort, onAbortStream: structuredSSE.abort, onGoToCharacterTab: goToCharacterTab, onResyncChapters: () => batchCreateMutation.mutate(), isResyncing: batchCreateMutation.isPending, draftText: structuredDraftText, onDraftTextChange: setStructuredDraftText, onSave: () => saveStructuredMutation.mutate(), isSaving: saveStructuredMutation.isPending, optimizeInstruction: structuredOptimizeInstruction, onOptimizeInstructionChange: setStructuredOptimizeInstruction, onOptimizeFull: () => { setStructuredOptimizeMode("full"); setStructuredOptimizeSourceText(""); optimizeStructuredMutation.mutate({ mode: "full" }); }, onOptimizeSelection: (selectedText: string) => { setStructuredOptimizeMode("selection"); setStructuredOptimizeSourceText(selectedText); optimizeStructuredMutation.mutate({ mode: "selection", selectedText }); }, isOptimizing: optimizeStructuredMutation.isPending, optimizePreview: structuredOptimizePreview, onApplyOptimizePreview: () => { if (structuredOptimizeMode === "selection" && structuredOptimizeSourceText.trim()) { setStructuredDraftText((prev) => replaceFirstOccurrence(prev, structuredOptimizeSourceText, structuredOptimizePreview)); } else { setStructuredDraftText(structuredOptimizePreview); } setStructuredOptimizePreview(""); setStructuredOptimizeSourceText(""); setStructuredOptimizeMode("full"); }, onCancelOptimizePreview: () => { setStructuredOptimizePreview(""); setStructuredOptimizeSourceText(""); setStructuredOptimizeMode("full"); }, structuredVolumes };
  const chapterTab = { novelId: id, worldInjectionSummary, hasCharacters, chapters, selectedChapterId, selectedChapter, onSelectChapter: setSelectedChapterId, onGoToCharacterTab: goToCharacterTab, onCreateChapter: () => createChapterMutation.mutate(), isCreatingChapter: createChapterMutation.isPending, onGenerateSelectedChapter: handleGenerateSelectedChapter, streamContent: chapterSSE.content, isStreaming: chapterSSE.isStreaming, onAbortStream: chapterSSE.abort };
  const pipelineTab = { novelId: id, worldInjectionSummary, hasCharacters, onGoToCharacterTab: goToCharacterTab, pipelineForm, onPipelineFormChange: (field: "startOrder" | "endOrder" | "maxRetries", value: number) => setPipelineForm((prev) => ({ ...prev, [field]: value })), maxOrder, onGenerateBible: () => void bibleSSE.start(`/novels/${id}/bible/generate`, { provider: llm.provider, model: llm.model, temperature: 0.6 }), onAbortBible: bibleSSE.abort, isBibleStreaming: bibleSSE.isStreaming, bibleStreamContent: bibleSSE.content, onGenerateBeats: () => void beatsSSE.start(`/novels/${id}/beats/generate`, { provider: llm.provider, model: llm.model, targetChapters: pipelineForm.endOrder }), onAbortBeats: beatsSSE.abort, isBeatsStreaming: beatsSSE.isStreaming, beatsStreamContent: beatsSSE.content, onRunPipeline: () => runPipelineMutation.mutate(), isRunningPipeline: runPipelineMutation.isPending, pipelineMessage, pipelineJob: pipelineJobQuery.data?.data, chapters, selectedChapterId, onSelectedChapterChange: setSelectedChapterId, onReviewChapter: () => reviewMutation.mutate(), isReviewing: reviewMutation.isPending, onRepairChapter: () => { setRepairBeforeContent(selectedChapter?.content ?? ""); setRepairAfterContent(""); void repairSSE.start(`/novels/${id}/chapters/${selectedChapterId}/repair`, { provider: llm.provider, model: llm.model, reviewIssues: reviewResult?.issues ?? [] }); }, isRepairing: repairSSE.isStreaming, onGenerateHook: () => hookMutation.mutate(), isGeneratingHook: hookMutation.isPending, reviewResult, repairBeforeContent, repairAfterContent, repairStreamContent: repairSSE.content, isRepairStreaming: repairSSE.isStreaming, onAbortRepair: repairSSE.abort, qualitySummary, chapterReports: qualityReportQuery.data?.data?.chapterReports ?? [], bible, plotBeats };
  const characterTab = { characterMessage, quickCharacterForm, onQuickCharacterFormChange: (field: "name" | "role", value: string) => setQuickCharacterForm((prev) => ({ ...prev, [field]: value })), onQuickCreateCharacter: () => quickCreateCharacterMutation.mutate(), isQuickCreating: quickCreateCharacterMutation.isPending, characters, coreCharacterCount, baseCharacters, selectedBaseCharacterId, onSelectedBaseCharacterChange: setSelectedBaseCharacterId, selectedBaseCharacter, importedBaseCharacterIds, onImportBaseCharacter: () => importBaseCharacterMutation.mutate(), isImportingBaseCharacter: importBaseCharacterMutation.isPending, selectedCharacterId, onSelectedCharacterChange: setSelectedCharacterId, onDeleteCharacter: (characterId: string) => deleteCharacterMutation.mutate(characterId), isDeletingCharacter: deleteCharacterMutation.isPending, deletingCharacterId: deleteCharacterMutation.variables ?? "", onSyncTimeline: () => syncTimelineMutation.mutate(), isSyncingTimeline: syncTimelineMutation.isPending, onSyncAllTimeline: () => syncAllTimelineMutation.mutate(), isSyncingAllTimeline: syncAllTimelineMutation.isPending, onEvolveCharacter: () => evolveCharacterMutation.mutate(), isEvolvingCharacter: evolveCharacterMutation.isPending, onWorldCheck: () => worldCheckMutation.mutate(), isCheckingWorld: worldCheckMutation.isPending, selectedCharacter, characterForm, onCharacterFormChange: (field: "name" | "role" | "personality" | "background" | "development" | "currentState" | "currentGoal", value: string) => setCharacterForm((prev) => ({ ...prev, [field]: value })), onSaveCharacter: () => saveCharacterMutation.mutate(), isSavingCharacter: saveCharacterMutation.isPending, timelineEvents: characterTimelineQuery.data?.data ?? [] };

  return <NovelEditView id={id} activeTab={activeTab} onActiveTabChange={setActiveTab} basicTab={basicTab} outlineTab={outlineTab} structuredTab={structuredTab} chapterTab={chapterTab} pipelineTab={pipelineTab} characterTab={characterTab} />;
}
