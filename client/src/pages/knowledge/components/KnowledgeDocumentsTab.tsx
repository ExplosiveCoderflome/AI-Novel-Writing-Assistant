import i18next from "i18next";
import { useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { CircleAlert, FileText, LoaderCircle, MoreHorizontal, RefreshCw, Upload, X } from "lucide-react";
import type { KnowledgeDocumentStatus, KnowledgeDocumentSummary } from "@ai-novel/shared/types/knowledge";
import {
  AssetLibraryEmptyState,
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
    { value: "", label: i18next.t("dict.gen_7d80f755") },
    { value: "enabled", label: i18next.t("dict.onlyEnable") },
    { value: "disabled", label: i18next.t("dict.onlyDisable") },
    { value: "archived", label: i18next.t("dict.onlyArchive") },
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
      <article
        key={document.id}
        className="flex min-h-64 flex-col rounded-2xl border border-border/35 bg-card/70 p-5 transition-all hover:border-border/65 hover:shadow-[0_12px_32px_rgba(15,23,42,0.035)]"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/[0.07] text-primary">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="truncate text-base font-semibold tracking-tight">{document.title}</div>
              <div className="truncate text-xs text-muted-foreground">{document.fileName}</div>
              <div className="text-xs text-muted-foreground">
                当前 v{document.activeVersionNumber} · 共 {document.versionCount} 个版本 · {formatDocumentKind(document.kind)}
              </div>
              {document.bookAnalysisCount > 0 ? (
                <div className="text-xs text-muted-foreground">关联 {document.bookAnalysisCount} 个拆书项目</div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="border-0 bg-muted/60 font-normal">{formatStatus(document.status)}</Badge>
            <Badge
              variant="secondary"
              className={`border-0 font-normal ${displayIndexStatus === "succeeded" ? "bg-success/10 text-success" : displayIndexStatus === "failed" ? "bg-destructive/10 text-destructive" : "bg-muted/60"}`}
            >
              {formatStatus(displayIndexStatus)}
            </Badge>
          </div>
        </div>
        <div className="mt-4 flex-1">
            {documentJob?.progress && (documentJob.status === "queued" || documentJob.status === "running") ? (
              <div className="rounded-xl bg-info/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium">{documentJob.progress.label}</span>
                  <span>{getRagJobProgressPercent(documentJob)}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
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
              <div className="rounded-xl bg-destructive/[0.055] px-3 py-2 text-xs leading-5 text-destructive">{document.latestIndexError}</div>
            ) : null}
        </div>
        <div className="mt-5 flex flex-wrap gap-2 border-t border-border/30 pt-4">
          <Button size="sm" variant="secondary" className="rounded-full" onClick={() => onSelectDocument(document.id)}>{i18next.t("knowledge.knowledgeLibraryOverview.dlv4t7")}</Button>
          {document.status === "archived" ? (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              onClick={() => onUpdateStatus(document.id, "enabled")}
            >{i18next.t("dict.gen_06dab430")}</Button>
          ) : (
            <>
              <OpenInCreativeHubButton
                bindings={{ knowledgeDocumentIds: [document.id] }}
                label={i18next.t("onboarding.quickSetupDialog.gj7f9j")}
                variant="outline"
                className="rounded-full"
              />
            </>
          )}
        </div>
        {document.status !== "archived" ? (
          <details className="group mt-3">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground marker:hidden">
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />{i18next.t("knowledge.knowledgeDocumentsTab.dd0d3p")}</summary>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="ghost" className="rounded-full">
                <Link to={`/book-analysis?documentId=${document.id}`}>{i18next.t("dict.gen_989a71a3")}</Link>
              </Button>
              {document.kind === "analysis_published" && document.sourceAnalysisId ? (
                <Button asChild size="sm" variant="ghost" className="rounded-full">
                  <Link to={`/book-analysis?analysisId=${document.sourceAnalysisId}`}>{i18next.t("dict.gen_31a84195")}</Link>
                </Button>
              ) : null}
              {document.latestIndexStatus === "succeeded" ? (
                <Button size="sm" variant="ghost" className="rounded-full" onClick={() => onOpenRecallTest(document.id)}>{i18next.t("dict.gen_2ed53cd2")}</Button>
              ) : null}
              <Button size="sm" variant="ghost" className="rounded-full" onClick={() => onReindexDocument(document.id)}>{i18next.t("knowledge.knowledgeDocumentsTab.isjjk0")}</Button>
              {document.status === "enabled" ? (
                <Button size="sm" variant="ghost" className="rounded-full" onClick={() => onUpdateStatus(document.id, "disabled")}>{i18next.t("dict.gen_5c56a889")}</Button>
              ) : document.status === "disabled" ? (
                <Button size="sm" variant="ghost" className="rounded-full" onClick={() => onUpdateStatus(document.id, "enabled")}>{i18next.t("dict.gen_7854b52a")}</Button>
              ) : null}
              <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground hover:text-destructive" onClick={() => confirmArchiveDocument(document)}>{i18next.t("dict.gen_2f51c18f")}</Button>
            </div>
          </details>
        ) : null}
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
            <p className="mt-3 text-sm font-medium text-foreground">{i18next.t("knowledge.knowledgeDocumentsTab.bea7t4")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{i18next.t("knowledge.knowledgeDocumentsTab.yb3m6k")}</p>
          </div>
        </div>
      );
    }

    if (errorMessage) {
      return (
        <AssetLibraryEmptyState
          icon={CircleAlert}
          title={i18next.t("knowledge.knowledgeDocumentsTab.xx0b24")}
          description={`${errorMessage} 重新加载不会修改已有资料。`}
          action={(
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw className="h-4 w-4" />{i18next.t("common.retry")}</Button>
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
            <Button type="button" size="sm" variant="outline" onClick={onClearFilters}>{i18next.t("visualAssets.visualAssetLibrary.ei6tl9")}</Button>
          ) : (
            <Button type="button" size="sm" onClick={() => onUploadDialogOpenChange(true)}>
              <Upload className="h-4 w-4" />{i18next.t("knowledge.knowledgeDocumentsTab.bcj6eg")}</Button>
          )}
        />
      );
    }

    return <div className="grid gap-4 xl:grid-cols-2">{documents.map(renderDocumentRow)}</div>;
  };

  return (
    <>
      <section className="scroll-mt-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">{i18next.t("knowledge.knowledgeDocumentsTab.i8p86d")}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{i18next.t("knowledge.knowledgeDocumentsTab.hs5bs5")}</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => onUploadDialogOpenChange(true)}>
            <Upload className="mr-2 h-4 w-4" />{i18next.t("knowledge.knowledgeDocumentsTab.a6m94b")}</Button>
        </div>
        <div id="knowledge-documents" className="mt-5 space-y-4 scroll-mt-5">
          <div className="grid gap-2 rounded-2xl bg-muted/20 p-3 md:grid-cols-[1fr_180px]">
            <Input
              value={keyword}
              onChange={(event) => onKeywordChange(event.target.value)}
              placeholder={i18next.t("dict.gen_87dbe672")}
            />
            <SelectField
              value={status}
              onValueChange={(value) => onStatusChange(value as KnowledgeDocumentStatus | "")}
              options={statusOptions.map((option) => ({ ...option }))}
              placeholder={i18next.t("dict.gen_91b44d6f")}
              className="space-y-0"
              triggerClassName="h-10"
            />
          </div>
          {renderDocuments()}
        </div>
      </section>

      <Dialog open={uploadDialogOpen} onOpenChange={handleDialogOpenChange}>
        <AppDialogContent
          className="max-w-lg"
          title={i18next.t("dict.uploadDocument")}
          description={i18next.t("knowledge.knowledgeDocumentsTab.o337fh")}
        >
          <div className="space-y-4">
            <Input
              value={uploadTitle}
              onChange={(event) => onUploadTitleChange(event.target.value)}
              placeholder={i18next.t("knowledge.knowledgeDocumentsTab.ilsav6")}
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
                    aria-label={i18next.t("knowledge.knowledgeDocumentsTab.j2ryne")}
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
                    <p className="text-xs text-muted-foreground">{i18next.t("knowledge.knowledgeDocumentsTab.4l0l3")}</p>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground leading-5">{i18next.t("knowledge.knowledgeDocumentsTab.ebs7qt")}</p>
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
