import type { ChapterRuntimePackage } from "@ai-novel/shared/types/chapterRuntime";
import type { AuditReport, StoryPlan, StoryStateSnapshot } from "@ai-novel/shared/types/novel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function parseStringArray(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function buildPlanView(runtimePackage: ChapterRuntimePackage | null, chapterPlan: StoryPlan | null | undefined) {
  if (runtimePackage?.context.plan) {
    return runtimePackage.context.plan;
  }
  if (!chapterPlan) {
    return null;
  }
  return {
    id: chapterPlan.id,
    chapterId: chapterPlan.chapterId ?? null,
    title: chapterPlan.title,
    objective: chapterPlan.objective,
    participants: parseStringArray(chapterPlan.participantsJson),
    reveals: parseStringArray(chapterPlan.revealsJson),
    riskNotes: parseStringArray(chapterPlan.riskNotesJson),
    hookTarget: chapterPlan.hookTarget ?? null,
    rawPlanJson: chapterPlan.rawPlanJson ?? null,
    scenes: chapterPlan.scenes ?? [],
    createdAt: chapterPlan.createdAt,
    updatedAt: chapterPlan.updatedAt,
  };
}

function buildStateView(runtimePackage: ChapterRuntimePackage | null, stateSnapshot: StoryStateSnapshot | null | undefined) {
  if (runtimePackage?.context.stateSnapshot) {
    return runtimePackage.context.stateSnapshot;
  }
  if (!stateSnapshot) {
    return null;
  }
  return stateSnapshot;
}

function buildAuditView(runtimePackage: ChapterRuntimePackage | null, auditReports: AuditReport[] | undefined) {
  if (runtimePackage?.audit) {
    return runtimePackage.audit;
  }
  const reports = auditReports ?? [];
  const openIssues = reports.flatMap((report) => report.issues).filter((issue) => issue.status === "open");
  const reportScores = reports
    .map((report) => report.overallScore ?? null)
    .filter((score): score is number => typeof score === "number");
  const overall = reportScores.length > 0
    ? Math.round(reportScores.reduce((sum, score) => sum + score, 0) / reportScores.length)
    : 0;
  return {
    score: {
      coherence: overall,
      repetition: overall,
      pacing: overall,
      voice: overall,
      engagement: overall,
      overall,
    },
    reports,
    openIssues,
    hasBlockingIssues: openIssues.some((issue) => issue.severity === "high" || issue.severity === "critical"),
  };
}

function SeverityBadge({ severity }: { severity: string }) {
  const variant = severity === "critical" || severity === "high" ? "default" : "secondary";
  return <Badge variant={variant}>{severity}</Badge>;
}

export function ChapterRuntimeContextCard(props: {
  runtimePackage: ChapterRuntimePackage | null;
  chapterPlan?: StoryPlan | null;
  stateSnapshot?: StoryStateSnapshot | null;
}) {
  const plan = buildPlanView(props.runtimePackage, props.chapterPlan);
  const stateSnapshot = buildStateView(props.runtimePackage, props.stateSnapshot);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Plan / State</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-1">
          <div className="font-medium">章节规划</div>
          {plan ? (
            <>
              <div className="text-muted-foreground">{plan.title}</div>
              <div>{plan.objective}</div>
              {plan.participants.length > 0 ? (
                <div className="text-xs text-muted-foreground">参与角色：{plan.participants.join("、")}</div>
              ) : null}
              {plan.scenes.length > 0 ? (
                <div className="space-y-1 rounded-md border p-2 text-xs">
                  {plan.scenes.slice(0, 4).map((scene) => (
                    <div key={scene.id}>
                      <div className="font-medium">{scene.sortOrder}. {scene.title}</div>
                      <div className="text-muted-foreground">
                        {[scene.objective, scene.conflict, scene.reveal, scene.emotionBeat].filter(Boolean).join(" | ") || "无补充"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="text-muted-foreground">暂无章节规划。</div>
          )}
        </div>

        <div className="space-y-1">
          <div className="font-medium">状态快照</div>
          {stateSnapshot ? (
            <>
              <div>{stateSnapshot.summary || "暂无摘要"}</div>
              {stateSnapshot.characterStates.length > 0 ? (
                <div className="rounded-md border p-2 text-xs">
                  {stateSnapshot.characterStates.slice(0, 4).map((item) => (
                    <div key={item.characterId} className="text-muted-foreground">
                      {item.summary || item.emotion || item.currentGoal || item.characterId}
                    </div>
                  ))}
                </div>
              ) : null}
              {stateSnapshot.informationStates.length > 0 ? (
                <div className="text-xs text-muted-foreground">
                  知识状态：{stateSnapshot.informationStates.slice(0, 3).map((item) => item.fact).join("；")}
                </div>
              ) : null}
            </>
          ) : (
            <div className="text-muted-foreground">暂无状态快照。</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ChapterRuntimeAuditCard(props: {
  runtimePackage: ChapterRuntimePackage | null;
  auditReports?: AuditReport[];
}) {
  const audit = buildAuditView(props.runtimePackage, props.auditReports);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Audit</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <div className="font-medium">总分 {audit.score.overall}</div>
          <Badge variant={audit.hasBlockingIssues ? "default" : "outline"}>
            {audit.hasBlockingIssues ? "Blocking" : "Clear"}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          审计报告 {audit.reports.length} 份，未解决问题 {audit.openIssues.length} 条。
        </div>
        {props.runtimePackage?.replanRecommendation ? (
          <div className="rounded-md border p-2 text-xs">
            <div className="font-medium">
              Replan: {props.runtimePackage.replanRecommendation.recommended ? "Recommended" : "Not needed"}
            </div>
            <div className="text-muted-foreground">{props.runtimePackage.replanRecommendation.reason}</div>
          </div>
        ) : null}
        {audit.openIssues.length > 0 ? (
          <div className="space-y-2">
            {audit.openIssues.slice(0, 6).map((issue) => (
              <div key={issue.id} className="rounded-md border p-2 text-xs">
                <div className="mb-1 flex items-center gap-2">
                  <SeverityBadge severity={issue.severity} />
                  <span className="font-medium">{issue.code}</span>
                </div>
                <div>{issue.description}</div>
                <div className="mt-1 text-muted-foreground">证据：{issue.evidence}</div>
                <div className="mt-1 text-muted-foreground">建议：{issue.fixSuggestion}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground">暂无未解决审计问题。</div>
        )}
      </CardContent>
    </Card>
  );
}
