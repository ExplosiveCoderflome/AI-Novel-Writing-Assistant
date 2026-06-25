import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BookAnalysisPreset,
  BookAnalysisPublishResult,
  BookAnalysisSection,
  BookAnalysisSectionKey,
  BookAnalysisStatus,
} from "@ai-novel/shared/types/bookAnalysis";
import type {
  BookAnalysisCharacterDimension,
  BookAnalysisCharacterGenerationDepth,
} from "@ai-novel/shared/types/bookAnalysisCharacter";
import type { CharacterProfile } from "@ai-novel/shared/types/characterProfile";
import { BOOK_ANALYSIS_PRESETS } from "@ai-novel/shared/types/bookAnalysis";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  archiveBookAnalysis,
  copyBookAnalysis,
  createBookAnalysis,
  createBookAnalysisCharacter,
  deleteBookAnalysisCharacter,
  downloadBookAnalysisExport,
  generateBookAnalysisCharacters,
  getBookAnalysis,
  listBookAnalyses,
  listBookAnalysisCharacters,
  optimizeBookAnalysisSectionPreview,
  publishBookAnalysis,
  rebuildBookAnalysis,
  regenerateBookAnalysisSection,
  updateBookAnalysisCharacter,
  updateBookAnalysisSection,
} from "@/api/bookAnalysis";
import { getKnowledgeDocument, getKnowledgeDocumentVersionChapters, listKnowledgeDocuments } from "@/api/knowledge";
import { exportNovelAsKnowledgeDocument, getNovelList } from "@/api/novel";
import { createStyleProfileFromBookAnalysis } from "@/api/styleEngine";
import { queryKeys } from "@/api/queryKeys";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
import type { LLMConfigState, SectionDraft } from "../bookAnalysis.types";
import { buildSectionDraft, createDownload, syncDrafts } from "../bookAnalysis.utils";
import type { BookAnalysisMode, BookAnalysisSourceRangeDraft, BookAnalysisWorkspace, ExportFormat, NovelOption } from "./bookAnalysisWorkspace.types";

const DIAGNOSIS_FOCUS_INSTRUCTION = "请从作者自检角度诊断当前稿子，优先指出节奏断点、人物模糊点、主题表达不清、伏笔回收风险和后续改稿优先级。";

function buildNovelOptions(items: Array<{ id: string; title: string }>): NovelOption[] {
  return items.map((item) => ({ id: item.id, title: item.title }));
}

