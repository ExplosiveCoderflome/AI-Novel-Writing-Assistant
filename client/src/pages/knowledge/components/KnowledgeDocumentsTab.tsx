import { useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { Upload, FileText, X } from "lucide-react";
import type { KnowledgeDocumentStatus, KnowledgeDocumentSummary } from "@ai-novel/shared/types/knowledge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import OpenInCreativeHubButton from "@/components/creativeHub/OpenInCreativeHubButton";
import SelectField from "@/components/common/SelectField";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { RagJobSummary } from "@/api/knowledge";
import {
  formatRagJobMeta,
  formatStatus,
  getRagJobProgressPercent,
  getRagJobProgressWidth,
} from "./knowledgeRagUi";

export interface BatchUploadResult {
  fileName: string;
  status: "uploaded" | "skipped" | "failed";
  reason?: string;
}

function formatDocumentKind(kind: KnowledgeDocumentSummary["kind"]): string {
  return kind === "analysis_published" ? "拆书发布" : "上传文档";
}

interface KnowledgeDocumentsTabProps {
  uploadBusy: boolean;
  onUploadFiles: (files: File[]) => Promise<void>;
  uploadResults: BatchUploadResult[];
  onClearUploadResults: () => void;
  keyword: string;
  onKeywordChange: (value: string) => void;
  status: KnowledgeDocumentStatus | "";
  onStatusChange: (value: KnowledgeDocumentStatus | "") => void;
  documents: KnowledgeDocumentSummary[];
  latestKnowledgeDocumentJobs: Map<string, RagJobSummary>;
  onSelectDocument: (id: string) => void;
  onOpenRecallTest: (id: string) => void;
  onReindexDocument: (id: string) => void;
  onUpdateStatus: (id: string, status: KnowledgeDocumentStatus) => void;
}

export default function KnowledgeDocumentsTab({
  uploadBusy,
  onUploadFiles,
  uploadResults,
  onClearUploadResults,
  keyword,
  onKeywordChange,
  status,
  onStatusChange,
  documents,
  latestKnowledgeDocumentJobs,
  onSelectDocument,
  onOpenRecallTest,
  onReindexDocument,
  onUpdateStatus,
}: KnowledgeDocumentsTabProps) {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
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
    const fileList = e.dataTransfer.files;
    if (fileList && fileList.length > 0) {
      const files = Array.from(fileList).filter(
        (file) => file.type === "text/plain" || file.name.endsWith(".txt")
      );
      if (files.length > 0) {
        void onUploadFiles(files);
      }
    }
  }, [onUploadFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    e.target.value = "";
    if (fileList && fileList.length > 0) {
      const files = Array.from(fileList);
      void onUploadFiles(files);
    }
  }, [onUploadFiles]);

  const handleDialogOpenChange = (open: boolean) => {
    setUploadDialogOpen(open);
    if (!open) {
      onClearUploadResults();
    }
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

  const renderDocumentRow = (document: KnowledgeDocumentSummary) => {
    const documentJob = latestKnowledgeDocumentJobs.get(document.id);
    const displayIndexStatus = documentJob && (documentJob.status === "queued" || documentJob.status === "running")
      ? documentJob.status
      : document.status === "archived"
        ? "idle"
      : document.latestIndexStatus;

    return (
      <div key={document.id} className="rounded-md border p-3">
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
      </div>
    );
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>文档列表</CardTitle>
          <Button type="button" size="sm" onClick={() => setUploadDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            上传文档
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
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
          <div className="space-y-3">
            {documents.map(renderDocumentRow)}
            {documents.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                当前没有符合条件的知识文档。
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Dialog open={uploadDialogOpen} onOpenChange={handleDialogOpenChange}>
        <AppDialogContent
          className="max-w-lg"
          title="上传文档"
          description="支持一次选择多个 `.txt` 文件。已存在同名且内容相同的文档会自动跳过。"
        >
          <div className="space-y-4">
            {/* 拖拽上传区域 */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !uploadBusy && fileInputRef.current?.click()}
              className={[
                "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-all",
                dragOver
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-muted-foreground/25 bg-muted/30 hover:border-primary/40 hover:bg-muted/50 cursor-pointer",
              ].join(" ")}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,text/plain"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                disabled={uploadBusy}
              />

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
                <p className="text-xs text-muted-foreground">支持选择或拖入多个 .txt 文本文件</p>
              </div>
            </div>

            {uploadBusy ? (
              <div className="rounded-md border border-dashed p-3 text-sm text-center text-muted-foreground">
                正在上传并检查重复…
              </div>
            ) : null}

            {!uploadBusy && uploadResults.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">上传结果</span>
                  <Button size="sm" variant="ghost" onClick={onClearUploadResults} className="h-6 px-2 text-xs">
                    清除
                  </Button>
                </div>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                  {uploadResults.map((result, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs">
                      <span className={
                        result.status === "uploaded"
                          ? "text-green-600 dark:text-green-400"
                          : result.status === "skipped"
                            ? "text-yellow-600 dark:text-yellow-400"
                            : "text-red-600 dark:text-red-400"
                      }>
                        {result.status === "uploaded" ? "✓" : result.status === "skipped" ? "⊘" : "✗"}
                      </span>
                      <span className="min-w-0 truncate">{result.fileName}</span>
                      {result.reason ? (
                        <span className="ml-auto shrink-0 text-muted-foreground">{result.reason}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => handleDialogOpenChange(false)}>
                关闭
              </Button>
            </div>
          </div>
        </AppDialogContent>
      </Dialog>
    </>
  );
}
