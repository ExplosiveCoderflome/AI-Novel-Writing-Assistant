import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BookAnalysisPreset,
  BookAnalysisSectionKey,
  BookAnalysisStatus,
} from "@ai-novel/shared/types/bookAnalysis";
import { BOOK_ANALYSIS_PRESETS } from "@ai-novel/shared/types/bookAnalysis";
import { useSearchParams } from "react-router-dom";
import {
  archiveBookAnalysis,
  copyBookAnalysis,
  createBookAnalysis,
  downloadBookAnalysisExport,
  getBookAnalysis,
  listBookAnalyses,
  rebuildBookAnalysis,
  regenerateBookAnalysisSection,
} from "@/api/bookAnalysis";
import { getKnowledgeDocument, getKnowledgeDocumentVersionChapters, listKnowledgeDocuments } from "@/api/knowledge";
import { exportNovelAsKnowledgeDocument, getNovelList } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
import type { LLMConfigState } from "../bookAnalysis.types";
import { createDownload } from "../bookAnalysis.utils";
import type { BookAnalysisMode, BookAnalysisSourceRangeDraft, BookAnalysisWorkspace, ExportFormat, NovelOption } from "./bookAnalysisWorkspace.types";
import { useAnalysisBudget } from "./actions/useAnalysisBudget";
import { useAnalysisPublishing } from "./actions/useAnalysisPublishing";
import { useAnalysisCharacters } from "./character/useAnalysisCharacters";
import { useSectionDrafts } from "./drafts/useSectionDrafts";

const DIAGNOSIS_FOCUS_INSTRUCTION = "请从作者自检角度诊断当前稿子，优先指出节奏断点、人物模糊点、主题表达不清、伏笔回收风险和后续改稿优先级。";

function buildNovelOptions(items: Array<{ id: string; title: string }>): NovelOption[] {
  return items.map((item) => ({ id: item.id, title: item.title }));
}

