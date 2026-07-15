import { useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { CircleAlert, FileText, LoaderCircle, RefreshCw, Upload, X } from "lucide-react";
import type { KnowledgeDocumentStatus, KnowledgeDocumentSummary } from "@ai-novel/shared/types/knowledge";
import {
  AssetLibraryEmptyState,
  AssetLibrarySection,
} from "@/components/assetLibrary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import OpenInCreativeHubButton from "@/components/creativeHub/OpenInCreativeHubButton";
import SelectField from "@/components/common/SelectField";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { RagJobSummary } from "@/api/knowledge";
import {
  formatRagJobMeta,
  formatStatus,
  getRagJobProgressPercent,
  getRagJobProgressWidth,
} from "./knowledgeRagUi";

function formatDocumentKind(kind: KnowledgeDocumentSummary["kind"]): string {
  return kind === "analysis_published" ? "拆书发布" : "上传文档";
}

interface KnowledgeDocumentsTabProps {
  uploadTitle: string;
  onUploadTitleChange: (value: string) => void;
  uploadDialogOpen: boolean;
  onUploadDialogOpenChange: (open: boolean) => void;
  uploadBusy: boolean;
  onUploadFile: (file: File) => Promise<void>;
  keyword: string;
  onKeywordChange: (value: string) => void;
  status: KnowledgeDocumentStatus | "";
  onStatusChange: (value: KnowledgeDocumentStatus | "") => void;
  documents: KnowledgeDocumentSummary[];
  isLoading: boolean;
  errorMessage?: string;
  onRetry: () => void;
  onClearFilters: () => void;
  latestKnowledgeDocumentJobs: Map<string, RagJobSummary>;
  onSelectDocument: (id: string) => void;
  onOpenRecallTest: (id: string) => void;
  onReindexDocument: (id: string) => void;
  onUpdateStatus: (id: string, status: KnowledgeDocumentStatus) => void;
}

export default function KnowledgeDocumentsTab({
  uploadTitle,
  onUploadTitleChange,
  uploadDialogOpen,
  onUploadDialogOpenChange,
  uploadBusy,
  onUploadFile,
  keyword,
  onKeywordChange,
  status,
  onStatusChange,
  documents,
  isLoading,
  errorMessage,
  onRetry,
  onClearFilters,
  latestKnowledgeDocumentJobs,
  onSelectDocument,
  onOpenRecallTest,
  onReindexDocument,
  onUpdateStatus,
}: KnowledgeDocumentsTabProps) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type === "text/plain" || file.name.endsWith(".txt"))) {
      setSelectedFile(file);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setSelectedFile(file);
  }, []);

  const handleConfirmUpload = async () => {
    if (!selectedFile) return;
    await handleUploadFile(selectedFile);
    setSelectedFile(null);
  };

  const handleDialogOpenChange = (open: boolean) => {
    onUploadDialogOpenChange(open);
    if (!open) setSelectedFile(null);
  };
  const statusOptions = [
    { value: "", label: "全部未归档" },
    { value: "enabled", label: "仅启用" },
    { value: "disabled", label: "仅停用" },
    { value: "archived", label: "仅归档" },
  ] as const;

  const confirmArchiveDocument = (document: KnowledgeDocumentSummary) => {
    const confirmed = window.confirm(
      `确认归档“${document.title}”吗？归档会移出默认检索和资料选择，原文与版本会保留，可在“仅归档”中恢复启用。`,
    );
    if (!confirmed) {
      return;
    }
    onUpdateStatus(document.id, "archived");
  };

  const handleUploadFile = async (file: File) => {
    await onUploadFile(file);
    onUploadDialogOpenChange(false);
  };

  const renderDocumentRow = (document: KnowledgeDocumentSummary) => {
    const documentJob = latestKnowledgeDocumentJobs.get(document.id);
    const displayIndexStatus = documentJob && (documentJob.status === "queued" || documentJob.status === "running")
      ? documentJob.status
      : document.status === "archived"
        ? "idle"
      : document.latestIndexStatus;

    return (
      <article key={document.id} className="px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="font-medium">{document.title}</div>
            <div className="text-xs text-muted-foreground">
              {document.fileName} | 版本数 {document.versionCount} | 当前 v{document.activeVersionNumber}
            </div>
            <div className="text-xs text-muted-foreground">拆书项目 {document.bookAnalysisCount}</div>
            {documentJob?.progress && (documentJob.status === "queued" || documentJob.status === "running") ? (
              <div className="mt-2 rounded-md border border-dashed p-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium">{documentJob.progress.label}</span>
                  <span>{getRagJobProgressPercent(documentJob)}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: getRagJobProgressWidth(documentJob) }}
                  />
                </div>
                {documentJob.progress.detail ? (
                  <div className="mt-2 text-xs text-muted-foreground">{documentJob.progress.detail}</div>
                ) : null}
                <div className="mt-1 text-xs text-muted-foreground">{formatRagJobMeta(documentJob)}</div>
              </div>
            ) : null}
            {document.latestIndexStatus === "failed" && document.latestIndexError ? (
              <div className="text-xs text-destructive">失败原因：{document.latestIndexError}</div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={document.kind === "analysis_published" ? "secondary" : "outline"}>
              {formatDocumentKind(document.kind)}
            </Badge>
            <Badge variant="outline">{formatStatus(document.status)}</Badge>
            <Badge variant="outline">{formatStatus(displayIndexStatus)}</Badge>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => onSelectDocument(document.id)}>
            查看版本
          </Button>
          {document.status === "archived" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onUpdateStatus(document.id, "enabled")}
            >
              恢复启用
            </Button>
          ) : (
            <>
              <OpenInCreativeHubButton
                bindings={{ knowledgeDocumentIds: [document.id] }}
                label="在创作中枢中继续"
              />
              <Button asChild size="sm" variant="outline">
                <Link to={`/book-analysis?documentId=${document.id}`}>新建拆书</Link>
              </Button>
              {document.kind === "analysis_published" && document.sourceAnalysisId ? (
                <Button asChild size="sm" variant="outline">
                  <Link to={`/book-analysis?analysisId=${document.sourceAnalysisId}`}>查看来源拆书</Link>
                </Button>
              ) : null}
              {document.latestIndexStatus === "succeeded" ? (
                <Button size="sm" variant="outline" onClick={() => onOpenRecallTest(document.id)}>
                  召回测试
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => onReindexDocument(document.id)}>
                重建索引
              </Button>
              {document.status === "enabled" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onUpdateStatus(document.id, "disabled")}
                >
                  停用
                </Button>
              ) : document.status === "disabled" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onUpdateStatus(document.id, "enabled")}
                >
                  启用
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={() => confirmArchiveDocument(document)}
              >
                归档
              </Button>
            </>
          )}
        </div>
      </article>
    );
  };

  const hasFilters = Boolean(keyword.trim() || status);

  const renderDocuments = () => {
    if (isLoading) {
      return (
        <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed border-border px-5 py-8 text-center" role="status">
          <div>
            <LoaderCircle className="mx-auto h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-foreground">正在加载创作资料</p>
            <p className="mt-1 text-sm text-muted-foreground">正在确认资料版本和索引状态。</p>
          </div>
        </div>
      );
    }

    if (errorMessage) {
      return (
        <AssetLibraryEmptyState
          icon={CircleAlert}
          title="创作资料暂时无法加载"
          description={`${errorMessage} 重新加载不会修改已有资料。`}
          action={(
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw className="h-4 w-4" />
              重新加载
            </Button>
          )}
        />
      );
    }

    if (documents.length === 0) {
      return (
        <AssetLibraryEmptyState
          icon={FileText}
          title={hasFilters ? "没有符合条件的资料" : "还没有创作资料"}
          description={hasFilters
            ? "调整搜索词或状态筛选，返回其他资料。"
            : "上传 TXT 资料后，系统会建立可供拆书、规划和正文创作使用的检索索引。"}
          action={hasFilters ? (
            <Button type="button" size="sm" variant="outline" onClick={onClearFilters}>
              清除筛选
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={() => onUploadDialogOpenChange(true)}>
              <Upload className="h-4 w-4" />
              上传第一份资料
            </Button>
          )}
        />
      );
    }

    return <div className="divide-y divide-border/70 rounded-md border border-border/80">{documents.map(renderDocumentRow)}</div>;
  };

  return (
    <>
      <AssetLibrarySection
        className="scroll-mt-5"
        title="创作资料"
        description="按标题或状态查找资料，确认索引完成后再用于拆书和正文创作。"
        actions={(
          <Button type="button" size="sm" variant="outline" onClick={() => onUploadDialogOpenChange(true)}>
            <Upload className="mr-2 h-4 w-4" />
            上传资料
          </Button>
        )}
      >
        <div id="knowledge-documents" className="space-y-4 scroll-mt-5">
          <div className="grid gap-2 md:grid-cols-[1fr_180px]">
            <Input
              value={keyword}
              onChange={(event) => onKeywordChange(event.target.value)}
              placeholder="按标题或文件名搜索"
            />
            <SelectField
              value={status}
              onValueChange={(value) => onStatusChange(value as KnowledgeDocumentStatus | "")}
              options={statusOptions.map((option) => ({ ...option }))}
              placeholder="筛选状态"
              className="space-y-0"
              triggerClassName="h-10"
            />
          </div>
          {renderDocuments()}
        </div>
      </AssetLibrarySection>

      <Dialog open={uploadDialogOpen} onOpenChange={handleDialogOpenChange}>
        <AppDialogContent
          className="max-w-lg"
          title="上传文档"
          description="添加可用于检索、拆书和创作参考的文本资料。"
        >
          <div className="space-y-4">
            <Input
              value={uploadTitle}
              onChange={(event) => onUploadTitleChange(event.target.value)}
              placeholder="可选标题，留空则使用文件名"
            />

            {/* 拖拽上传区域 */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !selectedFile && fileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (!selectedFile && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              role={selectedFile ? undefined : "button"}
              tabIndex={selectedFile ? undefined : 0}
              aria-label={selectedFile ? undefined : "选择要上传的 TXT 文本资料"}
              className={[
                "relative flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed p-8 text-center transition-all",
                dragOver
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : selectedFile
                    ? "border-primary/40 bg-primary/5"
                    : "border-muted-foreground/25 bg-muted/30 hover:border-primary/40 hover:bg-muted/50 cursor-pointer",
              ].join(" ")}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={handleFileSelect}
                disabled={uploadBusy}
              />

              {selectedFile ? (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                    className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="移除已选择的文件"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <div className={[
                    "flex h-12 w-12 items-center justify-center rounded-full transition-colors",
                    dragOver ? "bg-primary/15" : "bg-muted",
                  ].join(" ")}>
                    <Upload className={["h-6 w-6 transition-colors", dragOver ? "text-primary" : "text-muted-foreground"].join(" ")} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {dragOver ? "松开鼠标上传" : "拖拽文件到此处，或点击选择"}
                    </p>
                    <p className="text-xs text-muted-foreground">仅支持 .txt 文本文件</p>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground leading-5">
                同名标题会追加为新版本并设为当前版本
              </p>
              <Button
                type="button"
                size="sm"
                disabled={!selectedFile || uploadBusy}
                onClick={() => void handleConfirmUpload()}
              >
                {uploadBusy ? "上传中…" : "确认上传"}
              </Button>
            </div>
          </div>
        </AppDialogContent>
      </Dialog>
    </>
  );
}
