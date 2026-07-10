import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { KnowledgeDocumentStatus, KnowledgeRecallTestResult } from "@ai-novel/shared/types/knowledge";
import { useSearchParams } from "react-router-dom";
import OpenInCreativeHubButton from "@/components/creativeHub/OpenInCreativeHubButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { queryKeys } from "@/api/queryKeys";
import {
  activateKnowledgeDocumentVersion,
  clearFinishedRagJobs,
  createKnowledgeDocument,
  createKnowledgeDocumentVersion,
  deleteRagJob,
  getKnowledgeDocument,
  getRagHealth,
  getRagJobs,
  listKnowledgeDocuments,
  reindexKnowledgeDocument,
  testKnowledgeDocumentRecall,
  updateKnowledgeDocumentStatus,
  type RagHealthStatus,
  type RagJobSummary,
} from "@/api/knowledge";
import { getRagEmbeddingModels, getRagSettings, saveRagSettings } from "@/api/settings";
import { isTxtFile, readTextFile } from "@/lib/textFile";
import KnowledgeDocumentDetailDialog from "./components/KnowledgeDocumentDetailDialog";
import KnowledgeDocumentsTab, { type BatchUploadResult } from "./components/KnowledgeDocumentsTab";
import KnowledgeEmbeddingSettingsCard, { type KnowledgeEmbeddingSettingsFormState } from "./components/KnowledgeEmbeddingSettingsCard";
import KnowledgeOpsTab from "./components/KnowledgeOpsTab";

const TAB_VALUES = new Set(["documents", "ops", "settings"]);

function normalizeTab(raw: string | null): "documents" | "ops" | "settings" {
  if (raw && TAB_VALUES.has(raw)) {
    return raw as "documents" | "ops" | "settings";
  }
  return "documents";
}