export function useBookAnalysisWorkspace(): BookAnalysisWorkspace {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const llmStore = useLLMStore();

  const [keyword, setKeyword] = useState("");
  const [analysisMode, setAnalysisModeState] = useState<BookAnalysisMode>(
    searchParams.get("mode") === "diagnosis" ? "diagnosis" : "reference",
  );
  const [status, setStatus] = useState<BookAnalysisStatus | "">("");
  const [selectedAnalysisId, setSelectedAnalysisId] = useState(searchParams.get("analysisId") ?? "");
  const [selectedDocumentId, setSelectedDocumentId] = useState(searchParams.get("documentId") ?? "");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [selectedNovelId, setSelectedNovelId] = useState("");
  const [selectedDiagnosisNovelId, setSelectedDiagnosisNovelId] = useState("");
  const [userFocusInstruction, setUserFocusInstruction] = useState("");
  const [selectedSourceRange, setSelectedSourceRange] = useState<BookAnalysisSourceRangeDraft>(null);
  const [budgetTokens, setBudgetTokens] = useState<number | null>(null);
  const [sourceChaptersRequested, setSourceChaptersRequested] = useState(false);
  const [analysisPreset, setAnalysisPreset] = useState<BookAnalysisPreset>("standard");
  const [llmConfig, setLlmConfig] = useState<LLMConfigState>({
    provider: llmStore.provider,
    model: llmStore.model,
    temperature: llmStore.temperature,
    maxTokens: llmStore.maxTokens,
  });

  const listKey = useMemo(
    () => `${keyword.trim()}-${status || "all"}`,
    [keyword, status],
  );

  const analysesQuery = useQuery({
    queryKey: queryKeys.bookAnalysis.list(listKey),
    queryFn: () =>
      listBookAnalyses({
        keyword: keyword.trim() || undefined,
        status: status || undefined,
      }),
    refetchInterval: (query) => {
      const rows = query.state.data?.data ?? [];
      return rows.some((item) => item.status === "queued" || item.status === "running") ? 4000 : false;
    },
  });

  const documentsQuery = useQuery({
    queryKey: queryKeys.knowledge.documents("book-analysis-source"),
    queryFn: () => listKnowledgeDocuments(),
  });

  const novelsQuery = useQuery({
    queryKey: queryKeys.novels.list(1, 100),
    queryFn: () => getNovelList({ page: 1, limit: 100 }),
  });

  const sourceDocumentQuery = useQuery({
    queryKey: queryKeys.knowledge.detail(selectedDocumentId || "none"),
    queryFn: () => getKnowledgeDocument(selectedDocumentId),
    enabled: Boolean(selectedDocumentId),
    retry: (failureCount, error) => {
      const responseStatus = (error as { response?: { status?: number } })?.response?.status;
      if (responseStatus === 404) {
        return false;
      }
      return failureCount < 2;
    },
  });

  const detailQuery = useQuery({
    queryKey: queryKeys.bookAnalysis.detail(selectedAnalysisId || "none"),
    queryFn: () => getBookAnalysis(selectedAnalysisId),
    enabled: Boolean(selectedAnalysisId),
    retry: (failureCount, error) => {
      const responseStatus = (error as { response?: { status?: number } })?.response?.status;
      if (responseStatus === 404) {
        return false;
      }
      return failureCount < 2;
    },
    refetchInterval: (query) => {
      const nextStatus = query.state.data?.data?.status;
      return nextStatus === "queued" || nextStatus === "running" ? 4000 : false;
    },
  });

  const analyses = analysesQuery.data?.data ?? [];
  const selectedAnalysis = detailQuery.data?.data;
  const sourceDocument = sourceDocumentQuery.data?.data;
  const selectedSourceVersionId = selectedVersionId || sourceDocument?.activeVersionId || sourceDocument?.versions[0]?.id || "";

  const documentChaptersQuery = useQuery({
    queryKey: queryKeys.knowledge.chapters(
      selectedAnalysis?.documentId || "none",
      selectedAnalysis?.documentVersionId || "none",
    ),
    queryFn: () => getKnowledgeDocumentVersionChapters(selectedAnalysis!.documentId, selectedAnalysis!.documentVersionId),
    enabled: Boolean(selectedAnalysis?.documentId && selectedAnalysis?.documentVersionId),
  });

  const sourceChaptersQuery = useQuery({
    queryKey: queryKeys.knowledge.chapters(selectedDocumentId || "none", selectedSourceVersionId || "none"),
    queryFn: () => getKnowledgeDocumentVersionChapters(selectedDocumentId, selectedSourceVersionId),
    enabled: analysisMode === "reference" && sourceChaptersRequested && Boolean(selectedDocumentId && selectedSourceVersionId),
  });
  const documentOptions = documentsQuery.data?.data ?? [];
  const novelOptions = useMemo(() => buildNovelOptions(novelsQuery.data?.data?.items ?? []), [novelsQuery.data?.data?.items]);
  const sourceVersionContent = useMemo(() => {
    if (!selectedAnalysis || !sourceDocument) {
      return "";
    }
    return sourceDocument.versions.find((version) => version.id === selectedAnalysis.documentVersionId)?.content ?? "";
  }, [selectedAnalysis, sourceDocument]);
  const documentChapters = documentChaptersQuery.data?.data?.chapters ?? [];
  const sourceChapters = sourceChaptersQuery.data?.data?.chapters ?? [];
  const sourceChaptersError = sourceChaptersQuery.error instanceof Error
    ? sourceChaptersQuery.error.message
    : sourceChaptersQuery.error
      ? "章节范围加载失败。"
      : "";
  const versionOptions = sourceDocumentQuery.data?.data?.versions ?? [];
  const selectedPreset = useMemo(
    () => BOOK_ANALYSIS_PRESETS.find((preset) => preset.key === analysisPreset) ?? BOOK_ANALYSIS_PRESETS[1],
    [analysisPreset],
  );
  const includeTimeline = selectedPreset.sectionKeys.includes("timeline");
  const setIncludeTimeline = (include: boolean) => setAnalysisPreset(include ? "complete" : "standard");

  const aggregatedEvidence = useMemo(() => {
    if (!selectedAnalysis) {
      return [];
    }
    return selectedAnalysis.sections.flatMap((section) =>
      section.evidence.map((item) => ({
        ...item,
        sectionKey: section.sectionKey,
        sectionTitle: section.title,
      })),
    );
  }, [selectedAnalysis]);

  const refreshAnalysisData = async (analysisId: string) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.bookAnalysis.list(listKey) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.documents("book-analysis-source") });
    if (selectedDocumentId) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.detail(selectedDocumentId) });
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.bookAnalysis.detail(analysisId) });
  };

  const sectionDraftsState = useSectionDrafts({
    selectedAnalysis,
    refreshAnalysisData,
  });
  const charactersState = useAnalysisCharacters({
    selectedAnalysis,
    selectedAnalysisId,
  });
  const budgetState = useAnalysisBudget({
    selectedAnalysisId,
    refreshAnalysisData,
    onAnalysisUpdated: sectionDraftsState.setDraftsFromAnalysis,
  });
  const publishingState = useAnalysisPublishing({
    selectedAnalysis,
    selectedAnalysisId,
    selectedNovelId,
    selectedDocumentId,
    llmConfig,
    refreshAnalysisData,
  });

  const setAnalysisMode = (mode: BookAnalysisMode) => {
    setAnalysisModeState(mode);
    setSelectedSourceRange(null);
    setSourceChaptersRequested(false);
    if (mode === "diagnosis") {
      setSelectedDocumentId("");
      setSelectedVersionId("");
    }
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (mode === "diagnosis") {
        next.set("mode", "diagnosis");
        next.delete("documentId");
      } else {
        next.delete("mode");
      }
      return next;
    });
  };

  const openAnalysis = (analysisId: string, documentId: string, mode: BookAnalysisMode = analysisMode) => {
    setSelectedAnalysisId(analysisId);
    setSelectedDocumentId(documentId);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("analysisId", analysisId);
      next.set("documentId", documentId);
      if (mode === "diagnosis") {
        next.set("mode", "diagnosis");
      } else {
        next.delete("mode");
      }
      return next;
    });
  };

  const createMutation = useMutation({
    mutationFn: createBookAnalysis,
    onSuccess: async (response) => {
      const created = response.data;
      if (!created) {
        return;
      }
      sectionDraftsState.setDraftsFromAnalysis(created);
      openAnalysis(created.id, created.documentId, "reference");
      await queryClient.invalidateQueries({ queryKey: queryKeys.bookAnalysis.list(listKey) });
    },
  });

  const createDiagnosisMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDiagnosisNovelId) {
        return null;
      }
      const documentResponse = await exportNovelAsKnowledgeDocument(selectedDiagnosisNovelId);
      const document = documentResponse.data;
      if (!document) {
        throw new Error("小说正文导出失败。");
      }
      const analysisResponse = await createBookAnalysis({
        documentId: document.id,
        versionId: document.activeVersionId || undefined,
        provider: llmConfig.provider,
        model: llmConfig.model || undefined,
        temperature: llmConfig.temperature,
        maxTokens: llmConfig.maxTokens,
        budgetTokens: budgetTokens ?? undefined,
        userFocusInstruction: userFocusInstruction.trim() || DIAGNOSIS_FOCUS_INSTRUCTION,
        includeTimeline,
        enabledSectionKeys: selectedPreset.sectionKeys,
      });
      return {
        document,
        analysis: analysisResponse.data,
      };
    },
    onSuccess: async (result) => {
      if (!result?.analysis) {
        return;
      }
      setAnalysisModeState("diagnosis");
      setSelectedDocumentId(result.document.id);
      setSelectedVersionId(result.document.activeVersionId ?? "");
      sectionDraftsState.setDraftsFromAnalysis(result.analysis);
      openAnalysis(result.analysis.id, result.document.id, "diagnosis");
      await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.documents("book-analysis-source") });
      await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.detail(result.document.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.bookAnalysis.list(listKey) });
      toast.success("已导出小说正文并创建诊断拆书。");
    },
  });

  const copyMutation = useMutation({
    mutationFn: copyBookAnalysis,
    onSuccess: async (response) => {
      const copied = response.data;
      if (!copied) {
        return;
      }
      sectionDraftsState.setDraftsFromAnalysis(copied);
      openAnalysis(copied.id, copied.documentId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.bookAnalysis.list(listKey) });
    },
  });

  const rebuildMutation = useMutation({
    mutationFn: rebuildBookAnalysis,
    onSuccess: async (response) => {
      if (!response.data) {
        return;
      }
      sectionDraftsState.setDraftsFromAnalysis(response.data);
      await refreshAnalysisData(response.data.id);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: archiveBookAnalysis,
    onSuccess: async (response) => {
      if (!response.data) {
        return;
      }
      await refreshAnalysisData(response.data.id);
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: (payload: { id: string; sectionKey: BookAnalysisSectionKey; focusInstruction?: string | null }) =>
      regenerateBookAnalysisSection(payload.id, payload.sectionKey, { focusInstruction: payload.focusInstruction }),
    onSuccess: async (response) => {
      if (!response.data) {
        return;
      }
      await refreshAnalysisData(response.data.id);
    },
  });

  useEffect(() => {
    const nextAnalysisId = searchParams.get("analysisId");
    const nextDocumentId = searchParams.get("documentId");
    const nextMode = searchParams.get("mode") === "diagnosis" ? "diagnosis" : "reference";
    if (nextMode !== analysisMode) {
      setAnalysisModeState(nextMode);
    }
    if (nextAnalysisId && nextAnalysisId !== selectedAnalysisId) {
      setSelectedAnalysisId(nextAnalysisId);
    }
    if (nextDocumentId && nextDocumentId !== selectedDocumentId) {
      setSelectedDocumentId(nextDocumentId);
    }
  }, [analysisMode, searchParams, selectedAnalysisId, selectedDocumentId]);

  useEffect(() => {
    if (!selectedDocumentId) {
      return;
    }
    const responseStatus = (sourceDocumentQuery.error as { response?: { status?: number } } | null)?.response?.status;
    if (responseStatus !== 404) {
      return;
    }
    setSelectedDocumentId("");
    setSelectedVersionId("");
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("documentId");
      return next;
    });
  }, [selectedDocumentId, setSearchParams, sourceDocumentQuery.error]);

  useEffect(() => {
    if (!selectedAnalysisId) {
      return;
    }
    const responseStatus = (detailQuery.error as { response?: { status?: number } } | null)?.response?.status;
    if (responseStatus !== 404) {
      return;
    }
    setSelectedAnalysisId("");
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("analysisId");
      return next;
    });
  }, [detailQuery.error, selectedAnalysisId, setSearchParams]);

  useEffect(() => {
    const document = sourceDocumentQuery.data?.data;
    if (!selectedDocumentId || !document) {
      return;
    }
    const currentOptions = document.versions.map((item) => item.id);
    const fallbackVersionId = document.activeVersionId || document.versions[0]?.id || "";
    setSelectedVersionId((current) => (currentOptions.includes(current) ? current : fallbackVersionId));
  }, [selectedDocumentId, sourceDocumentQuery.data?.data]);

  useEffect(() => {
    if (selectedNovelId || novelOptions.length === 0) {
      return;
    }
    setSelectedNovelId(novelOptions[0].id);
  }, [novelOptions, selectedNovelId]);

  useEffect(() => {
    if (selectedDiagnosisNovelId || novelOptions.length === 0) {
      return;
    }
    setSelectedDiagnosisNovelId(novelOptions[0].id);
  }, [novelOptions, selectedDiagnosisNovelId]);

  useEffect(() => {
    if (selectedAnalysisId || analyses.length === 0) {
      return;
    }
    const next = analyses[0];
    setSelectedAnalysisId(next.id);
    setSearchParams((prev) => {
      const nextParams = new URLSearchParams(prev);
      nextParams.set("analysisId", next.id);
      nextParams.set("documentId", next.documentId);
      return nextParams;
    });
  }, [analyses, selectedAnalysisId, setSearchParams]);

  const selectDocument = (documentId: string) => {
    setAnalysisModeState("reference");
    setSelectedDocumentId(documentId);
    setSelectedVersionId("");
    setSelectedSourceRange(null);
    setSourceChaptersRequested(false);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("mode");
      if (documentId) {
        next.set("documentId", documentId);
      } else {
        next.delete("documentId");
      }
      return next;
    });
  };

  const selectVersion = (versionId: string) => {
    setSelectedVersionId(versionId);
    setSelectedSourceRange(null);
    setSourceChaptersRequested(false);
  };

  const requestSourceChapters = () => setSourceChaptersRequested(true);

  const createAnalysis = async () => {
    if (!selectedDocumentId) {
      return;
    }
    await createMutation.mutateAsync({
      documentId: selectedDocumentId,
      versionId: selectedVersionId || undefined,
      provider: llmConfig.provider,
      model: llmConfig.model || undefined,
      temperature: llmConfig.temperature,
      maxTokens: llmConfig.maxTokens,
      budgetTokens: budgetTokens ?? undefined,
      userFocusInstruction: userFocusInstruction.trim() || undefined,
      sourceRange: selectedSourceRange ?? undefined,
      includeTimeline,
      enabledSectionKeys: selectedPreset.sectionKeys,
    });
  };

  const copySelectedAnalysis = async () => {
    if (!selectedAnalysisId) {
      return;
    }
    await copyMutation.mutateAsync(selectedAnalysisId);
  };

  const rebuildAnalysis = (analysisId: string) => {
    rebuildMutation.mutate(analysisId);
  };

  const archiveAnalysis = (analysisId: string) => {
    archiveMutation.mutate(analysisId);
  };

  const regenerateSection = (sectionKey: BookAnalysisSectionKey) => {
    if (!selectedAnalysis) {
      return;
    }
    const section = selectedAnalysis.sections.find((item) => item.sectionKey === sectionKey);
    const draft = section ? sectionDraftsState.getSectionDraft(section) : null;
    regenerateMutation.mutate({
      id: selectedAnalysis.id,
      sectionKey,
      focusInstruction: draft?.focusInstruction.trim() ? draft.focusInstruction : null,
    });
  };

  const createDiagnosisAnalysis = async () => {
    await createDiagnosisMutation.mutateAsync();
  };

  const downloadSelectedAnalysis = async (format: ExportFormat) => {
    if (!selectedAnalysisId) {
      return;
    }
    const exported = await downloadBookAnalysisExport(selectedAnalysisId, format);
    createDownload(exported.blob, exported.fileName);
  };

  return {
    analysisMode,
    keyword,
    status,
    selectedAnalysisId,
    selectedDocumentId,
    selectedVersionId,
    selectedNovelId,
    selectedDiagnosisNovelId,
    userFocusInstruction,
    selectedSourceRange,
    budgetTokens,
    includeTimeline,
    analysisPreset,
    llmConfig,
    sectionDrafts: sectionDraftsState.sectionDrafts,
    publishFeedback: publishingState.publishFeedback,
    styleProfileFeedback: publishingState.styleProfileFeedback,
    lastPublishResult: publishingState.lastPublishResult,
    analyses,
    selectedAnalysis,
    documentOptions,
    novelOptions,
    versionOptions,
    sourceDocument,
    sourceVersionContent,
    documentChapters,
    sourceChapters,
    sourceChaptersRequested,
    sourceChaptersLoading: sourceChaptersQuery.isFetching,
    sourceChaptersError,
    characters: charactersState.characters,
    aggregatedEvidence,
    optimizingSectionKey: sectionDraftsState.optimizingSectionKey,
    pending: {
      create: createMutation.isPending,
      copy: copyMutation.isPending,
      rebuild: rebuildMutation.isPending,
      archive: archiveMutation.isPending,
      regenerate: regenerateMutation.isPending,
      optimizePreview: sectionDraftsState.pending.optimizePreview,
      saveSection: sectionDraftsState.pending.saveSection,
      publish: publishingState.pending.publish,
      createStyleProfile: publishingState.pending.createStyleProfile,
      updateBudget: budgetState.pending.updateBudget,
      resumeWithBudget: budgetState.pending.resumeWithBudget,
      loadCharacters: charactersState.pending.loadCharacters,
      generateCharacters: charactersState.pending.generateCharacters,
      identifyCharacters: charactersState.pending.identifyCharacters,
      generateCharacterProfile: charactersState.pending.generateCharacterProfile,
      generateAllCandidates: charactersState.pending.generateAllCandidates,
      generatingCharacterIds: charactersState.pending.generatingCharacterIds,
      createCharacter: charactersState.pending.createCharacter,
      updateCharacter: charactersState.pending.updateCharacter,
      deleteCharacter: charactersState.pending.deleteCharacter,
      createDiagnosis: createDiagnosisMutation.isPending,
    },
    setKeyword,
    setStatus,
    setAnalysisMode,
    setSelectedNovelId,
    setSelectedDiagnosisNovelId,
    setUserFocusInstruction,
    setSelectedSourceRange,
    setBudgetTokens,
    requestSourceChapters,
    setIncludeTimeline,
    setAnalysisPreset,
    setLlmConfig,
    selectDocument,
    selectVersion,
    openAnalysis,
    createAnalysis,
    createDiagnosisAnalysis,
    copySelectedAnalysis,
    rebuildAnalysis,
    archiveAnalysis,
    regenerateSection,
    optimizeSectionPreview: sectionDraftsState.optimizeSectionPreview,
    applySectionOptimizePreview: sectionDraftsState.applySectionOptimizePreview,
    clearSectionOptimizePreview: sectionDraftsState.clearSectionOptimizePreview,
    saveSection: sectionDraftsState.saveSection,
    downloadSelectedAnalysis,
    publishSelectedAnalysis: publishingState.publishSelectedAnalysis,
    createStyleProfileFromAnalysis: publishingState.createStyleProfileFromAnalysis,
    updateBudget: budgetState.updateBudget,
    resumeWithBudget: budgetState.resumeWithBudget,
    generateCharacters: charactersState.generateCharacters,
    identifyCharacters: charactersState.identifyCharacters,
    generateCharacterProfile: charactersState.generateCharacterProfile,
    generateAllCandidates: charactersState.generateAllCandidates,
    characterBatchSummary: charactersState.batchSummary,
    dismissCharacterBatchSummary: charactersState.dismissBatchSummary,
    createCharacter: charactersState.createCharacter,
    updateCharacter: charactersState.updateCharacter,
    deleteCharacter: charactersState.deleteCharacter,
    updateSectionDraft: sectionDraftsState.updateSectionDraft,
    getSectionDraft: sectionDraftsState.getSectionDraft,
  };
}
