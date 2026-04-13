import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { KnowledgeDocumentStatus, KnowledgeRecallTestResult } from "@ai-novel/shared/types/knowledge";
import { useSearchParams } from "react-router-dom";
import OpenInCreativeHubButton from "@/components/creativeHub/OpenInCreativeHubButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { queryKeys } from "@/api/queryKeys";
import {
  activateKnowledgeDocumentVersion,
  createKnowledgeDocument,
  createKnowledgeDocumentVersion,
  getKnowledgeDocument,
  getRagHealth,
  getRagJobs,
  listKnowledgeDocuments,
  reindexKnowledgeDocument,
  testKnowledgeDocumentRecall,
  updateKnowledgeDocumentStatus,
  type RagJobSummary,
} from "@/api/knowledge";
import { getRagEmbeddingModels, getRagSettings, saveRagSettings } from "@/api/settings";
import { TEXT_FILE_MAX_SIZE, isTxtFile, readTextFile } from "@/lib/textFile";
import KnowledgeDocumentDetailDialog from "./components/KnowledgeDocumentDetailDialog";
import KnowledgeDocumentsTab from "./components/KnowledgeDocumentsTab";
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
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [versionBusy, setVersionBusy] = useState(false);
  const [recallQuery, setRecallQuery] = useState("");
  const [recallResult, setRecallResult] = useState<KnowledgeRecallTestResult | null>(null);
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
    queryFn: getRagHealth,
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
      await queryClient.invalidateQueries({ queryKey: documentListQueryKey });
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
  const recallErrorMessage = recallTestMutation.isError
    ? (recallTestMutation.error instanceof Error ? recallTestMutation.error.message : "召回测试失败。")
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

  const handleUpload = async (file: File) => {
    if (!isTxtFile(file)) {
      throw new Error("仅支持 .txt 文档。");
    }
    if (file.size > TEXT_FILE_MAX_SIZE) {
      throw new Error("文档过大，请上传 2MB 以内的 txt 文件。");
    }
    const content = await readTextFile(file);
    if (!content) {
      throw new Error("文档内容为空或编码不受支持。");
    }
    await createKnowledgeDocument({
      title: uploadTitle.trim() || undefined,
      fileName: file.name,
      content,
    });
  };

  const handleVersionUpload = async (file: File) => {
    if (!selectedDocumentId) {
      return;
    }
    if (!isTxtFile(file)) {
      throw new Error("仅支持 .txt 文档。");
    }
    if (file.size > TEXT_FILE_MAX_SIZE) {
      throw new Error("文档过大，请上传 2MB 以内的 txt 文件。");
    }
    const content = await readTextFile(file);
    if (!content) {
      throw new Error("文档内容为空或编码不受支持。");
    }
    await createKnowledgeDocumentVersion(selectedDocumentId, {
      fileName: file.name,
      content,
    });
  };

  const handleUploadFile = async (file: File) => {
    try {
      setUploadBusy(true);
      await handleUpload(file);
      setUploadTitle("");
      await queryClient.invalidateQueries({ queryKey: documentListQueryKey });
    } finally {
      setUploadBusy(false);
    }
  };

  const handleUploadVersionFile = async (file: File) => {
    try {
      setVersionBusy(true);
      await handleVersionUpload(file);
      if (selectedDocumentId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.detail(selectedDocumentId) });
      }
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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <OpenInCreativeHubButton
          bindings={{ knowledgeDocumentIds: selectedDocumentId ? [selectedDocumentId] : [] }}
          label="知识库发送到创作中枢"
        />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setSearchParams({ tab: value })}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="documents">文档库</TabsTrigger>
          <TabsTrigger value="ops">任务与健康</TabsTrigger>
          <TabsTrigger value="settings">向量设置</TabsTrigger>
        </TabsList>

        <TabsContent value="documents">
          <KnowledgeDocumentsTab
            uploadTitle={uploadTitle}
            onUploadTitleChange={setUploadTitle}
            uploadBusy={uploadBusy}
            onUploadFile={handleUploadFile}
            keyword={keyword}
            onKeywordChange={setKeyword}
            status={status}
            onStatusChange={setStatus}
            documents={visibleDocuments}
            latestKnowledgeDocumentJobs={latestKnowledgeDocumentJobs}
            onSelectDocument={setSelectedDocumentId}
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
            jobs={ragJobsQuery.data?.data ?? []}
            failedJobs={failedJobs}
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
