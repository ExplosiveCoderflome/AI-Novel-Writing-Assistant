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
  return kind === "analysis_published" ? "Open book release" : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
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
    { value: "", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." },
    { value: "enabled", label: "Enable only" },
    { value: "disabled", label: "Deactivate only" },
    { value: "archived", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." },
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
              {document.fileName} | Number of versions {document.versionCount} | current v{document.activeVersionNumber}
            </div>
            <div className="text-xs text-muted-foreground">Open book project {document.bookAnalysisCount}</div>
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
              <div className="text-xs text-destructive">Reason for failure:{document.latestIndexError}</div>
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
            View version
                              </Button>
          {document.status === "archived" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onUpdateStatus(document.id, "enabled")}
            >
              Restore enabled
                                    </Button>
          ) : (
            <>
              <OpenInCreativeHubButton
                bindings={{ knowledgeDocumentIds: [document.id] }}
                label="Continue in Creative Hub"
              />
              <Button asChild size="sm" variant="outline">
                <Link to={`/book-analysis?documentId=${document.id}`}>Create a new book</Link>
              </Button>
              {document.kind === "analysis_published" && document.sourceAnalysisId ? (
                <Button asChild size="sm" variant="outline">
                  <Link to={`/book-analysis?analysisId=${document.sourceAnalysisId}`}>View source split book</Link>
                </Button>
              ) : null}
              {document.latestIndexStatus === "succeeded" ? (
                <Button size="sm" variant="outline" onClick={() => onOpenRecallTest(document.id)}>
                  recall test
                                                    </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => onReindexDocument(document.id)}>
                Rebuild index
                                              </Button>
              {document.status === "enabled" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onUpdateStatus(document.id, "disabled")}
                >
                  deactivate
                                                    </Button>
              ) : document.status === "disabled" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onUpdateStatus(document.id, "enabled")}
                >
                  enable
                                                        </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={() => confirmArchiveDocument(document)}
              >
                Archive
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
            <p className="mt-3 text-sm font-medium text-foreground">Loading creative data</p>
            <p className="mt-1 text-sm text-muted-foreground">Confirming data version and index status.</p>
          </div>
        </div>
      );
    }

    if (errorMessage) {
      return (
        <AssetLibraryEmptyState
          icon={CircleAlert}
          title="The creative data cannot be loaded temporarily."
          description={`${errorMessage} 重新加载不会修改已有资料。`}
          action={(
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw className="h-4 w-4" />
              Reload
                              </Button>
          )}
        />
      );
    }

    if (documents.length === 0) {
      return (
        <AssetLibraryEmptyState
          icon={FileText}
          title={hasFilters ? "No matching data" : "No creative information yet"}
          description={hasFilters
            ? "Adjust search terms or status filters to return additional information."
            : "After uploading TXT data, the system will create a search index that can be used for book opening, planning, and text creation."}
          action={hasFilters ? (
            <Button type="button" size="sm" variant="outline" onClick={onClearFilters}>
              Clear filters
                              </Button>
          ) : (
            <Button type="button" size="sm" onClick={() => onUploadDialogOpenChange(true)}>
              <Upload className="h-4 w-4" />
              Upload the first information
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
        title="Creative materials"
        description="Search for information by title or status, and confirm that the index is complete before opening the book and creating the text."
        actions={(
          <Button type="button" size="sm" variant="outline" onClick={() => onUploadDialogOpenChange(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Upload information
                          </Button>
        )}
      >
        <div id="knowledge-documents" className="space-y-4 scroll-mt-5">
          <div className="grid gap-2 md:grid-cols-[1fr_180px]">
            <Input
              value={keyword}
              onChange={(event) => onKeywordChange(event.target.value)}
              placeholder="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
            />
            <SelectField
              value={status}
              onValueChange={(value) => onStatusChange(value as KnowledgeDocumentStatus | "")}
              options={statusOptions.map((option) => ({ ...option }))}
              placeholder="filter status"
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
          title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
          description="Add text material that can be used for searching, unpacking, and creating references."
        >
          <div className="space-y-4">
            <Input
              value={uploadTitle}
              onChange={(event) => onUploadTitleChange(event.target.value)}
              placeholder="Optional title, leave blank to use filename"
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
              aria-label={selectedFile ? undefined : "Select the TXT text data to upload"}
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
                    aria-label="Remove selected files"
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
                      {dragOver ? "Release the mouse to upload" : "Drag and drop files here, or click to select"}
                    </p>
                    <p className="text-xs text-muted-foreground">Only supports .txt text files</p>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground leading-5">
                The title with the same name will be appended as a new version and set as the current version
                                            </p>
              <Button
                type="button"
                size="sm"
                disabled={!selectedFile || uploadBusy}
                onClick={() => void handleConfirmUpload()}
              >
                {uploadBusy ? "Uploading…" : "Confirm upload"}
              </Button>
            </div>
          </div>
        </AppDialogContent>
      </Dialog>
    </>
  );
}
