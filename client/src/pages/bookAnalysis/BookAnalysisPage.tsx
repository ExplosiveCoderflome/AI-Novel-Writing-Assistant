import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BookAnalysisDetail,
  BookAnalysisPublishResult,
  BookAnalysisSection,
  BookAnalysisSectionKey,
  BookAnalysisStatus,
} from "@ai-novel/shared/types/bookAnalysis";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { useSearchParams } from "react-router-dom";
import LLMSelector from "@/components/common/LLMSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  archiveBookAnalysis,
  copyBookAnalysis,
  createBookAnalysis,
  downloadBookAnalysisExport,
  getBookAnalysis,
  listBookAnalyses,
  publishBookAnalysis,
  rebuildBookAnalysis,
  regenerateBookAnalysisSection,
  updateBookAnalysisSection,
} from "@/api/bookAnalysis";
import { getKnowledgeDocument, listKnowledgeDocuments } from "@/api/knowledge";
import { getNovelList } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { useLLMStore } from "@/store/llmStore";

interface SectionDraft {
  editedContent: string;
  notes: string;
  frozen: boolean;
}

interface LLMConfigState {
  provider: LLMProvider;
  model: string;
  temperature: number;
  maxTokens: number;
}

function formatStatus(status: BookAnalysisStatus | BookAnalysisSection["status"]): string {
  switch (status) {
    case "draft":
      return "草稿";
    case "queued":
      return "排队中";
    case "running":
      return "分析中";
    case "succeeded":
      return "已完成";
    case "failed":
      return "失败";
    case "archived":
      return "已归档";
    case "idle":
      return "未开始";
    default:
      return status;
  }
}

function syncDrafts(detail: BookAnalysisDetail): Record<string, SectionDraft> {
  return Object.fromEntries(
    detail.sections.map((section) => [
      section.id,
      {
        editedContent: section.editedContent ?? "",
        notes: section.notes ?? "",
        frozen: section.frozen,
      },
    ]),
  );
}

function createDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatDate(value?: string | null): string {
  if (!value) {
    return "未记录";
  }
  return new Date(value).toLocaleString();
}

