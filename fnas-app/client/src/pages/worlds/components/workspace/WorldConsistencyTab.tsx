import type { WorldConsistencyIssue, WorldConsistencyReport } from "@ai-novel/shared/types/world";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  localizeConsistencyField,
  localizeConsistencyIssueDetail,
  localizeConsistencyIssueMessage,
  localizeConsistencyIssueTitle,
  localizeConsistencySeverity,
  localizeConsistencySource,
  localizeConsistencyStatus,
} from "../../worldConsistencyUi";

interface WorldConsistencyTabProps {
  report: WorldConsistencyReport | null;
  issues: WorldConsistencyIssue[];
  checkPending: boolean;
  onCheck: () => void;
  onPatchIssue: (payload: { issueId: string; status: "open" | "resolved" | "ignored" }) => void;
}

export default function WorldConsistencyTab(props: WorldConsistencyTabProps) {
  const { report, issues, checkPending, onCheck, onPatchIssue } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>一致性检查</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={onCheck} disabled={checkPending}>
          {checkPending ? "检查中..." : "运行一致性检查"}
        </Button>
        {report ? (
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-md border p-3 text-sm">
              <div className="text-xs text-muted-foreground">检查状态</div>
              <div className="mt-1 font-semibold">{localizeConsistencyStatus(report.status)}</div>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <div className="text-xs text-muted-foreground">一致性分数</div>
              <div className="mt-1 font-semibold">{report.score}</div>
            </div>
            <div className="rounded-md border p-3 text-sm md:col-span-2">
              <div className="text-xs text-muted-foreground">检查摘要</div>
              <div className="mt-1 font-medium">{report.summary}</div>
              <div className="mt-2 text-xs text-muted-foreground">
                生成时间：{report.generatedAt ? new Date(report.generatedAt).toLocaleString() : "未知"}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">暂无一致性报告。</div>
        )}
        {issues.map((issue) => (
          <div key={issue.id} className="rounded-md border p-3 space-y-2">
            <div className="font-medium">
              [{localizeConsistencySeverity(issue.severity)}] {localizeConsistencyIssueTitle(issue.code)}
            </div>
            <div className="text-sm">{localizeConsistencyIssueMessage(issue)}</div>
            <div className="text-xs text-muted-foreground">
              {localizeConsistencyIssueDetail(issue) ?? "暂无补充说明"}
            </div>
            <div className="text-xs text-muted-foreground">
              来源：{localizeConsistencySource(issue.source)} | 影响字段：
              {localizeConsistencyField(issue.targetField)} | 当前状态：
              {localizeConsistencyStatus(issue.status)}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onPatchIssue({ issueId: issue.id, status: "resolved" })}
              >
                标记已解决
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onPatchIssue({ issueId: issue.id, status: "ignored" })}
              >
                忽略
              </Button>
            </div>
          </div>
        ))}
        {issues.length === 0 ? (
          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            还没有一致性问题记录，运行检查后会在这里展示结果。
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