export default function KnowledgePage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<KnowledgeDocumentStatus | "">("");
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadResults, setUploadResults] = useState<BatchUploadResult[]>([]);
  const [versionBusy, setVersionBusy] = useState(false);
  const [recallQuery, setRecallQuery] = useState("");
  const [recallResult, setRecallResult] = useState<KnowledgeRecallTestResult | null>(null);
  const [ragJobsActionMessage, setRagJobsActionMessage] = useState("");
  const [ragForm, setRagForm] = useState<KnowledgeEmbeddingSettingsFormState>({
    embeddingProvider: "openai",
    embeddingModel: "text-embedding-3-small",
    collectionVersion: 1,
    collectionMode: "auto",
    collectionName: "ai_novel_chunks_v1",
    collectionTag: "kb",
    autoReindexOnChange: true,
    embeddingBatchSize: 64,
    embeddingTimeoutMs: 30000,
    embeddingMaxRetries: 2,
    embeddingRetryBaseMs: 500,
    embeddingConcurrency: 4,
    enabled: true,
    qdrantUrl: "http://127.0.0.1:6333",
    qdrantApiKey: "",
    qdrantApiKeyConfigured: false,
    clearQdrantApiKey: false,
    qdrantTimeoutMs: 30000,
    qdrantUpsertMaxBytes: 24 * 1024 * 1024,
    qdrantUpsertConcurrency: 3,
    chunkSize: 800,
    chunkOverlap: 120,
    vectorCandidates: 40,
    keywordCandidates: 40,
    finalTopK: 8,
    workerPollMs: 2500,
    workerMaxAttempts: 5,
    workerRetryBaseMs: 5000,
    httpTimeoutMs: 30000,
  });

  const activeTab = normalizeTab(searchParams.get("tab"));
  const documentListQueryKey = queryKeys.knowledge.documents(`${keyword}-${status || "default"}`);
  const ragJobsQueryKey = queryKeys.knowledge.ragJobs("latest");

  const documentsQuery = useQuery({
    queryKey: documentListQueryKey,
    queryFn: () =>
      listKnowledgeDocuments({
        keyword: keyword.trim() || undefined,
        status: status || undefined,
      }),
  });

  const detailQuery = useQuery({
    queryKey: queryKeys.knowledge.detail(selectedDocumentId || "none"),
    queryFn: () => getKnowledgeDocument(selectedDocumentId),
    enabled: Boolean(selectedDocumentId),
  });

  const ragHealthQuery = useQuery({
    queryKey: queryKeys.knowledge.ragHealth,
    queryFn: () => {
      const previousHealth = queryClient.getQueryData<ApiResponse<RagHealthStatus>>(queryKeys.knowledge.ragHealth);
      return getRagHealth(previousHealth?.data);
    },
    enabled: activeTab === "ops",
  });

  const ragJobsQuery = useQuery({
    queryKey: ragJobsQueryKey,
    queryFn: () => getRagJobs({ limit: 30 }),
    enabled: activeTab === "ops" || activeTab === "documents",
    refetchInterval: (query) => {
      const jobs = query.state.data?.data ?? [];
      return jobs.some((item) => item.status === "queued" || item.status === "running") ? 2000 : false;
    },
  });

  const ragSettingsQuery = useQuery({
    queryKey: queryKeys.settings.rag,
    queryFn: getRagSettings,
    enabled: activeTab === "settings",
  });

  const ragEmbeddingModelsQuery = useQuery({
    queryKey: queryKeys.settings.ragEmbeddingModels(ragForm.embeddingProvider),
    queryFn: () => getRagEmbeddingModels(ragForm.embeddingProvider),
    enabled: activeTab === "settings",
  });

  useEffect(() => {
    const data = ragSettingsQuery.data?.data;
    if (!data) {
      return;
    }
    setRagForm({
      embeddingProvider: data.embeddingProvider,
      embeddingModel: data.embeddingModel,
      collectionVersion: data.collectionVersion,
      collectionMode: data.collectionMode,
      collectionName: data.collectionName,
      collectionTag: data.collectionTag,
      autoReindexOnChange: data.autoReindexOnChange,
      embeddingBatchSize: data.embeddingBatchSize,
      embeddingTimeoutMs: data.embeddingTimeoutMs,
      embeddingMaxRetries: data.embeddingMaxRetries,
      embeddingRetryBaseMs: data.embeddingRetryBaseMs,
      embeddingConcurrency: data.embeddingConcurrency,
      enabled: data.enabled,
      qdrantUrl: data.qdrantUrl,
      qdrantApiKey: "",
      qdrantApiKeyConfigured: data.qdrantApiKeyConfigured,
      clearQdrantApiKey: false,
      qdrantTimeoutMs: data.qdrantTimeoutMs,
      qdrantUpsertMaxBytes: data.qdrantUpsertMaxBytes,
      qdrantUpsertConcurrency: data.qdrantUpsertConcurrency,
      chunkSize: data.chunkSize,
      chunkOverlap: data.chunkOverlap,
      vectorCandidates: data.vectorCandidates,
      keywordCandidates: data.keywordCandidates,
      finalTopK: data.finalTopK,
      workerPollMs: data.workerPollMs,
      workerMaxAttempts: data.workerMaxAttempts,
      workerRetryBaseMs: data.workerRetryBaseMs,
      httpTimeoutMs: data.httpTimeoutMs,
    });
  }, [ragSettingsQuery.data?.data]);

  useEffect(() => {
    const data = ragEmbeddingModelsQuery.data?.data;
    if (!data?.models?.length) {
      return;
    }
    setRagForm((prev) => {
      if (prev.embeddingProvider !== data.provider) {
        return prev;
      }
      if (prev.embeddingModel && data.models.includes(prev.embeddingModel)) {
        return prev;
      }
      return {
        ...prev,
        embeddingModel: data.defaultModel || data.models[0] || "",
      };
    });
  }, [ragEmbeddingModelsQuery.data?.data]);

  useEffect(() => {
    setRecallQuery("");
    setRecallResult(null);
  }, [selectedDocumentId, detailQuery.data?.data?.activeVersionId]);

  const saveRagMutation = useMutation({
    mutationFn: saveRagSettings,
    onSuccess: async (response) => {
      const data = response.data;
      if (data) {
        setRagForm((prev) => ({
          ...prev,
          embeddingProvider: data.embeddingProvider,
          embeddingModel: data.embeddingModel,
          collectionVersion: data.collectionVersion,
          collectionMode: data.collectionMode,
          collectionName: data.collectionName,
          collectionTag: data.collectionTag,
          autoReindexOnChange: data.autoReindexOnChange,
          embeddingBatchSize: data.embeddingBatchSize,
          embeddingTimeoutMs: data.embeddingTimeoutMs,
          embeddingMaxRetries: data.embeddingMaxRetries,
          embeddingRetryBaseMs: data.embeddingRetryBaseMs,
          embeddingConcurrency: data.embeddingConcurrency,
          enabled: data.enabled,
          qdrantUrl: data.qdrantUrl,
          qdrantApiKey: "",
          qdrantApiKeyConfigured: data.qdrantApiKeyConfigured,
          clearQdrantApiKey: false,
          qdrantTimeoutMs: data.qdrantTimeoutMs,
          qdrantUpsertMaxBytes: data.qdrantUpsertMaxBytes,
          qdrantUpsertConcurrency: data.qdrantUpsertConcurrency,
          chunkSize: data.chunkSize,
          chunkOverlap: data.chunkOverlap,
          vectorCandidates: data.vectorCandidates,
          keywordCandidates: data.keywordCandidates,
          finalTopK: data.finalTopK,
          workerPollMs: data.workerPollMs,
          workerMaxAttempts: data.workerMaxAttempts,
          workerRetryBaseMs: data.workerRetryBaseMs,
          httpTimeoutMs: data.httpTimeoutMs,
        }));
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.rag });
      await queryClient.invalidateQueries({ queryKey: ragJobsQueryKey });
      await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.ragHealth });
    },
  });

  const reindexMutation = useMutation({
    mutationFn: (id: string) => reindexKnowledgeDocument(id),
    onSuccess: async () => {
      setRecallResult(null);
      await queryClient.invalidateQueries({ queryKey: documentListQueryKey });
      await queryClient.invalidateQueries({ queryKey: ragJobsQueryKey });
      if (selectedDocumentId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.detail(selectedDocumentId) });
      }
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (payload: { id: string; status: KnowledgeDocumentStatus }) =>
      updateKnowledgeDocumentStatus(payload.id, payload.status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["knowledge", "documents"] });
      await queryClient.invalidateQueries({ queryKey: ragJobsQueryKey });
      if (selectedDocumentId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.detail(selectedDocumentId) });
      }
    },
  });

  const activateVersionMutation = useMutation({
    mutationFn: (payload: { documentId: string; versionId: string }) =>
      activateKnowledgeDocumentVersion(payload.documentId, payload.versionId),
    onSuccess: async () => {
      setRecallResult(null);
      await queryClient.invalidateQueries({ queryKey: documentListQueryKey });
      if (selectedDocumentId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.detail(selectedDocumentId) });
      }
      await queryClient.invalidateQueries({ queryKey: ragJobsQueryKey });
    },
  });

  const recallTestMutation = useMutation({
    mutationFn: (payload: { documentId: string; query: string; limit?: number }) =>
      testKnowledgeDocumentRecall(payload.documentId, {
        query: payload.query,
        limit: payload.limit,
      }),
    onSuccess: (response) => {
      setRecallResult(response.data ?? null);
    },
  });

  const clearFinishedRagJobsMutation = useMutation({
    mutationFn: clearFinishedRagJobs,
    onSuccess: async (response) => {
      setRagJobsActionMessage(response.message ?? t("gen.pages.knowledge.KnowledgePage.gen_901ed15c"));
      await queryClient.invalidateQueries({ queryKey: ragJobsQueryKey });
    },
    onError: (error) => {
      setRagJobsActionMessage(error instanceof Error ? error.message : t("gen.pages.knowledge.KnowledgePage.gen_e1f338dd"));
    },
  });

  const deleteRagJobMutation = useMutation({
    mutationFn: (jobId: string) => deleteRagJob(jobId),
    onSuccess: async (response) => {
      setRagJobsActionMessage(response.message ?? t("gen.pages.knowledge.KnowledgePage.taskIdRecordDeleted"));
      await queryClient.invalidateQueries({ queryKey: ragJobsQueryKey });
    },
    onError: (error) => {
      setRagJobsActionMessage(error instanceof Error ? error.message : t("gen.pages.knowledge.KnowledgePage.gen_0cd5921e"));
    },
  });

  const visibleDocuments = documentsQuery.data?.data ?? [];
  const knowledgeDocumentJobs = useMemo(
    () => (ragJobsQuery.data?.data ?? []).filter((item) => item.ownerType === "knowledge_document"),
    [ragJobsQuery.data?.data],
  );
  const latestKnowledgeDocumentJobs = useMemo(() => {
    const jobMap = new Map<string, RagJobSummary>();
    for (const job of knowledgeDocumentJobs) {
      const current = jobMap.get(job.ownerId);
      if (!current || new Date(job.updatedAt).getTime() > new Date(current.updatedAt).getTime()) {
        jobMap.set(job.ownerId, job);
      }
    }
    return jobMap;
  }, [knowledgeDocumentJobs]);
  const activeKnowledgeJobCount = useMemo(
    () => knowledgeDocumentJobs.filter((item) => item.status === "queued" || item.status === "running").length,
    [knowledgeDocumentJobs],
  );
  const previousActiveKnowledgeJobCount = useRef(0);
  const enabledCount = useMemo(
    () => visibleDocuments.filter((item) => item.status === "enabled").length,
    [visibleDocuments],
  );
  const disabledCount = useMemo(
    () => visibleDocuments.filter((item) => item.status === "disabled").length,
    [visibleDocuments],
  );
  const failedJobs = (ragJobsQuery.data?.data ?? []).filter((item) => item.status === "failed").slice(0, 5);
  const selectedDocument = detailQuery.data?.data;
  const ragHealthNotice = ragHealthQuery.isError
    ? (ragHealthQuery.error instanceof Error ? ragHealthQuery.error.message : t("gen.pages.knowledge.KnowledgePage.gen_9a6a1f05"))
    : (ragHealthQuery.data?.message && ragHealthQuery.data.message !== "RAG health check passed."
      ? ragHealthQuery.data.message
      : undefined);
  const recallErrorMessage = recallTestMutation.isError
    ? (recallTestMutation.error instanceof Error ? recallTestMutation.error.message : t("gen.pages.knowledge.KnowledgePage.gen_25978068"))
    : null;

  useEffect(() => {
    if (previousActiveKnowledgeJobCount.current > 0 && activeKnowledgeJobCount === 0) {
      void queryClient.invalidateQueries({ queryKey: documentListQueryKey });
      if (selectedDocumentId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.detail(selectedDocumentId) });
      }
    }
    previousActiveKnowledgeJobCount.current = activeKnowledgeJobCount;
  }, [activeKnowledgeJobCount, documentListQueryKey, queryClient, selectedDocumentId]);

  const handleUploadFiles = async (files: File[]) => {
    try {
      setUploadBusy(true);
      setUploadResults([]);

      // Load existing documents to check for duplicates
      const existingDocs = await listKnowledgeDocuments();
      const existingByTitle = new Map<string, { fileName: string; activeVersionId: string | null }>();
      for (const doc of existingDocs.data ?? []) {
        if (doc.status !== "archived") {
          existingByTitle.set(doc.title, {
            fileName: doc.fileName,
            activeVersionId: doc.activeVersionId ?? null,
          });
        }
      }

      const results: BatchUploadResult[] = [];
      for (const file of files) {
        if (!isTxtFile(file)) {
          results.push({ fileName: file.name, status: "skipped", reason: "Not a .txt file" });
          continue;
        }

        try {
          const content = await readTextFile(file);
          if (!content) {
            results.push({ fileName: file.name, status: "failed", reason: "Empty or unsupported encoding" });
            continue;
          }

          // Derive the title the same way the server does (strip extension)
          const dotIndex = file.name.lastIndexOf(".");
          const derivedTitle = dotIndex > 0 ? file.name.slice(0, dotIndex).trim() : file.name.trim();
          const normalizedTitle = derivedTitle.replace(/\s+/g, " ").trim();

          // Check for existing document with same title
          const existing = existingByTitle.get(normalizedTitle);
          if (existing) {
            // Fetch full document details to compare content hash
            const allDocs = await listKnowledgeDocuments({ keyword: normalizedTitle });
            const matchDoc = (allDocs.data ?? []).find((d) => d.title === normalizedTitle && d.status !== "archived");
            if (matchDoc) {
              const detail = await getKnowledgeDocument(matchDoc.id);
              const activeVersion = detail.data?.versions?.find((v) => v.isActive);
              if (activeVersion && activeVersion.content.trim() === content.trim()) {
                results.push({ fileName: file.name, status: "skipped", reason: "Same content exists" });
                continue;
              }
            }
          }

          await createKnowledgeDocument({
            fileName: file.name,
            content,
          });
          results.push({ fileName: file.name, status: "uploaded" });

          // Update the local map so subsequent files in the same batch can dedup
          existingByTitle.set(normalizedTitle, { fileName: file.name, activeVersionId: null });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Upload failed";
          results.push({ fileName: file.name, status: "failed", reason: message });
        }
      }

      setUploadResults(results);
      await queryClient.invalidateQueries({ queryKey: documentListQueryKey });
      await queryClient.invalidateQueries({ queryKey: ragJobsQueryKey });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load existing documents";
      setUploadResults([{ fileName: "Batch Upload", status: "failed", reason: message }]);
    } finally {
      setUploadBusy(false);
    }
  };

  const handleUploadVersionFile = async (file: File) => {
    if (!selectedDocumentId) {
      return;
    }
    try {
      setVersionBusy(true);
      if (!isTxtFile(file)) {
        throw new Error(t("gen.pages.knowledge.KnowledgePage.onlySupportTxtFiles"));
      }
      const content = await readTextFile(file);
      if (!content) {
        throw new Error(t("gen.pages.knowledge.KnowledgePage.gen_dd1d03b9"));
      }
      await createKnowledgeDocumentVersion(selectedDocumentId, {
        fileName: file.name,
        content,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.detail(selectedDocumentId) });
      await queryClient.invalidateQueries({ queryKey: documentListQueryKey });
    } finally {
      setVersionBusy(false);
    }
  };

  const handleSaveRagSettings = () => {
    saveRagMutation.mutate({
      embeddingProvider: ragForm.embeddingProvider,
      embeddingModel: ragForm.embeddingModel.trim(),
      collectionMode: ragForm.collectionMode,
      collectionName: ragForm.collectionName.trim(),
      collectionTag: ragForm.collectionTag.trim(),
      autoReindexOnChange: ragForm.autoReindexOnChange,
      embeddingBatchSize: ragForm.embeddingBatchSize,
      embeddingTimeoutMs: ragForm.embeddingTimeoutMs,
      embeddingMaxRetries: ragForm.embeddingMaxRetries,
      embeddingRetryBaseMs: ragForm.embeddingRetryBaseMs,
      embeddingConcurrency: ragForm.embeddingConcurrency,
      enabled: ragForm.enabled,
      qdrantUrl: ragForm.qdrantUrl.trim(),
      qdrantApiKey: ragForm.qdrantApiKey.trim() || undefined,
      clearQdrantApiKey: ragForm.clearQdrantApiKey,
      qdrantTimeoutMs: ragForm.qdrantTimeoutMs,
      qdrantUpsertMaxBytes: ragForm.qdrantUpsertMaxBytes,
      qdrantUpsertConcurrency: ragForm.qdrantUpsertConcurrency,
      chunkSize: ragForm.chunkSize,
      chunkOverlap: ragForm.chunkOverlap,
      vectorCandidates: ragForm.vectorCandidates,
      keywordCandidates: ragForm.keywordCandidates,
      finalTopK: ragForm.finalTopK,
      workerPollMs: ragForm.workerPollMs,
      workerMaxAttempts: ragForm.workerMaxAttempts,
      workerRetryBaseMs: ragForm.workerRetryBaseMs,
      httpTimeoutMs: ragForm.httpTimeoutMs,
    });
  };

  const handleRecallTest = () => {
    if (!selectedDocumentId || !recallQuery.trim()) {
      return;
    }
    recallTestMutation.mutate({
      documentId: selectedDocumentId,
      query: recallQuery.trim(),
      limit: 6,
    });
  };

  const handleClearFinishedRagJobs = () => {
    if (!window.confirm(t("gen.pages.knowledge.KnowledgePage.gen_2d775f38"))) {
      return;
    }
    clearFinishedRagJobsMutation.mutate();
  };

  const handleDeleteRagJob = (jobId: string) => {
    if (!window.confirm(t("gen.pages.knowledge.KnowledgePage.gen_35c42d6b"))) {
      return;
    }
    deleteRagJobMutation.mutate(jobId);
  };

  const getOwnerName = (ownerType: string, ownerId: string) => {
    if (ownerType === "knowledge_document") {
      const doc = documentsQuery.data?.data?.find((d) => d.id === ownerId);
      if (doc) return doc.title;
    }
    return undefined;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <OpenInCreativeHubButton
          bindings={{ knowledgeDocumentIds: selectedDocumentId ? [selectedDocumentId] : [] }}
          label={t("gen.pages.knowledge.KnowledgePage.gen_dbbdc047")}
        />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setSearchParams({ tab: value })}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="documents">{t("gen.pages.knowledge.KnowledgePage.gen_32536950")}</TabsTrigger>
          <TabsTrigger value="ops">{t("gen.pages.knowledge.KnowledgePage.gen_e4b51d5c")}</TabsTrigger>
          <TabsTrigger value="settings">{t("gen.pages.knowledge.KnowledgePage.gen_acb3166d")}</TabsTrigger>
        </TabsList>

        <TabsContent value="documents">
          <KnowledgeDocumentsTab
            uploadBusy={uploadBusy}
            onUploadFiles={handleUploadFiles}
            uploadResults={uploadResults}
            onClearUploadResults={() => setUploadResults([])}
            keyword={keyword}
            onKeywordChange={setKeyword}
            status={status}
            onStatusChange={setStatus}
            documents={visibleDocuments}
            latestKnowledgeDocumentJobs={latestKnowledgeDocumentJobs}
            onSelectDocument={setSelectedDocumentId}
            onOpenRecallTest={(id) => {
              setRecallQuery("");
              setRecallResult(null);
              setSelectedDocumentId(id);
            }}
            onReindexDocument={(id) => reindexMutation.mutate(id)}
            onUpdateStatus={(id, nextStatus) => updateStatusMutation.mutate({ id, status: nextStatus })}
          />
        </TabsContent>

        <TabsContent value="ops">
          <KnowledgeOpsTab
            visibleDocumentsCount={visibleDocuments.length}
            enabledCount={enabledCount}
            disabledCount={disabledCount}
            ragHealth={ragHealthQuery.data?.data}
            ragHealthNotice={ragHealthNotice}
            jobs={ragJobsQuery.data?.data ?? []}
            failedJobs={failedJobs}
            actionMessage={ragJobsActionMessage}
            isClearingJobs={clearFinishedRagJobsMutation.isPending}
            deletingJobId={deleteRagJobMutation.isPending ? deleteRagJobMutation.variables : undefined}
            onClearFinishedJobs={handleClearFinishedRagJobs}
            onDeleteJob={handleDeleteRagJob}
            getOwnerName={getOwnerName}
          />
        </TabsContent>

        <TabsContent value="settings">
          <KnowledgeEmbeddingSettingsCard
            form={ragForm}
            setForm={setRagForm}
            providers={ragSettingsQuery.data?.data?.providers ?? []}
            modelOptions={ragEmbeddingModelsQuery.data?.data?.models ?? []}
            modelQuery={{
              isLoading: ragEmbeddingModelsQuery.isLoading,
              data: ragEmbeddingModelsQuery.data?.data,
            }}
            isSaving={saveRagMutation.isPending}
            onSave={handleSaveRagSettings}
          />
        </TabsContent>
      </Tabs>

      <KnowledgeDocumentDetailDialog
        open={Boolean(selectedDocumentId)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedDocumentId("");
          }
        }}
        document={selectedDocument}
        selectedDocumentId={selectedDocumentId}
        versionBusy={versionBusy}
        onUploadVersionFile={handleUploadVersionFile}
        onReindex={() => selectedDocumentId && reindexMutation.mutate(selectedDocumentId)}
        recallQuery={recallQuery}
        onRecallQueryChange={setRecallQuery}
        onRecallTest={handleRecallTest}
        recallPending={recallTestMutation.isPending}
        recallErrorMessage={recallErrorMessage}
        recallResult={recallResult}
        onRestoreDocument={() => selectedDocumentId && updateStatusMutation.mutate({
          id: selectedDocumentId,
          status: "enabled",
        })}
        restorePending={updateStatusMutation.isPending}
        onActivateVersion={(versionId) =>
          activateVersionMutation.mutate({
            documentId: selectedDocumentId,
            versionId,
          })}
        activateVersionPending={activateVersionMutation.isPending}
      />
    </div>
  );
}
