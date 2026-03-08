import type { Chapter, NovelBible, PipelineJob, PlotBeat, QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import LLMSelector from "@/components/common/LLMSelector";
import StreamOutput from "@/components/common/StreamOutput";
import WorldInjectionHint from "./WorldInjectionHint";

interface PipelineTabProps {
  novelId: string;
  worldInjectionSummary: string | null;
  hasCharacters: boolean;
  onGoToCharacterTab: () => void;
  pipelineForm: {
    startOrder: number;
    endOrder: number;
    maxRetries: number;
  };
  onPipelineFormChange: (field: "startOrder" | "endOrder" | "maxRetries", value: number) => void;
  maxOrder: number;
  onGenerateBible: () => void;
  onAbortBible: () => void;
  isBibleStreaming: boolean;
  bibleStreamContent: string;
  onGenerateBeats: () => void;
  onAbortBeats: () => void;
  isBeatsStreaming: boolean;
  beatsStreamContent: string;
  onRunPipeline: () => void;
  isRunningPipeline: boolean;
  pipelineMessage: string;
  pipelineJob?: PipelineJob;
  chapters: Chapter[];
  selectedChapterId: string;
  onSelectedChapterChange: (chapterId: string) => void;
  onReviewChapter: () => void;
  isReviewing: boolean;
  onRepairChapter: () => void;
  isRepairing: boolean;
  onGenerateHook: () => void;
  isGeneratingHook: boolean;
  reviewResult: {
    score: QualityScore;
    issues: ReviewIssue[];
  } | null;
  repairBeforeContent: string;
  repairAfterContent: string;
  repairStreamContent: string;
  isRepairStreaming: boolean;
  onAbortRepair: () => void;
  qualitySummary?: QualityScore;
  chapterReports: Array<{
    chapterId?: string | null;
    coherence: number;
    repetition: number;
    pacing: number;
    voice: number;
    engagement: number;
    overall: number;
  }>;
  bible?: NovelBible | null;
  plotBeats: PlotBeat[];
}

export default function PipelineTab(props: PipelineTabProps) {
  const {
    worldInjectionSummary,
    hasCharacters,
    onGoToCharacterTab,
    pipelineForm,
    onPipelineFormChange,
    maxOrder,
    onGenerateBible,
    onAbortBible,
    isBibleStreaming,
    bibleStreamContent,
    onGenerateBeats,
    onAbortBeats,
    isBeatsStreaming,
    beatsStreamContent,
    onRunPipeline,
    isRunningPipeline,
    pipelineMessage,
    pipelineJob,
    chapters,
    selectedChapterId,
    onSelectedChapterChange,
    onReviewChapter,
    isReviewing,
    onRepairChapter,
    isRepairing,
    onGenerateHook,
    isGeneratingHook,
    reviewResult,
    repairBeforeContent,
    repairAfterContent,
    repairStreamContent,
    isRepairStreaming,
    onAbortRepair,
    qualitySummary,
    chapterReports,
    bible,
    plotBeats,
  } = props;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>流水线与质量控制</CardTitle>
          <LLMSelector />
        </CardHeader>
        <CardContent className="space-y-3">
          <WorldInjectionHint worldInjectionSummary={worldInjectionSummary} />
          {!hasCharacters ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              <span>请先添加至少 1 个角色，再执行圣经/拍点/批量章节流水线。</span>
              <Button size="sm" variant="outline" onClick={onGoToCharacterTab}>去角色管理</Button>
            </div>
          ) : null}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">起始章节序号</div>
              <Input
                type="number"
                min={1}
                max={maxOrder}
                value={pipelineForm.startOrder}
                onChange={(event) => onPipelineFormChange("startOrder", Number(event.target.value) || 1)}
                placeholder="例如：1"
              />
              <div className="text-xs text-muted-foreground">从第几章开始纳入本次批量生成。</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">结束章节序号</div>
              <Input
                type="number"
                min={1}
                max={maxOrder}
                value={pipelineForm.endOrder}
                onChange={(event) => onPipelineFormChange("endOrder", Number(event.target.value) || 1)}
                placeholder="例如：10"
              />
              <div className="text-xs text-muted-foreground">到第几章结束（包含该章节）。</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">失败重试次数</div>
              <Input
                type="number"
                min={0}
                max={5}
                value={pipelineForm.maxRetries}
                onChange={(event) => onPipelineFormChange("maxRetries", Number(event.target.value) || 0)}
                placeholder="例如：2"
              />
              <div className="text-xs text-muted-foreground">单章不达标时，最多自动修复重跑几次。</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onGenerateBible} disabled={isBibleStreaming || !hasCharacters}>生成/更新作品圣经</Button>
            <Button variant="secondary" onClick={onAbortBible} disabled={!isBibleStreaming}>停止圣经生成</Button>
            <Button onClick={onGenerateBeats} disabled={isBeatsStreaming || !hasCharacters}>生成剧情拍点</Button>
            <Button variant="secondary" onClick={onAbortBeats} disabled={!isBeatsStreaming}>停止拍点生成</Button>
            <Button onClick={onRunPipeline} disabled={isRunningPipeline || !hasCharacters}>启动批量章节流水线</Button>
          </div>
          {pipelineMessage ? <div className="text-sm text-muted-foreground">{pipelineMessage}</div> : null}
          <div className="rounded-md border p-3 text-sm">
            <div className="mb-2 font-medium">任务状态</div>
            {pipelineJob ? (
              <div className="space-y-1">
                <div>任务ID：{pipelineJob.id}</div>
                <div>状态：{pipelineJob.status}</div>
                <div>进度：{Math.round((pipelineJob.progress ?? 0) * 100)}%</div>
                <div>完成章节：{pipelineJob.completedCount}/{pipelineJob.totalCount}</div>
                <div>重试次数：{pipelineJob.retryCount}/{pipelineJob.maxRetries}</div>
                {pipelineJob.error ? <div className="text-red-600">错误：{pipelineJob.error}</div> : null}
              </div>
            ) : (
              <div className="text-muted-foreground">暂无运行中的流水线任务。</div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>章节审校与修复</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <select
            className="w-full rounded-md border bg-background p-2 text-sm"
            value={selectedChapterId}
            onChange={(event) => onSelectedChapterChange(event.target.value)}
          >
            {chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>第{chapter.order}章 - {chapter.title}</option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onReviewChapter} disabled={isReviewing || !selectedChapterId}>执行章节审校</Button>
            <Button variant="secondary" onClick={onRepairChapter} disabled={isRepairing || !selectedChapterId}>
              按审校结果修复
            </Button>
            <Button variant="outline" onClick={onGenerateHook} disabled={isGeneratingHook || !selectedChapterId}>
              生成章节末钩子
            </Button>
          </div>
          {reviewResult ? (
            <div className="rounded-md border p-3 text-sm">
              <div className="mb-2 font-medium">审校评分</div>
              <div className="grid gap-1 md:grid-cols-3">
                <div>连贯性：{reviewResult.score.coherence}</div>
                <div>重复率：{reviewResult.score.repetition}</div>
                <div>节奏：{reviewResult.score.pacing}</div>
                <div>口吻：{reviewResult.score.voice}</div>
                <div>追更感：{reviewResult.score.engagement}</div>
                <div>综合：{reviewResult.score.overall}</div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                问题数：{reviewResult.issues.length}
              </div>
            </div>
          ) : null}
          <StreamOutput content={repairStreamContent} isStreaming={isRepairStreaming} onAbort={onAbortRepair} />
          {(repairBeforeContent || repairAfterContent) ? (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">修复前后对比</div>
                <div className="text-xs text-muted-foreground">
                  修复前：{repairBeforeContent.length} 字 | 修复后：{repairAfterContent.length} 字
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">修复前</div>
                  <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-2 text-xs">
                    {repairBeforeContent || "暂无"}
                  </pre>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">修复后</div>
                  <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-2 text-xs">
                    {repairAfterContent || "修复执行后将显示结果"}
                  </pre>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>质量报告</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {qualitySummary ? (
            <div className="grid gap-2 md:grid-cols-3">
              <Badge variant="outline">连贯性：{qualitySummary.coherence}</Badge>
              <Badge variant="outline">重复率：{qualitySummary.repetition}</Badge>
              <Badge variant="outline">节奏：{qualitySummary.pacing}</Badge>
              <Badge variant="outline">口吻：{qualitySummary.voice}</Badge>
              <Badge variant="outline">追更感：{qualitySummary.engagement}</Badge>
              <Badge variant="default">综合：{qualitySummary.overall}</Badge>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">暂无质量报告。</div>
          )}
          <div className="space-y-2 text-sm">
            {chapterReports.slice(0, 8).map((item, index) => (
              <div key={`${item.chapterId ?? "novel"}-${index}`} className="rounded-md border p-2">
                <div>章节：{item.chapterId ?? "全书"}</div>
                <div className="text-muted-foreground">
                  综合分：{item.overall}，连贯性：{item.coherence}，重复率：{item.repetition}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>流式输出调试区</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-2 text-sm font-medium">作品圣经输出</div>
              <StreamOutput content={bibleStreamContent} isStreaming={isBibleStreaming} onAbort={onAbortBible} />
            </div>
            <div>
              <div className="mb-2 text-sm font-medium">剧情拍点输出</div>
              <StreamOutput content={beatsStreamContent} isStreaming={isBeatsStreaming} onAbort={onAbortBeats} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>已保存的作品圣经</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {bible ? (
            <div className="space-y-2">
              <div className="rounded-md border p-2 whitespace-pre-wrap">
                <div className="font-medium">主线承诺</div>
                <div className="text-muted-foreground">{bible.mainPromise ?? "暂无"}</div>
              </div>
              <div className="rounded-md border p-2 whitespace-pre-wrap">
                <div className="font-medium">核心设定</div>
                <div className="text-muted-foreground">{bible.coreSetting ?? "暂无"}</div>
              </div>
              <div className="rounded-md border p-2 whitespace-pre-wrap">
                <div className="font-medium">禁止冲突规则</div>
                <div className="text-muted-foreground">{bible.forbiddenRules ?? "暂无"}</div>
              </div>
              <div className="rounded-md border p-2 whitespace-pre-wrap">
                <div className="font-medium">角色成长弧</div>
                <div className="text-muted-foreground">{bible.characterArcs ?? "暂无"}</div>
              </div>
              <div className="rounded-md border p-2 whitespace-pre-wrap">
                <div className="font-medium">世界规则</div>
                <div className="text-muted-foreground">{bible.worldRules ?? "暂无"}</div>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">暂无已保存的作品圣经。请先点击“生成/更新作品圣经”。</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>已保存的剧情拍点</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {plotBeats.length > 0 ? (
            plotBeats.slice(0, 30).map((beat) => (
              <div key={beat.id} className="rounded-md border p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">
                    第 {beat.chapterOrder ?? "-"} 章 · {beat.title}
                  </div>
                  <Badge variant="outline">{beat.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">类型：{beat.beatType}</div>
                <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{beat.content}</div>
              </div>
            ))
          ) : (
            <div className="text-muted-foreground">暂无已保存的剧情拍点。请先点击“生成剧情拍点”。</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
