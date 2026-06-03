import {
  BOOK_ANALYSIS_PRESETS,
  BOOK_ANALYSIS_SECTIONS,
  type BookAnalysis,
  type BookAnalysisPreset,
  type BookAnalysisStatus,
} from "@ai-novel/shared/types/bookAnalysis";
import type { KnowledgeDocumentDetail, KnowledgeDocumentSummary } from "@ai-novel/shared/types/knowledge";
import LLMSelector from "@/components/common/LLMSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { LLMConfigState } from "../bookAnalysis.types";
import { formatDate, formatStatus } from "../bookAnalysis.utils";

interface BookAnalysisSidebarProps {
  selectedDocumentId: string;
  selectedVersionId: string;
  keyword: string;
  status: BookAnalysisStatus | "";
  analysisPreset: BookAnalysisPreset;
  llmConfig: LLMConfigState;
  documentOptions: KnowledgeDocumentSummary[];
  versionOptions: KnowledgeDocumentDetail["versions"];
  sourceDocument?: KnowledgeDocumentDetail;
  analyses: BookAnalysis[];
  selectedAnalysisId: string;
  createPending: boolean;
  onSelectDocument: (documentId: string) => void;
  onSelectVersion: (versionId: string) => void;
  onKeywordChange: (keyword: string) => void;
  onStatusChange: (status: BookAnalysisStatus | "") => void;
  onAnalysisPresetChange: (preset: BookAnalysisPreset) => void;
  onLlmConfigChange: (config: LLMConfigState) => void;
  onCreate: () => void;
  onOpenAnalysis: (analysisId: string, documentId: string) => void;
}

const ESTIMATED_SEGMENT_CHARS = 10_000;
const MAX_ESTIMATED_SEGMENTS = 12;

function formatCount(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function getBookAnalysisScaleLabel(charCount: number): { label: string; tone: string } {
  if (charCount >= 300_000) {
    return { label: "大型书籍", tone: "建议使用成本更可控的模型，或先拆分文档范围。" };
  }
  if (charCount >= 100_000) {
    return { label: "中等体量", tone: "适合标准拆书，生成时间和 token 用量会随章节规模增加。" };
  }
  return { label: "轻量体量", tone: "适合快速检查结构、人物和写法特征。" };
}

function getPresetSectionTitles(sectionKeys: readonly string[]): string {
  return sectionKeys
    .map((key) => BOOK_ANALYSIS_SECTIONS.find((section) => section.key === key)?.title)
    .filter((title): title is string => Boolean(title))
    .join("、");
}

export default function BookAnalysisSidebar(props: BookAnalysisSidebarProps) {
  const {
    selectedDocumentId,
    selectedVersionId,
    keyword,
    status,
    analysisPreset,
    llmConfig,
    documentOptions,
    versionOptions,
    sourceDocument,
    analyses,
    selectedAnalysisId,
    createPending,
    onSelectDocument,
    onSelectVersion,
    onKeywordChange,
    onStatusChange,
    onAnalysisPresetChange,
    onLlmConfigChange,
    onCreate,
    onOpenAnalysis,
  } = props;
  const selectedSourceVersion = sourceDocument?.versions.find((version) => version.id === selectedVersionId)
    ?? sourceDocument?.versions.find((version) => version.isActive)
    ?? sourceDocument?.versions[0];
  const sourceCharCount = selectedSourceVersion?.charCount ?? selectedSourceVersion?.content.length ?? 0;
  const estimatedSegmentCount = sourceCharCount > 0
    ? Math.min(MAX_ESTIMATED_SEGMENTS, Math.max(1, Math.ceil(sourceCharCount / ESTIMATED_SEGMENT_CHARS)))
    : 0;
  const selectedPreset = BOOK_ANALYSIS_PRESETS.find((preset) => preset.key === analysisPreset) ?? BOOK_ANALYSIS_PRESETS[1];
  const estimatedSectionCount = selectedPreset.sectionKeys.length;
  const estimatedLlmCalls = estimatedSegmentCount > 0 ? estimatedSegmentCount + estimatedSectionCount : 0;
  const scale = getBookAnalysisScaleLabel(sourceCharCount);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>创建拆书分析</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">知识文档</div>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={selectedDocumentId}
              onChange={(event) => onSelectDocument(event.target.value)}
            >
              <option value="">选择文档</option>
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
              onChange={(event) => onSelectVersion(event.target.value)}
              disabled={!selectedDocumentId}
            >
              <option value="">使用当前激活版本</option>
              {versionOptions.map((version) => (
                <option key={version.id} value={version.id}>
                  v{version.versionNumber} {version.isActive ? "（当前）" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">模型</div>
            <LLMSelector
              value={llmConfig}
              onChange={(next) =>
                onLlmConfigChange({
                  provider: next.provider,
                  model: next.model,
                  temperature: next.temperature ?? llmConfig.temperature,
                  maxTokens: next.maxTokens ?? llmConfig.maxTokens,
                })
              }
              showParameters
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">拆书范围</div>
            <div className="grid gap-2">
              {BOOK_ANALYSIS_PRESETS.map((preset) => {
                const selected = preset.key === analysisPreset;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    className={`rounded-md border p-3 text-left transition-colors ${
                      selected ? "border-primary bg-primary/5" : "hover:bg-muted/30"
                    }`}
                    onClick={() => onAnalysisPresetChange(preset.key)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">{preset.title}</div>
                      <div className="text-xs text-muted-foreground">{preset.sectionKeys.length} 项</div>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">{preset.summary}</div>
                    <div className="mt-2 text-xs leading-5 text-muted-foreground">
                      包含：{getPresetSectionTitles(preset.sectionKeys)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            拆书会根据书籍内容长度消耗模型 token。书籍越长，分析时间和 token 用量通常越高；建议先确认文档范围，再开始分析。
          </div>

          {selectedSourceVersion ? (
            <div className="rounded-md border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
              <div className="font-medium text-foreground">本次拆书体量：{scale.label}</div>
              <div className="mt-1">
                约 {formatCount(sourceCharCount)} 字，预计拆成 {estimatedSegmentCount} 个原文片段，
                约 {estimatedLlmCalls} 次模型调用。
              </div>
              <div className="mt-1">{scale.tone}</div>
            </div>
          ) : null}

          <Button className="w-full" onClick={onCreate} disabled={!selectedDocumentId || createPending}>
            创建
          </Button>

          {sourceDocument ? (
            <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
              版本数：{sourceDocument.versions.length} | 拆书分析：{sourceDocument.bookAnalysisCount}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>分析列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={keyword} onChange={(event) => onKeywordChange(event.target.value)} placeholder="搜索标题或关键词" />
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={status}
            onChange={(event) => onStatusChange(event.target.value as BookAnalysisStatus | "")}
          >
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="queued">排队中</option>
            <option value="running">运行中</option>
            <option value="succeeded">成功</option>
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
                onClick={() => onOpenAnalysis(item.id, item.documentId)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.documentTitle} | v{item.documentVersionNumber}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {item.publishedDocumentId && (
                      <Badge variant="secondary" className="text-xs">已发布</Badge>
                    )}
                    <Badge variant="outline">{formatStatus(item.status)}</Badge>
                  </div>
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
                暂无拆书分析，请先选择知识文档并创建。
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