export function useBookAnalysisWorkspace(): BookAnalysisWorkspace {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
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
  const [sourceChaptersRequested, setSourceChaptersRequested] = useState(false);
  const [analysisPreset, setAnalysisPreset] = useState<BookAnalysisPreset>("standard");
  const [llmConfig, setLlmConfig] = useState<LLMConfigState>({
    provider: llmStore.provider,
    model: llmStore.model,
    temperature: llmStore.temperature,
    maxTokens: llmStore.maxTokens,
  });
  const [sectionDrafts, setSectionDrafts] = useState<Record<string, SectionDraft>>({});
  const [draftAnalysisId, setDraftAnalysisId] = useState("");
  const [optimizingSectionKey, setOptimizingSectionKey] = useState<BookAnalysisSectionKey | null>(null);
  const [publishFeedback, setPublishFeedback] = useState("");
  const [styleProfileFeedback, setStyleProfileFeedback] = useState("");
  const [lastPublishResult, setLastPublishResult] = useState<BookAnalysisPublishResult | null>(null);

  const listKey = useMemo(
    () => `${keyword.trim()}-${status || "all"}-${selectedDocumentId || "any"}`,
    [keyword, selectedDocumentId, status],
  );

  const analysesQuery = useQuery({
    queryKey: queryKeys.bookAnalysis.list(listKey),
    queryFn: () =>
      listBookAnalyses({
        keyword: keyword.trim() || undefined,
        status: status || undefined,
        documentId: selectedDocumentId || undefined,
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

  const charactersQuery = useQuery({
    queryKey: queryKeys.bookAnalysis.characters(selectedAnalysisId || "none"),
    queryFn: () => listBookAnalysisCharacters(selectedAnalysisId),
    enabled: Boolean(selectedAnalysisId),
  });

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
  const characters = charactersQuery.data?.data ?? [];
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

  const refreshCharacterData = async (analysisId: string) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.bookAnalysis.characters(analysisId) });
  };

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
      setDraftAnalysisId(created.id);
      setSectionDrafts(syncDrafts(created));
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
      setDraftAnalysisId(result.analysis.id);
      setSectionDrafts(syncDrafts(result.analysis));
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
      setDraftAnalysisId(copied.id);
      setSectionDrafts(syncDrafts(copied));
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
      setSectionDrafts(syncDrafts(response.data));
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

  const updateSectionMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      sectionKey: BookAnalysisSectionKey;
      editedContent?: string | null;
      notes?: string | null;
      focusInstruction?: string | null;
      frozen?: boolean;
    }) => updateBookAnalysisSection(payload.id, payload.sectionKey, payload),
    onSuccess: async (response) => {
      if (!response.data) {
        return;
      }
      setDraftAnalysisId(response.data.id);
      setSectionDrafts(syncDrafts(response.data));
      await refreshAnalysisData(response.data.id);
    },
  });

  const optimizePreviewMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      sectionKey: BookAnalysisSectionKey;
      currentDraft: string;
      instruction: string;
    }) => optimizeBookAnalysisSectionPreview(payload.id, payload.sectionKey, payload),
    onSuccess: (response, payload) => {
      const optimizedDraft = response.data?.optimizedDraft;
      if (!optimizedDraft || !selectedAnalysis) {
        return;
      }
      const section = selectedAnalysis.sections.find((item) => item.sectionKey === payload.sectionKey);
      if (!section) {
        return;
      }
      setSectionDrafts((prev) => ({
        ...prev,
        [section.id]: {
          ...(prev[section.id] ?? buildSectionDraft(section)),
          optimizePreview: optimizedDraft,
        },
      }));
    },
    onSettled: () => {
      setOptimizingSectionKey(null);
    },
  });

  const publishMutation = useMutation({
    mutationFn: (payload: { id: string; novelId: string }) =>
      publishBookAnalysis(payload.id, { novelId: payload.novelId }),
    onSuccess: async (response, payload) => {
      const published = response.data;
      if (!published) {
        return;
      }
      setLastPublishResult(published);
      setPublishFeedback(
        `发布完成：文档 ${published.knowledgeDocumentId}，版本 v${published.knowledgeDocumentVersionNumber}，绑定 ${published.bindingCount} 项`,
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.documents("book-analysis-source") });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novelsKnowledge.bindings(payload.novelId) });
      await refreshAnalysisData(payload.id);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "发布失败。";
      setLastPublishResult(null);
      setPublishFeedback(message);
    },
  });

  const createStyleProfileMutation = useMutation({
    mutationFn: (payload: { bookAnalysisId: string; name: string }) => createStyleProfileFromBookAnalysis({
      ...payload,
      provider: llmConfig.provider,
      model: llmConfig.model || undefined,
      temperature: llmConfig.temperature,
    }),
    onMutate: () => {
      setStyleProfileFeedback("正在根据拆书里的“文风与技法”生成写法资产，完成后会自动跳转到写法引擎。");
    },
    onSuccess: async (response) => {
      const createdProfile = response.data;
      if (!createdProfile) {
        return;
      }
      setStyleProfileFeedback("");
      toast.success("已从拆书生成写法，正在打开写法引擎。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.styleEngine.profiles });
      navigate(`/style-engine?profileId=${createdProfile.id}&source=book-analysis`);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "从拆书生成写法失败。";
      setStyleProfileFeedback(message);
    },
  });

  const generateCharactersMutation = useMutation({
    mutationFn: (payload: {
      analysisId: string;
      generationDepth: BookAnalysisCharacterGenerationDepth;
      selectedDimensions: BookAnalysisCharacterDimension[];
      characterNames?: string[];
    }) => generateBookAnalysisCharacters(payload.analysisId, {
      generationDepth: payload.generationDepth,
      selectedDimensions: payload.selectedDimensions,
      characterNames: payload.characterNames,
    }),
    onSuccess: async (_response, payload) => {
      await refreshCharacterData(payload.analysisId);
    },
  });

  const createCharacterMutation = useMutation({
    mutationFn: (payload: {
      analysisId: string;
      name: string;
      role: string;
      profile?: Partial<CharacterProfile>;
      generationDepth?: BookAnalysisCharacterGenerationDepth;
      selectedDimensions?: BookAnalysisCharacterDimension[];
    }) => createBookAnalysisCharacter(payload.analysisId, {
      name: payload.name,
      role: payload.role,
      profile: payload.profile,
      generationDepth: payload.generationDepth,
      selectedDimensions: payload.selectedDimensions,
    }),
    onSuccess: async (_response, payload) => {
      await refreshCharacterData(payload.analysisId);
    },
  });

  const updateCharacterMutation = useMutation({
    mutationFn: (payload: {
      analysisId: string;
      characterId: string;
      name?: string;
      role?: string;
      profile?: Partial<CharacterProfile>;
      selectedDimensions?: BookAnalysisCharacterDimension[];
    }) => updateBookAnalysisCharacter(payload.analysisId, payload.characterId, {
      name: payload.name,
      role: payload.role,
      profile: payload.profile,
      selectedDimensions: payload.selectedDimensions,
    }),
    onSuccess: async (_response, payload) => {
      await refreshCharacterData(payload.analysisId);
    },
  });

  const deleteCharacterMutation = useMutation({
    mutationFn: (payload: { analysisId: string; characterId: string }) =>
      deleteBookAnalysisCharacter(payload.analysisId, payload.characterId),
    onSuccess: async (_response, payload) => {
      await refreshCharacterData(payload.analysisId);
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

  useEffect(() => {
    if (!selectedAnalysis || draftAnalysisId === selectedAnalysis.id) {
      return;
    }
    setSectionDrafts(syncDrafts(selectedAnalysis));
    setDraftAnalysisId(selectedAnalysis.id);
  }, [selectedAnalysis, draftAnalysisId]);

  useEffect(() => {
    setPublishFeedback("");
    setLastPublishResult(null);
    setStyleProfileFeedback("");
  }, [selectedAnalysisId]);

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

  const getSectionDraft = (section: BookAnalysisSection): SectionDraft => {
    return sectionDrafts[section.id] ?? buildSectionDraft(section);
  };

  const updateSectionDraft = (section: BookAnalysisSection, patch: Partial<SectionDraft>) => {
    setSectionDrafts((prev) => ({
      ...prev,
      [section.id]: {
        ...(prev[section.id] ?? buildSectionDraft(section)),
        ...patch,
      },
    }));
  };

  const regenerateSection = (sectionKey: BookAnalysisSectionKey) => {
    if (!selectedAnalysis) {
      return;
    }
    const section = selectedAnalysis.sections.find((item) => item.sectionKey === sectionKey);
    const draft = section ? getSectionDraft(section) : null;
    regenerateMutation.mutate({
      id: selectedAnalysis.id,
      sectionKey,
      focusInstruction: draft?.focusInstruction.trim() ? draft.focusInstruction : null,
    });
  };

  const createDiagnosisAnalysis = async () => {
    await createDiagnosisMutation.mutateAsync();
  };

  const optimizeSectionPreview = async (section: BookAnalysisSection) => {
    if (!selectedAnalysis) {
      return;
    }
    const draft = getSectionDraft(section);
    const instruction = draft.optimizeInstruction.trim();
    if (!instruction) {
      return;
    }
    setOptimizingSectionKey(section.sectionKey);
    await optimizePreviewMutation.mutateAsync({
      id: selectedAnalysis.id,
      sectionKey: section.sectionKey,
      currentDraft: draft.editedContent,
      instruction,
    });
  };

  const applySectionOptimizePreview = (section: BookAnalysisSection) => {
    const draft = getSectionDraft(section);
    if (!draft.optimizePreview.trim()) {
      return;
    }
    updateSectionDraft(section, {
      editedContent: draft.optimizePreview,
      optimizePreview: "",
    });
  };

  const clearSectionOptimizePreview = (section: BookAnalysisSection) => {
    updateSectionDraft(section, {
      optimizePreview: "",
    });
  };

  const saveSection = (section: BookAnalysisSection) => {
    if (!selectedAnalysis) {
      return;
    }
    const draft = getSectionDraft(section);
    const normalize = (value: string | null | undefined) => value?.replace(/\r\n?/g, "\n").trim() ?? "";
    const normalizedDraft = normalize(draft.editedContent);
    const normalizedAi = normalize(section.aiContent ?? "");
    const editedContent = normalizedDraft && normalizedDraft !== normalizedAi ? draft.editedContent : null;
    updateSectionMutation.mutate({
      id: selectedAnalysis.id,
      sectionKey: section.sectionKey,
      editedContent,
      notes: draft.notes.trim() ? draft.notes : null,
      focusInstruction: draft.focusInstruction.trim() ? draft.focusInstruction : null,
      frozen: draft.frozen,
    });
  };

  const downloadSelectedAnalysis = async (format: ExportFormat) => {
    if (!selectedAnalysisId) {
      return;
    }
    const exported = await downloadBookAnalysisExport(selectedAnalysisId, format);
    createDownload(exported.blob, exported.fileName);
  };

  const publishSelectedAnalysis = async () => {
    if (!selectedAnalysisId || !selectedNovelId) {
      return;
    }
    await publishMutation.mutateAsync({
      id: selectedAnalysisId,
      novelId: selectedNovelId,
    });
  };

  const createStyleProfileFromAnalysis = async () => {
    if (!selectedAnalysis) {
      return;
    }
    await createStyleProfileMutation.mutateAsync({
      bookAnalysisId: selectedAnalysis.id,
      name: `${selectedAnalysis.title}-写法资产`,
    });
  };

  const generateCharacters = async (input: {
    generationDepth: BookAnalysisCharacterGenerationDepth;
    selectedDimensions: BookAnalysisCharacterDimension[];
    characterNames?: string[];
  }) => {
    if (!selectedAnalysis) {
      return;
    }
    await generateCharactersMutation.mutateAsync({
      analysisId: selectedAnalysis.id,
      ...input,
      characterNames: input.characterNames?.map((item) => item.trim()).filter(Boolean),
    });
  };

  const createCharacter = async (input: {
    name: string;
    role: string;
    profile?: Partial<CharacterProfile>;
    generationDepth?: BookAnalysisCharacterGenerationDepth;
    selectedDimensions?: BookAnalysisCharacterDimension[];
  }) => {
    if (!selectedAnalysis) {
      return;
    }
    await createCharacterMutation.mutateAsync({
      analysisId: selectedAnalysis.id,
      ...input,
    });
  };

  const updateCharacter = async (
    characterId: string,
    input: {
      name?: string;
      role?: string;
      profile?: Partial<CharacterProfile>;
      selectedDimensions?: BookAnalysisCharacterDimension[];
    },
  ) => {
    if (!selectedAnalysis) {
      return;
    }
    await updateCharacterMutation.mutateAsync({
      analysisId: selectedAnalysis.id,
      characterId,
      ...input,
    });
  };

  const deleteCharacter = async (characterId: string) => {
    if (!selectedAnalysis) {
      return;
    }
    await deleteCharacterMutation.mutateAsync({
      analysisId: selectedAnalysis.id,
      characterId,
    });
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
    includeTimeline,
    analysisPreset,
    llmConfig,
    sectionDrafts,
    publishFeedback,
    styleProfileFeedback,
    lastPublishResult,
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
    characters,
    aggregatedEvidence,
    optimizingSectionKey,
    pending: {
      create: createMutation.isPending,
      copy: copyMutation.isPending,
      rebuild: rebuildMutation.isPending,
      archive: archiveMutation.isPending,
      regenerate: regenerateMutation.isPending,
      optimizePreview: optimizePreviewMutation.isPending,
      saveSection: updateSectionMutation.isPending,
      publish: publishMutation.isPending,
      createStyleProfile: createStyleProfileMutation.isPending,
      loadCharacters: charactersQuery.isLoading,
      generateCharacters: generateCharactersMutation.isPending,
      createCharacter: createCharacterMutation.isPending,
      updateCharacter: updateCharacterMutation.isPending,
      deleteCharacter: deleteCharacterMutation.isPending,
      createDiagnosis: createDiagnosisMutation.isPending,
    },
    setKeyword,
    setStatus,
    setAnalysisMode,
    setSelectedNovelId,
    setSelectedDiagnosisNovelId,
    setUserFocusInstruction,
    setSelectedSourceRange,
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
    optimizeSectionPreview,
    applySectionOptimizePreview,
    clearSectionOptimizePreview,
    saveSection,
    downloadSelectedAnalysis,
    publishSelectedAnalysis,
    createStyleProfileFromAnalysis,
    generateCharacters,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    updateSectionDraft,
    getSectionDraft,
  };
}
