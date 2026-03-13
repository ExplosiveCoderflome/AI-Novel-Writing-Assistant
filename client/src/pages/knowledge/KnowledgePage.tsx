import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import type {
  KnowledgeDocumentStatus,
  KnowledgeRecallTestResult,
  KnowledgeDocumentSummary,
} from "@ai-novel/shared/types/knowledge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import OpenInCreativeHubButton from "@/components/creativeHub/OpenInCreativeHubButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
} from "@/api/knowledge";
import { getRagSettings, saveRagSettings, type EmbeddingProvider } from "@/api/settings";
import { TEXT_FILE_MAX_SIZE, isTxtFile, readTextFile } from "@/lib/textFile";

const TAB_VALUES = new Set(["documents", "ops", "settings"]);

function normalizeTab(raw: string | null): "documents" | "ops" | "settings" {
  if (raw && TAB_VALUES.has(raw)) {
    return raw as "documents" | "ops" | "settings";
  }
  return "documents";
}

function formatStatus(status: string): string {
  switch (status) {
    case "enabled":
      return "已启用";
    case "disabled":
      return "已停用";
    case "archived":
      return "已归档";
    case "queued":
      return "排队中";
    case "running":
      return "执行中";
    case "succeeded":
      return "成功";
    case "failed":
      return "失败";
    default:
      return status;
  }
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
  const [ragForm, setRagForm] = useState<{
    embeddingProvider: EmbeddingProvider;
    embeddingModel: string;
  }>({
    embeddingProvider: "openai",
    embeddingModel: "text-embedding-3-small",
  });

  const activeTab = normalizeTab(searchParams.get("tab"));

  const documentsQuery = useQuery({
    queryKey: queryKeys.knowledge.documents(`${keyword}-${status || "default"}`),
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
    queryKey: queryKeys.knowledge.ragJobs("latest"),
    queryFn: () => getRagJobs({ limit: 30 }),
    enabled: activeTab === "ops",
  });

  const ragSettingsQuery = useQuery({
    queryKey: queryKeys.settings.rag,
    queryFn: getRagSettings,
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
    });
  }, [ragSettingsQuery.data?.data]);

  useEffect(() => {
    setRecallQuery("");
    setRecallResult(null);
  }, [selectedDocumentId, detailQuery.data?.data?.activeVersionId]);

  const saveRagMutation = useMutation({
    mutationFn: saveRagSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.rag });
    },
  });

  const reindexMutation = useMutation({
    mutationFn: (id: string) => reindexKnowledgeDocument(id),
    onSuccess: async () => {
      setRecallResult(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.documents(`${keyword}-${status || "default"}`) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.ragJobs("latest") });
      if (selectedDocumentId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.detail(selectedDocumentId) });
      }
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (payload: { id: string; status: KnowledgeDocumentStatus }) =>
      updateKnowledgeDocumentStatus(payload.id, payload.status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.documents(`${keyword}-${status || "default"}`) });
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.documents(`${keyword}-${status || "default"}`) });
      if (selectedDocumentId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.detail(selectedDocumentId) });
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.ragJobs("latest") });
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

  const renderDocumentRow = (document: KnowledgeDocumentSummary) => (
    <div key={document.id} className="rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="font-medium">{document.title}</div>
          <div className="text-xs text-muted-foreground">
            {document.fileName} | 版本数 {document.versionCount} | 当前 v{document.activeVersionNumber}
          </div>
          <div className="text-xs text-muted-foreground">拆书项目 {document.bookAnalysisCount}</div>
          {document.latestIndexStatus === "failed" && document.latestIndexError ? (
            <div className="text-xs text-destructive">失败原因：{document.latestIndexError}</div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{formatStatus(document.status)}</Badge>
          <Badge variant="outline">{formatStatus(document.latestIndexStatus)}</Badge>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setSelectedDocumentId(document.id)}>
          查看版本
        </Button>
        <OpenInCreativeHubButton
          bindings={{ knowledgeDocumentIds: [document.id] }}
          label="在创作中枢中继续"
        />
        <Button asChild size="sm" variant="outline">
          <Link to={`/book-analysis?documentId=${document.id}`}>新建拆书</Link>
        </Button>
        <Button size="sm" variant="outline" onClick={() => reindexMutation.mutate(document.id)}>
          重建索引
        </Button>
        {document.status === "enabled" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => updateStatusMutation.mutate({ id: document.id, status: "disabled" })}
          >
            停用
          </Button>
        ) : document.status === "disabled" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => updateStatusMutation.mutate({ id: document.id, status: "enabled" })}
          >
            启用
          </Button>
        ) : null}
        {document.status !== "archived" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => updateStatusMutation.mutate({ id: document.id, status: "archived" })}
          >
            归档
          </Button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <OpenInCreativeHubButton
          bindings={{ knowledgeDocumentIds: selectedDocumentId ? [selectedDocumentId] : [] }}
          label="知识库发往创作中枢"
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
          <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>上传文档</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={uploadTitle}
                  onChange={(event) => setUploadTitle(event.target.value)}
                  placeholder="可选标题，留空则使用文件名"
                />
                <input
                  type="file"
                  accept=".txt,text/plain"
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) {
                      return;
                    }
                    try {
                      setUploadBusy(true);
                      await handleUpload(file);
                      setUploadTitle("");
                      await queryClient.invalidateQueries({
                        queryKey: queryKeys.knowledge.documents(`${keyword}-${status || "default"}`),
                      });
                    } finally {
                      setUploadBusy(false);
                    }
                  }}
                  disabled={uploadBusy}
                />
                <div className="text-xs text-muted-foreground">
                  仅支持 txt，前端读取文本后提交 JSON。上传同名标题会自动追加新版本并切换激活版本。
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>文档列表</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 md:grid-cols-[1fr_180px]">
                  <Input
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder="按标题或文件名搜索"
                  />
                  <select
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={status}
                    onChange={(event) => setStatus(event.target.value as KnowledgeDocumentStatus | "")}
                  >
                    <option value="">全部未归档</option>
                    <option value="enabled">仅启用</option>
                    <option value="disabled">仅停用</option>
                    <option value="archived">仅归档</option>
                  </select>
                </div>
                <div className="space-y-3">
                  {visibleDocuments.map(renderDocumentRow)}
                  {visibleDocuments.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                      当前没有符合条件的知识文档。
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ops">
          <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>基础统计</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>当前列表文档数：{visibleDocuments.length}</div>
                <div>启用文档数：{enabledCount}</div>
                <div>停用文档数：{disabledCount}</div>
                <div>
                  RAG 健康：
                  <Badge variant="outline" className="ml-2">
                    {ragHealthQuery.data?.data?.ok ? "正常" : "异常"}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>健康状态</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div>
                    Embedding：{ragHealthQuery.data?.data?.embedding.provider ?? "-"} /{" "}
                    {ragHealthQuery.data?.data?.embedding.model ?? "-"} /{" "}
                    {ragHealthQuery.data?.data?.embedding.ok ? "OK" : "FAIL"}
                  </div>
                  <div>Qdrant：{ragHealthQuery.data?.data?.qdrant.ok ? "OK" : "FAIL"}</div>
                  {ragHealthQuery.data?.data?.embedding.detail ? (
                    <div className="text-xs text-muted-foreground">{ragHealthQuery.data.data.embedding.detail}</div>
                  ) : null}
                  {ragHealthQuery.data?.data?.qdrant.detail ? (
                    <div className="text-xs text-muted-foreground">{ragHealthQuery.data.data.qdrant.detail}</div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>最近任务</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(ragJobsQuery.data?.data ?? []).map((job) => (
                    <div key={job.id} className="rounded-md border p-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">
                          {job.ownerType}:{job.ownerId}
                        </div>
                        <Badge variant="outline">{formatStatus(job.status)}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {job.jobType} | 尝试 {job.attempts}/{job.maxAttempts}
                      </div>
                      {job.lastError ? <div className="mt-1 text-xs text-destructive">{job.lastError}</div> : null}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>最近失败任务</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {failedJobs.length === 0 ? (
                    <div className="text-sm text-muted-foreground">没有失败任务。</div>
                  ) : null}
                  {failedJobs.map((job) => (
                    <div key={job.id} className="rounded-md border p-2 text-sm">
                      <div className="font-medium">{job.ownerType}:{job.ownerId}</div>
                      <div className="text-xs text-destructive">{job.lastError ?? "Unknown error"}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Embedding 配置</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Embedding Provider</div>
                  <select
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={ragForm.embeddingProvider}
                    onChange={(event) =>
                      setRagForm((prev) => ({
                        ...prev,
                        embeddingProvider: event.target.value as EmbeddingProvider,
                      }))}
                  >
                    {(ragSettingsQuery.data?.data?.providers ?? []).map((item) => (
                      <option key={item.provider} value={item.provider}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Embedding Model</div>
                  <Input
                    value={ragForm.embeddingModel}
                    onChange={(event) =>
                      setRagForm((prev) => ({ ...prev, embeddingModel: event.target.value }))}
                    placeholder="例如 text-embedding-3-small"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                {(ragSettingsQuery.data?.data?.providers ?? [])
                  .filter((item) => item.provider === ragForm.embeddingProvider)
                  .map((item) => (
                    <div key={item.provider} className="flex gap-2">
                      <Badge variant="outline">{item.name}</Badge>
                      <Badge variant={item.isConfigured ? "default" : "outline"}>
                        {item.isConfigured ? "API Key 已配置" : "API Key 未配置"}
                      </Badge>
                    </div>
                  ))}
              </div>
              <Button
                onClick={() =>
                  saveRagMutation.mutate({
                    embeddingProvider: ragForm.embeddingProvider,
                    embeddingModel: ragForm.embeddingModel.trim(),
                  })}
                disabled={saveRagMutation.isPending || !ragForm.embeddingModel.trim()}
              >
                {saveRagMutation.isPending ? "保存中..." : "保存 Embedding 配置"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(selectedDocumentId)} onOpenChange={(open) => !open && setSelectedDocumentId("")}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-4xl flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>{selectedDocument?.title ?? "知识文档详情"}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="flex flex-wrap gap-2">
              <input
                type="file"
                accept=".txt,text/plain"
                className="rounded-md border bg-background p-2 text-sm"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) {
                    return;
                  }
                  try {
                    setVersionBusy(true);
                    await handleVersionUpload(file);
                    await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.detail(selectedDocumentId) });
                    await queryClient.invalidateQueries({ queryKey: queryKeys.knowledge.documents(`${keyword}-${status || "default"}`) });
                  } finally {
                    setVersionBusy(false);
                  }
                }}
                disabled={versionBusy}
              />
              {selectedDocumentId ? (
                <Button variant="outline" onClick={() => reindexMutation.mutate(selectedDocumentId)}>
                  手动重建索引
                </Button>
                ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline">文档状态：{formatStatus(selectedDocument?.status ?? "-")}</Badge>
              <Badge variant="outline">索引状态：{formatStatus(selectedDocument?.latestIndexStatus ?? "-")}</Badge>
            </div>
            {selectedDocument?.latestIndexStatus === "failed" && selectedDocument.latestIndexError ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                索引失败原因：{selectedDocument.latestIndexError}
              </div>
            ) : null}
            <Card>
              <CardHeader>
                <CardTitle>召回测试</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedDocument?.latestIndexStatus === "succeeded" ? (
                  <>
                    <div className="flex min-w-0 flex-col gap-2 md:flex-row">
                      <Input
                        value={recallQuery}
                        onChange={(event) => setRecallQuery(event.target.value)}
                        placeholder="输入一句问题或片段，测试当前激活版本的召回效果"
                      />
                      <Button
                        onClick={() =>
                          selectedDocumentId
                          && recallTestMutation.mutate({
                            documentId: selectedDocumentId,
                            query: recallQuery.trim(),
                            limit: 6,
                          })
                        }
                        disabled={recallTestMutation.isPending || !selectedDocumentId || !recallQuery.trim()}
                      >
                        {recallTestMutation.isPending ? "测试中..." : "开始测试"}
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      仅针对当前激活且已建立索引的版本执行召回测试。
                    </div>
                    {recallTestMutation.isError ? (
                      <div className="text-sm text-destructive">
                        {recallTestMutation.error instanceof Error
                          ? recallTestMutation.error.message
                          : "召回测试失败。"}
                      </div>
                    ) : null}
                    {recallResult ? (
                      <div className="min-w-0 space-y-2 overflow-hidden">
                        {recallResult.hits.length === 0 ? (
                          <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                            当前查询没有召回到任何分块内容。
                          </div>
                        ) : (
                          recallResult.hits.map((hit, index) => (
                            <div key={hit.id} className="min-w-0 max-w-full overflow-hidden rounded-md border p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0 break-all font-medium">
                                  命中 {index + 1} | {hit.source === "vector" ? "向量" : "关键词"} | 分块 #{hit.chunkOrder + 1}
                                </div>
                                <Badge variant="outline">得分 {hit.score.toFixed(4)}</Badge>
                              </div>
                              {hit.title ? (
                                <div className="mt-1 break-all text-xs text-muted-foreground">{hit.title}</div>
                              ) : null}
                              <pre className="mt-3 max-h-52 w-full max-w-full overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-all rounded-md bg-muted/40 p-3 text-xs">
                                {hit.chunkText}
                              </pre>
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    当前激活版本索引成功后，才可以执行召回测试。
                  </div>
                )}
              </CardContent>
            </Card>
            <div className="min-w-0 space-y-3">
              {(selectedDocument?.versions ?? []).map((version) => (
                <div key={version.id} className="min-w-0 max-w-full overflow-hidden rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">版本 v{version.versionNumber}</div>
                    {version.isActive ? <Badge>当前激活</Badge> : null}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    字符数 {version.charCount} | {new Date(version.createdAt).toLocaleString()}
                  </div>
                  {!version.isActive ? (
                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          activateVersionMutation.mutate({
                            documentId: selectedDocumentId,
                            versionId: version.id,
                          })}
                      >
                        切换为激活版本
                      </Button>
                    </div>
                  ) : null}
                  <pre className="mt-3 max-h-64 w-full max-w-full overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-all rounded-md bg-muted/40 p-3 text-xs">
                    {version.content}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
