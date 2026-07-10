import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useMemo, useState } from "react";
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
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const openIssues = useMemo(() => issues.filter((issue) => issue.status === "open"), [issues]);
  const activeIssue = useMemo(() => {
    if (issues.length === 0) {
      return null;
    }
    return issues.find((issue) => issue.id === activeIssueId)
      ?? openIssues[0]
      ?? issues[0];
  }, [activeIssueId, issues, openIssues]);
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warnCount = issues.filter((issue) => issue.severity === "warn").length;
  const resolvedCount = issues.filter((issue) => issue.status === "resolved").length;
  const ignoredCount = issues.filter((issue) => issue.status === "ignored").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("gen.pages.worlds.components.workspace.WorldConsistencyTab.worldManualCheck")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 rounded-md border p-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-medium">{t("gen.pages.worlds.components.workspace.WorldConsistencyTab.worldManualCheck")}</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              检查核心规则、题材信号、力量体系和冲突支撑是否互相冲突。发现问题后逐条处理即可。
            </div>
          </div>
          <Button onClick={onCheck} disabled={checkPending}>
            {checkPending ? t("gen.pages.worlds.components.workspace.WorldConsistencyTab.gen_0410cb00") : t("gen.pages.worlds.components.workspace.WorldConsistencyTab.gen_bb0d6dab")}
          </Button>
        </div>

        {report ? (
          <div className="grid gap-3 md:grid-cols-5">
            <div className="rounded-md border p-3 text-sm">
              <div className="text-xs text-muted-foreground">{t("gen.pages.worlds.components.workspace.WorldConsistencyTab.gen_a0a7b274")}</div>
              <div className="mt-1 font-semibold">{localizeConsistencyStatus(report.status)}</div>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <div className="text-xs text-muted-foreground">{t("gen.pages.worlds.components.workspace.WorldConsistencyTab.consistencyScore")}</div>
              <div className="mt-1 font-semibold">{report.score}</div>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <div className="text-xs text-muted-foreground">{t("gen.pages.worlds.components.workspace.WorldConsistencyTab.gen_047109de")}</div>
              <div className="mt-1 font-semibold">{openIssues.length}</div>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <div className="text-xs text-muted-foreground">{t("gen.pages.worlds.components.workspace.WorldConsistencyTab.criticalWarning")}</div>
              <div className="mt-1 font-semibold">{errorCount}/{warnCount}</div>
            </div>
            <div className="rounded-md border p-3 text-sm">
              <div className="text-xs text-muted-foreground">{t("gen.pages.worlds.components.workspace.WorldConsistencyTab.gen_5ad6056a")}</div>
              <div className="mt-1 font-semibold">{resolvedCount + ignoredCount}</div>
            </div>
            <div className="rounded-md border p-3 text-sm md:col-span-5">
              <div className="text-xs text-muted-foreground">{t("gen.pages.worlds.components.workspace.WorldConsistencyTab.gen_1303e16b")}</div>
              <div className="mt-1 font-medium">{report.summary}</div>
              <div className="mt-2 text-xs text-muted-foreground">
                生成时间：{report.generatedAt ? new Date(report.generatedAt).toLocaleString() : t("gen.pages.worlds.components.workspace.WorldConsistencyTab.gen_1622dc9b")}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            运行检查后，这里会展示世界手册的体检结果和需要处理的问题。
          </div>
        )}

        {issues.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-2 rounded-md border p-3">
              <div className="text-sm font-medium">{t("gen.pages.worlds.components.workspace.WorldConsistencyTab.gen_31cb8c11")}</div>
              {issues.map((issue) => {
                const selected = activeIssue?.id === issue.id;
                return (
                  <button
                    key={issue.id}
                    type="button"
                    className={[
                      "w-full rounded-md border p-2 text-left text-sm transition-colors",
                      selected ? "border-primary bg-primary/5" : "border-border/70 bg-background hover:bg-muted/40",
                    ].join(" ")}
                    onClick={() => setActiveIssueId(issue.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {localizeConsistencyIssueTitle(issue.code)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {localizeConsistencyStatus(issue.status)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {localizeConsistencySeverity(issue.severity)} · {localizeConsistencyField(issue.targetField)}
                    </div>
                  </button>
                );
              })}
            </div>

            {activeIssue ? (
              <div className="rounded-md border p-3 space-y-3">
                <div>
                  <div className="font-medium">
                    [{localizeConsistencySeverity(activeIssue.severity)}] {localizeConsistencyIssueTitle(activeIssue.code)}
                  </div>
                  <div className="mt-2 text-sm">{localizeConsistencyIssueMessage(activeIssue)}</div>
                </div>
                <div className="rounded-md border border-dashed p-3 text-sm leading-6 text-muted-foreground">
                  {localizeConsistencyIssueDetail(activeIssue) ?? t("gen.pages.worlds.components.workspace.WorldConsistencyTab.gen_99d72418")}
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <div className="rounded-md border p-3 text-xs">
                    <div className="text-muted-foreground">{t("gen.pages.worlds.components.workspace.WorldConsistencyTab.gen_a53a6102")}</div>
                    <div className="mt-1 font-medium text-foreground">{localizeConsistencySource(activeIssue.source)}</div>
                  </div>
                  <div className="rounded-md border p-3 text-xs">
                    <div className="text-muted-foreground">{t("gen.pages.worlds.components.workspace.WorldConsistencyTab.gen_2ab7c0f2")}</div>
                    <div className="mt-1 font-medium text-foreground">{localizeConsistencyField(activeIssue.targetField)}</div>
                  </div>
                  <div className="rounded-md border p-3 text-xs">
                    <div className="text-muted-foreground">{t("gen.pages.worlds.components.workspace.WorldConsistencyTab.gen_21b31425")}</div>
                    <div className="mt-1 font-medium text-foreground">{localizeConsistencyStatus(activeIssue.status)}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onPatchIssue({ issueId: activeIssue.id, status: "resolved" })}
                    disabled={activeIssue.status === "resolved"}
                  >
                    标记已解决
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onPatchIssue({ issueId: activeIssue.id, status: "ignored" })}
                    disabled={activeIssue.status === "ignored"}
                  >
                    忽略
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            还没有一致性问题记录，运行检查后会在这里展示结果。
          </div>
        )}
      </CardContent>
    </Card>
  );
}
