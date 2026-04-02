import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RagHealthStatus, RagJobSummary } from "@/api/knowledge";
import {
  formatRagJobMeta,
  formatStatus,
  getRagJobProgressPercent,
  getRagJobProgressWidth,
} from "./knowledgeRagUi";

interface KnowledgeOpsTabProps {
  visibleDocumentsCount: number;
  enabledCount: number;
  disabledCount: number;
  ragHealth?: RagHealthStatus;
  ragHealthNotice?: string;
  jobs: RagJobSummary[];
  failedJobs: RagJobSummary[];
}

export default function KnowledgeOpsTab({
  visibleDocumentsCount,
  enabledCount,
  disabledCount,
  ragHealth,
  ragHealthNotice,
  jobs,
  failedJobs,
}: KnowledgeOpsTabProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>基础统计</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>当前列表文档数：{visibleDocumentsCount}</div>
          <div>启用文档数：{enabledCount}</div>
          <div>停用文档数：{disabledCount}</div>
          <div>
            RAG 健康：
            <Badge variant="outline" className="ml-2">
              {ragHealth?.ok ? "正常" : "异常"}
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
            {ragHealthNotice ? (
              <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                {ragHealthNotice}
              </div>
            ) : null}
            <div>
              Embedding：{ragHealth?.embedding.provider ?? "-"} / {ragHealth?.embedding.model ?? "-"} /{" "}
              {ragHealth?.embedding.ok ? "OK" : "FAIL"}
            </div>
            <div>Qdrant：{ragHealth?.qdrant.ok ? "OK" : "FAIL"}</div>
            {ragHealth?.embedding.detail ? (
              <div className="text-xs text-muted-foreground">{ragHealth.embedding.detail}</div>
            ) : null}
            {ragHealth?.qdrant.detail ? (
              <div className="text-xs text-muted-foreground">{ragHealth.qdrant.detail}</div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>最近任务</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {jobs.length === 0 ? (
              <div className="text-sm text-muted-foreground">当前还没有 RAG 任务。</div>
            ) : null}
            {jobs.map((job) => (
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
                {job.progress ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-medium">{job.progress.label}</span>
                      <span>{getRagJobProgressPercent(job)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: getRagJobProgressWidth(job) }}
                      />
                    </div>
                    {job.progress.detail ? (
                      <div className="text-xs text-muted-foreground">{job.progress.detail}</div>
                    ) : null}
                    <div className="text-xs text-muted-foreground">{formatRagJobMeta(job)}</div>
                  </div>
                ) : null}
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
                <div className="font-medium">
                  {job.ownerType}:{job.ownerId}
                </div>
                <div className="text-xs text-destructive">{job.lastError ?? "Unknown error"}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