export default function BookAnalysisPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const llmStore = useLLMStore();
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<BookAnalysisStatus | "">("");
  const [selectedAnalysisId, setSelectedAnalysisId] = useState(searchParams.get("analysisId") ?? "");
  const [selectedDocumentId, setSelectedDocumentId] = useState(searchParams.get("documentId") ?? "");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [selectedNovelId, setSelectedNovelId] = useState("");
  const [llmConfig, setLlmConfig] = useState<LLMConfigState>({
    provider: llmStore.provider,
    model: llmStore.model,
    temperature: llmStore.temperature,
    maxTokens: llmStore.maxTokens,
  });
  const [sectionDrafts, setSectionDrafts] = useState<Record<string, SectionDraft>>({});
  const [draftAnalysisId, setDraftAnalysisId] = useState("");
  const [publishFeedback, setPublishFeedback] = useState("");
  const [lastPublishResult, setLastPublishResult] = useState<BookAnalysisPublishResult | null>(null);

  const listKey = `${keyword.trim()}-${status || "all"}-${selectedDocumentId || "any"}`;

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
    queryKey: queryKeys.novels.list(1, 200),
    queryFn: () => getNovelList({ page: 1, limit: 200 }),
  });

  const sourceDocumentQuery = useQuery({
    queryKey: queryKeys.knowledge.detail(selectedDocumentId || "none"),
    queryFn: () => getKnowledgeDocument(selectedDocumentId),
    enabled: Boolean(selectedDocumentId),
  });

  const detailQuery = useQuery({
    queryKey: queryKeys.bookAnalysis.detail(selectedAnalysisId || "none"),
    queryFn: () => getBookAnalysis(selectedAnalysisId),
    enabled: Boolean(selectedAnalysisId),
    refetchInterval: (query) => {
      const nextStatus = query.state.data?.data?.status;
      return nextStatus === "queued" || nextStatus === "running" ? 4000 : false;
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
    const document = sourceDocumentQuery.data?.data;
    if (!selectedDocumentId || !document) {
      return;
    }
    const currentOptions = document.versions.map((item) => item.id);
    const fallbackVersionId = document.activeVersionId || document.versions[0]?.id || "";
    setSelectedVersionId((current) => (currentOptions.includes(current) ? current : fallbackVersionId));
  }, [selectedDocumentId, sourceDocumentQuery.data?.data]);

  useEffect(() => {
    const novels = novelsQuery.data?.data?.items ?? [];
    if (!selectedNovelId && novels.length > 0) {
      setSelectedNovelId(novels[0].id);
    }
  }, [novelsQuery.data?.data?.items, selectedNovelId]);

  useEffect(() => {
    const rows = analysesQuery.data?.data ?? [];
    if (selectedAnalysisId || rows.length === 0) {
      return;
    }
    const nextId = rows[0].id;
    setSelectedAnalysisId(nextId);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("analysisId", nextId);
      next.set("documentId", rows[0].documentId);
      return next;
    });
  }, [analysesQuery.data?.data, selectedAnalysisId, setSearchParams]);

  useEffect(() => {
    const detail = detailQuery.data?.data;
    if (!detail || draftAnalysisId === detail.id) {
      return;
    }
    setSectionDrafts(syncDrafts(detail));
    setDraftAnalysisId(detail.id);
  }, [detailQuery.data?.data, draftAnalysisId]);

  useEffect(() => {
    setPublishFeedback("");
    setLastPublishResult(null);
  }, [selectedAnalysisId]);

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
        `已发布：文档ID ${published.knowledgeDocumentId}，版本 v${published.knowledgeDocumentVersionNumber}，当前绑定数 ${published.bindingCount}`,
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

  const analyses = analysesQuery.data?.data ?? [];
  const selectedAnalysis = detailQuery.data?.data;
  const documentOptions = documentsQuery.data?.data ?? [];
  const novelOptions = novelsQuery.data?.data?.items ?? [];
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

  const handleCreate = async () => {
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
    });
  };

  const handleCopy = async () => {
    if (!selectedAnalysisId) {
      return;
    }
    await copyMutation.mutateAsync(selectedAnalysisId);
  };

  const handleDownload = async (format: "markdown" | "json") => {
    if (!selectedAnalysisId) {
      return;
    }
    const exported = await downloadBookAnalysisExport(selectedAnalysisId, format);
    createDownload(exported.blob, exported.fileName);
  };

  const handlePublish = async () => {
    if (!selectedAnalysisId || !selectedNovelId) {
      return;
    }
    await publishMutation.mutateAsync({
      id: selectedAnalysisId,
      novelId: selectedNovelId,
    });
  };

  const renderSectionCard = (section: BookAnalysisSection) => {
    const draft = sectionDrafts[section.id] ?? {
      editedContent: section.editedContent ?? "",
      notes: section.notes ?? "",
      frozen: section.frozen,
    };

    return (
      <Card key={section.id}>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CardTitle>{section.title}</CardTitle>
              <Badge variant="outline">{formatStatus(section.status)}</Badge>
              {draft.frozen ? <Badge variant="secondary">已冻结</Badge> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedAnalysis || draft.frozen || regenerateMutation.isPending}
                onClick={() => {
                  if (!selectedAnalysis) {
                    return;
                  }
                  regenerateMutation.mutate({
                    id: selectedAnalysis.id,
                    sectionKey: section.sectionKey,
                  });
                }}
              >
                单区重跑
              </Button>
              <Button
                size="sm"
                disabled={!selectedAnalysis || updateSectionMutation.isPending}
                onClick={() => {
                  if (!selectedAnalysis) {
                    return;
                  }
                  updateSectionMutation.mutate({
                    id: selectedAnalysis.id,
                    sectionKey: section.sectionKey,
                    editedContent: draft.editedContent.trim() ? draft.editedContent : null,
                    notes: draft.notes.trim() ? draft.notes : null,
                    frozen: draft.frozen,
                  });
                }}
              >
                保存整理
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.frozen}
              onChange={(event) =>
                setSectionDrafts((prev) => ({
                  ...prev,
                  [section.id]: {
                    ...draft,
                    frozen: event.target.checked,
                  },
                }))
              }
            />
            冻结本区，后续自动重跑不覆盖
          </label>

          <div className="space-y-2">
            <div className="text-sm font-medium">人工整理稿</div>
            <textarea
              className="min-h-[220px] w-full rounded-md border bg-background p-3 text-sm"
              value={draft.editedContent}
              onChange={(event) =>
                setSectionDrafts((prev) => ({
                  ...prev,
                  [section.id]: {
                    ...draft,
                    editedContent: event.target.value,
                  },
                }))
              }
              placeholder="这里可以整理、改写或补充本区拆书结果。留空时，展示和导出会回退到 AI 草稿。"
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">备注</div>
            <textarea
              className="min-h-[120px] w-full rounded-md border bg-background p-3 text-sm"
              value={draft.notes}
              onChange={(event) =>
                setSectionDrafts((prev) => ({
                  ...prev,
                  [section.id]: {
                    ...draft,
                    notes: event.target.value,
                  },
                }))
              }
              placeholder="记录你的判断、待验证问题或后续改写方向。"
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">AI 草稿</div>
            <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
              {section.aiContent?.trim() || "暂无 AI 草稿。"}
            </pre>
          </div>

          {section.evidence.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">本区证据</div>
              <div className="space-y-2">
                {section.evidence.map((item, index) => (
                  <div key={`${section.id}-${index}`} className="rounded-md border p-3 text-sm">
                    <div className="font-medium">
                      [{item.sourceLabel}] {item.label}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.excerpt}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>新建拆书</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">知识库文档</div>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={selectedDocumentId}
                  onChange={(event) => {
                    const nextDocumentId = event.target.value;
                    setSelectedDocumentId(nextDocumentId);
                    setSelectedVersionId("");
                    setSearchParams((prev) => {
                      const next = new URLSearchParams(prev);
                      if (nextDocumentId) {
                        next.set("documentId", nextDocumentId);
                      } else {
                        next.delete("documentId");
                      }
                      return next;
                    });
                  }}
                >
                  <option value="">选择知识库文档</option>
                  {documentOptions.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">文档版本</div>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={selectedVersionId}
                  onChange={(event) => setSelectedVersionId(event.target.value)}
                  disabled={!selectedDocumentId}
                >
                  <option value="">默认当前激活版本</option>
                  {versionOptions.map((version) => (
                    <option key={version.id} value={version.id}>
                      v{version.versionNumber} {version.isActive ? "(当前激活)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">分析模型</div>
                <LLMSelector
                  value={llmConfig}
                  onChange={(next) => {
                    setLlmConfig({
                      provider: next.provider,
                      model: next.model,
                      temperature: next.temperature ?? llmConfig.temperature,
                      maxTokens: next.maxTokens ?? llmConfig.maxTokens,
                    });
                  }}
                  showParameters
                />
              </div>

              <Button className="w-full" onClick={() => void handleCreate()} disabled={!selectedDocumentId || createMutation.isPending}>
                创建拆书项目
              </Button>

              {sourceDocumentQuery.data?.data ? (
                <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                  当前文档共 {sourceDocumentQuery.data.data.versions.length} 个版本，已有 {sourceDocumentQuery.data.data.bookAnalysisCount} 个拆书项目。
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>分析列表</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索标题、文档名或关键词" />
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={status}
                onChange={(event) => setStatus(event.target.value as BookAnalysisStatus | "")}
              >
                <option value="">全部状态</option>
                <option value="draft">草稿</option>
                <option value="queued">排队中</option>
                <option value="running">分析中</option>
                <option value="succeeded">已完成</option>
                <option value="failed">失败</option>
                <option value="archived">已归档</option>
              </select>

              <div className="space-y-2">
                {analyses.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`w-full rounded-md border p-3 text-left transition-colors ${
                      item.id === selectedAnalysisId ? "border-primary bg-primary/5" : "hover:bg-muted/30"
                    }`}
                    onClick={() => openAnalysis(item.id, item.documentId)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{item.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.documentTitle} | v{item.documentVersionNumber}
                        </div>
                      </div>
                      <Badge variant="outline">{formatStatus(item.status)}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      进度 {Math.round(item.progress * 100)}% | 更新于 {formatDate(item.updatedAt)}
                    </div>
                    {item.lastError ? (
                      <div className="mt-2 line-clamp-2 text-xs text-destructive">{item.lastError}</div>
                    ) : null}
                  </button>
                ))}

                {analyses.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    还没有拆书项目。先从上方选择一个知识库文档创建分析。
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          {selectedAnalysis ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle>{selectedAnalysis.title}</CardTitle>
                      <div className="text-sm text-muted-foreground">
                        {selectedAnalysis.documentTitle} | 来源版本 v{selectedAnalysis.documentVersionNumber}
                        {selectedAnalysis.isCurrentVersion ? "" : ` | 当前激活 v${selectedAnalysis.currentDocumentVersionNumber}`}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{formatStatus(selectedAnalysis.status)}</Badge>
                      <Badge variant="outline">进度 {Math.round(selectedAnalysis.progress * 100)}%</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleCopy()}
                        disabled={copyMutation.isPending}
                      >
                        复制为新项目
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rebuildMutation.mutate(selectedAnalysis.id)}
                        disabled={rebuildMutation.isPending || selectedAnalysis.status === "archived"}
                      >
                        重新分析
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void handleDownload("markdown")}>
                        导出 Markdown
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void handleDownload("json")}>
                        导出 JSON
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => archiveMutation.mutate(selectedAnalysis.id)}
                        disabled={archiveMutation.isPending || selectedAnalysis.status === "archived"}
                      >
                        归档
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!selectedAnalysis.isCurrentVersion ? (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                      当前拆书结果来自旧版本，知识库文档已经切换到 v{selectedAnalysis.currentDocumentVersionNumber}。旧分析不会被自动覆盖。
                    </div>
                  ) : null}
                  <div className="rounded-md border p-3 text-sm">
                    <div className="mb-2 font-medium">发布到小说知识库</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="h-9 min-w-[220px] rounded-md border bg-background px-2 text-sm"
                        value={selectedNovelId}
                        onChange={(event) => setSelectedNovelId(event.target.value)}
                      >
                        <option value="">选择目标小说</option>
                        {novelOptions.map((novel) => (
                          <option key={novel.id} value={novel.id}>
                            {novel.title}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        onClick={() => void handlePublish()}
                        disabled={!selectedNovelId || publishMutation.isPending || selectedAnalysis.status === "archived"}
                      >
                        发布并绑定
                      </Button>
                    </div>
                    {publishFeedback ? (
                      <div className="mt-2 text-xs text-muted-foreground">{publishFeedback}</div>
                    ) : null}
                    {lastPublishResult ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        发布时间：{formatDate(lastPublishResult.publishedAt)}
                      </div>
                    ) : null}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-md border p-3 text-sm">
                      <div className="font-medium">总评摘要</div>
                      <div className="mt-2 whitespace-pre-wrap text-muted-foreground">
                        {selectedAnalysis.summary?.trim() || "等待总览区块生成后自动汇总。"}
                      </div>
                    </div>
                    <div className="rounded-md border p-3 text-sm">
                      <div className="font-medium">运行信息</div>
                      <div className="mt-2 space-y-1 text-muted-foreground">
                        <div>Provider: {selectedAnalysis.provider ?? "deepseek"}</div>
                        <div>Model: {selectedAnalysis.model || "默认模型"}</div>
                        <div>Temperature: {selectedAnalysis.temperature ?? "默认"}</div>
                        <div>Max Tokens: {selectedAnalysis.maxTokens ?? "默认"}</div>
                        <div>最近运行: {formatDate(selectedAnalysis.lastRunAt)}</div>
                        <div>创建时间: {formatDate(selectedAnalysis.createdAt)}</div>
                      </div>
                    </div>
                  </div>
                  {selectedAnalysis.lastError ? (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                      最近错误：{selectedAnalysis.lastError}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {selectedAnalysis.sections.map(renderSectionCard)}

              <Card>
                <CardHeader>
                  <CardTitle>证据面板</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {aggregatedEvidence.map((item, index) => (
                    <div key={`${item.sectionTitle}-${index}`} className="rounded-md border p-3 text-sm">
                      <div className="font-medium">
                        {item.sectionTitle} | [{item.sourceLabel}] {item.label}
                      </div>
                      <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{item.excerpt}</div>
                    </div>
                  ))}
                  {aggregatedEvidence.length === 0 ? (
                    <div className="text-sm text-muted-foreground">当前还没有可展示的证据摘录。</div>
                  ) : null}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>拆书工作台</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                从左侧选择一个项目，或先创建新的拆书分析。
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
