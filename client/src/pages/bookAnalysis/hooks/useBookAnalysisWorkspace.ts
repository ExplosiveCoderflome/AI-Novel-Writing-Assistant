import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BookAnalysisPublishResult,
  BookAnalysisSection,
  BookAnalysisSectionKey,
  BookAnalysisStatus,
} from "@ai-novel/shared/types/bookAnalysis";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  archiveBookAnalysis,
  copyBookAnalysis,
  createBookAnalysis,
  downloadBookAnalysisExport,
  getBookAnalysis,
  listBookAnalyses,
  optimizeBookAnalysisSectionPreview,
  publishBookAnalysis,
  rebuildBookAnalysis,
  regenerateBookAnalysisSection,
  updateBookAnalysisSection,
} from "@/api/bookAnalysis";
import { getKnowledgeDocument, listKnowledgeDocuments } from "@/api/knowledge";
import { getNovelList } from "@/api/novel";
import { createStyleProfileFromBookAnalysis } from "@/api/styleEngine";
import { queryKeys } from "@/api/queryKeys";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
import type { LLMConfigState, SectionDraft } from "../bookAnalysis.types";
import { buildSectionDraft, createDownload, syncDrafts } from "../bookAnalysis.utils";
import type { BookAnalysisWorkspace, ExportFormat, NovelOption } from "./bookAnalysisWorkspace.types";

function buildNovelOptions(items: Array<{ id: string; title: string }>): NovelOption[] {
  return items.map((item) => ({ id: item.id, title: item.title }));
}

export function useBookAnalysisWorkspace(): BookAnalysisWorkspace {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const llmStore = useLLMStore();

  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<BookAnalysisStatus | "">("");
  const [selectedAnalysisId, setSelectedAnalysisId] = useState(searchParams.get("analysisId") ?? "");
  const [selectedDocumentId, setSelectedDocumentId] = useState(searchParams.get("documentId") ?? "");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [selectedNovelId, setSelectedNovelId] = useState("");
  const [includeTimeline, setIncludeTimeline] = useState(false);
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
  const documentOptions = documentsQuery.data?.data ?? [];
  const novelOptions = useMemo(() => buildNovelOptions(novelsQuery.data?.data?.items ?? []), [novelsQuery.data?.data?.items]);
  const sourceDocument = sourceDocumentQuery.data?.data;
  const versionOptions = sourceDocumentQuery.data?.data?.versions ?? [];

  const aggregatedEvidence = useMemo(() => {
    if (!selectedAnalysis) {
      return [];
    }
    return selectedAnalysis.sections.flatMap((section) =>
      section.evidence.map((item) => ({
        ...item,
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

  const openAnalysis = (analysisId: string, documentId: string) => {
    setSelectedAnalysisId(analysisId);
    setSelectedDocumentId(documentId);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("analysisId", analysisId);
      next.set("documentId", documentId);
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
      openAnalysis(created.id, created.documentId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.bookAnalysis.list(listKey) });
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
    mutationFn: (payload: { id: string; sectionKey: BookAnalysisSectionKey }) =>
      regenerateBookAnalysisSection(payload.id, payload.sectionKey),
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

  useEffect(() => {
    const nextAnalysisId = searchParams.get("analysisId");
    const nextDocumentId = searchParams.get("documentId");
    if (nextAnalysisId && nextAnalysisId !== selectedAnalysisId) {
      setSelectedAnalysisId(nextAnalysisId);
    }
    if (nextDocumentId && nextDocumentId !== selectedDocumentId) {
      setSelectedDocumentId(nextDocumentId);
    }
  }, [searchParams, selectedAnalysisId, selectedDocumentId]);

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
    setSelectedDocumentId(documentId);
    setSelectedVersionId("");
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
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
  };

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
      includeTimeline,
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
    regenerateMutation.mutate({
      id: selectedAnalysis.id,
      sectionKey,
    });
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

  return {
    keyword,
    status,
    selectedAnalysisId,
    selectedDocumentId,
    selectedVersionId,
    selectedNovelId,
    includeTimeline,
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
    },
    setKeyword,
    setStatus,
    setSelectedNovelId,
    setIncludeTimeline,
    setLlmConfig,
    selectDocument,
    selectVersion,
    openAnalysis,
    createAnalysis,
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
    updateSectionDraft,
    getSectionDraft,
  };
}
