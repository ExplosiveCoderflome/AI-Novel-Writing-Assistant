import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { ChapterRuntimePackage } from "@ai-novel/shared/types/chapterRuntime";
import type { AuditReport, ReplanRecommendation, ReplanResult, StoryPlan, StoryStateSnapshot } from "@ai-novel/shared/types/novel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildReplanRecommendationFromAuditReports } from "../chapterPlanning.shared";

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
    planRole: chapterPlan.planRole ?? null,
    phaseLabel: chapterPlan.phaseLabel ?? null,
    title: chapterPlan.title,
    objective: chapterPlan.objective,
    participants: parseStringArray(chapterPlan.participantsJson),
    reveals: parseStringArray(chapterPlan.revealsJson),
    riskNotes: parseStringArray(chapterPlan.riskNotesJson),
    mustAdvance: parseStringArray(chapterPlan.mustAdvanceJson),
    mustPreserve: parseStringArray(chapterPlan.mustPreserveJson),
    sourceIssueIds: parseStringArray(chapterPlan.sourceIssueIdsJson),
    replannedFromPlanId: chapterPlan.replannedFromPlanId ?? null,
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

function buildOpenConflictView(runtimePackage: ChapterRuntimePackage | null) {
  return runtimePackage?.context.openConflicts ?? [];
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

function buildReplanSummary(
  runtimePackage: ChapterRuntimePackage | null,
  auditReports: AuditReport[] | undefined,
  replanRecommendation?: ReplanRecommendation | null,
) {
  if (runtimePackage?.replanRecommendation) {
    return runtimePackage.replanRecommendation;
  }
  if (replanRecommendation) {
    return replanRecommendation;
  }
  return buildReplanRecommendationFromAuditReports(auditReports);
}

function buildTriggerLabel(triggerType: string): string {
  switch (triggerType) {
    case "manual":
      return "Manual";
    case "auto_milestone":
      return "Auto milestone";
    case "before_pipeline":
      return "Before pipeline";
    default:
      return triggerType.replace(/_/g, " ");
  }
}

function buildWordControlModeLabel(mode: "prompt_only" | "balanced" | "hybrid" | string): string {
  switch (mode) {
    case "prompt_only":
      return t("gen.pages.novels.components.ChapterRuntimePanels.gen_e25414a2");
    case "balanced":
      return t("gen.pages.novels.components.ChapterRuntimePanels.gen_332305cd");
    case "hybrid":
      return t("gen.pages.novels.components.ChapterRuntimePanels.gen_d15aa8f4");
    default:
      return mode;
  }
}

function formatVariance(value: number): string {
  const percentage = Math.round(value * 100);
  return `${percentage > 0 ? "+" : ""}${percentage}%`;
}

function SeverityBadge({ severity }: { severity: string }) {
  const variant = severity === "critical" || severity === "high" ? "default" : "secondary";
  return <Badge variant={variant}>{severity}</Badge>;
}

export function ChapterRuntimeLengthCard(props: {
  runtimePackage: ChapterRuntimePackage | null;
}) {
  const lengthControl = props.runtimePackage?.lengthControl ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_7468e57c")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {lengthControl ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_07b417d5")}</div>
                <div className="mt-1 font-medium">{buildWordControlModeLabel(lengthControl.wordControlMode)}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {lengthControl.closingPhaseTriggered ? t("gen.pages.novels.components.ChapterRuntimePanels.gen_24dbd07a") : t("gen.pages.novels.components.ChapterRuntimePanels.stillFollowRegularProcess")}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_b8a39733")}</div>
                <div className="mt-1 font-medium">{t("gen.pages.novels.components.ChapterRuntimePanels.lengthRatio")}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_c1228fc9")}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_58e59c31")}</div>
                <div className="mt-1 font-medium">{t("gen.pages.novels.components.ChapterRuntimePanels.lengthRange")}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_187d0794")}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_d02cc836")}</div>
                <div className="mt-1 font-medium">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_ffca3f0a")}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  scene {lengthControl.generatedSceneCount}/{lengthControl.plannedSceneCount}
                </div>
              </div>
            </div>

            <div className="rounded-md border p-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_9af82857")}</div>
              <div className="mt-1">
                {lengthControl.lengthRepairPath.length > 0
                  ? lengthControl.lengthRepairPath.join(" -> ")
                  : t("gen.pages.novels.components.ChapterRuntimePanels.gen_ac4b5851")}
              </div>
              <div className="mt-1">
                {lengthControl.overlengthRepairApplied ? t("gen.pages.novels.components.ChapterRuntimePanels.gen_f576035b") : t("gen.pages.novels.components.ChapterRuntimePanels.gen_a507510d")}
              </div>
            </div>

            {lengthControl.sceneResults.length > 0 ? (
              <div className="space-y-2">
                {lengthControl.sceneResults.map((scene, index) => (
                  <div key={`${scene.sceneIndex}-${index}`} className="rounded-md border p-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Scene {scene.sceneIndex}</Badge>
                      <Badge variant="secondary">{t("gen.pages.novels.components.ChapterRuntimePanels.actualWordCount")}</Badge>
                      <Badge variant="outline">{buildWordControlModeLabel(scene.wordControlMode)}</Badge>
                      <Badge variant={scene.sceneStatus === "compressed" ? "default" : "outline"}>{scene.sceneStatus}</Badge>
                    </div>
                    <div className="mt-2 text-muted-foreground">
                      轮次 {scene.roundCount}，硬停 {scene.hardStopCount} 次
                      {scene.closingPhaseTriggered ? t("gen.pages.novels.components.ChapterRuntimePanels.gen_12efa642") : ""}
                    </div>
                    {scene.roundResults.length > 0 ? (
                      <div className="mt-2 space-y-1 rounded-md border bg-muted/15 p-2">
                        {scene.roundResults.map((round) => (
                          <div key={`${scene.sceneIndex}-${round.roundIndex}`} className="text-muted-foreground">
                            第 {round.roundIndex} 轮：建议 {round.suggestedWordCount ?? "-"} 字，实际 {round.actualWordCount} 字，
                            {round.isFinalRound ? t("gen.pages.novels.components.ChapterRuntimePanels.gen_f419afdf") : t("gen.pages.novels.components.ChapterRuntimePanels.middleRound")}，
                            {round.hardStopTriggered ? t("gen.pages.novels.components.ChapterRuntimePanels.gen_568b0ff2") : t("gen.pages.novels.components.ChapterRuntimePanels.gen_8f9fe9f8")}
                            {round.trimmedAtSentenceBoundary ? t("gen.pages.novels.components.ChapterRuntimePanels.gen_62c444be") : ""}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="text-muted-foreground">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_041fcfb2")}</div>
        )}
      </CardContent>
    </Card>
  );
}

export function ChapterRuntimeContextCard(props: {
  runtimePackage: ChapterRuntimePackage | null;
  chapterPlan?: StoryPlan | null;
  stateSnapshot?: StoryStateSnapshot | null;
}) {
  const plan = buildPlanView(props.runtimePackage, props.chapterPlan);
  const stateSnapshot = buildStateView(props.runtimePackage, props.stateSnapshot);
  const openConflicts = buildOpenConflictView(props.runtimePackage);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_357cf59a")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-1">
          <div className="font-medium">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_5d10bfe1")}</div>
          {plan ? (
            <>
              <div className="text-muted-foreground">{plan.title}</div>
              <div>{plan.objective}</div>
              {(plan.planRole || plan.phaseLabel) ? (
                <div className="text-xs text-muted-foreground">
                  {[plan.planRole ? `职责：${plan.planRole}` : "", plan.phaseLabel ? `阶段：${plan.phaseLabel}` : ""].filter(Boolean).join(" | ")}
                </div>
              ) : null}
              {plan.participants.length > 0 ? (
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_c5d0f7ea")}</div>
              ) : null}
              {plan.mustAdvance.length > 0 ? (
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_96aee986")}</div>
              ) : null}
              {plan.mustPreserve.length > 0 ? (
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_444616f7")}</div>
              ) : null}
              {plan.replannedFromPlanId ? (
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_2125e71c")}</div>
              ) : null}
              {plan.sourceIssueIds.length > 0 ? (
                <div className="text-xs text-muted-foreground">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_b3ab069c")}</div>
              ) : null}
              {plan.scenes.length > 0 ? (
                <div className="space-y-1 rounded-md border p-2 text-xs">
                  {plan.scenes.slice(0, 4).map((scene) => (
                    <div key={scene.id}>
                      <div className="font-medium">{scene.sortOrder}. {scene.title}</div>
                      <div className="text-muted-foreground">
                        {[scene.objective, scene.conflict, scene.reveal, scene.emotionBeat].filter(Boolean).join(" | ") || t("gen.pages.novels.components.ChapterRuntimePanels.gen_870436bf")}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="text-muted-foreground">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_37d95e40")}</div>
          )}
        </div>

        <div className="space-y-1">
          <div className="font-medium">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_0b933182")}</div>
          {stateSnapshot ? (
            <>
              <div>{t("gen.pages.novels.components.ChapterRuntimePanels.gen_stateSnaps_tg8j")}</div>
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
            <div className="text-muted-foreground">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_18321c41")}</div>
          )}
        </div>

        <div className="space-y-1">
          <div className="font-medium">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_037ca2b4")}</div>
          {openConflicts.length > 0 ? (
            <div className="space-y-2">
              {openConflicts.slice(0, 4).map((item) => (
                <div key={item.id} className="rounded-md border p-2 text-xs">
                  <div className="mb-1 flex items-center gap-2">
                    <SeverityBadge severity={item.severity} />
                    <span className="font-medium">{item.title}</span>
                  </div>
                  <div>{item.summary}</div>
                  {typeof item.lastSeenChapterOrder === "number" ? (
                    <div className="mt-1 text-muted-foreground">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_75b9531f")}</div>
                  ) : null}
                  {item.resolutionHint ? (
                    <div className="mt-1 text-muted-foreground">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_956bb255")}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_ace557d6")}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ChapterRuntimeAuditCard(props: {
  runtimePackage: ChapterRuntimePackage | null;
  auditReports?: AuditReport[];
  replanRecommendation?: ReplanRecommendation | null;
  onReplan?: () => void;
  isReplanning?: boolean;
  lastReplanResult?: ReplanResult | null;
}) {
  const audit = buildAuditView(props.runtimePackage, props.auditReports);
  const replanSummary = buildReplanSummary(
    props.runtimePackage,
    props.auditReports,
    props.replanRecommendation,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_8c425da0")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <div className="font-medium">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_7e7f5f51")}</div>
          <Badge variant={audit.hasBlockingIssues ? "default" : "outline"}>
            {audit.hasBlockingIssues ? t("gen.pages.novels.components.ChapterRuntimePanels.gen_2d25e6f9") : t("gen.pages.novels.components.ChapterRuntimePanels.gen_4281b2b4")}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          审计报告 {audit.reports.length} 份，未解决问题 {audit.openIssues.length} 条。
        </div>
        {replanSummary ? (
          <div className="rounded-md border p-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">
                后续章节计划：{replanSummary.recommended ? t("gen.pages.novels.components.ChapterRuntimePanels.gen_52bb74da") : t("gen.pages.novels.components.ChapterRuntimePanels.gen_f222164c")}
              </div>
              {typeof props.onReplan === "function" ? (
                <Button
                  size="sm"
                  variant={replanSummary.recommended ? "default" : "outline"}
                  onClick={props.onReplan}
                  disabled={props.isReplanning}
                >
                  {props.isReplanning ? t("gen.pages.novels.components.ChapterRuntimePanels.gen_3adeb767") : replanSummary.recommended ? t("gen.pages.novels.components.ChapterRuntimePanels.gen_f2148fff") : t("gen.pages.novels.components.ChapterRuntimePanels.gen_076ff1c0")}
                </Button>
              ) : null}
            </div>
            <div className="text-muted-foreground">{replanSummary.reason}</div>
            {replanSummary.blockingIssueIds.length > 0 ? (
              <div className="mt-1 text-muted-foreground">
                高风险问题：{replanSummary.blockingIssueIds.length}
              </div>
            ) : null}
          </div>
        ) : null}
        {props.lastReplanResult ? (
          <div className="rounded-md border bg-muted/20 p-2 text-xs">
            <div className="font-medium">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_dbef2a29")}</div>
            <div className="mt-1 text-muted-foreground">
              影响章节：{props.lastReplanResult.affectedChapterOrders.join(", ") || t("gen.pages.novels.components.ChapterRuntimePanels.gen_f61f4cf6")}
            </div>
            <div className="text-muted-foreground">
              调整窗口：{props.lastReplanResult.windowSize} | 触发方式：{buildTriggerLabel(props.lastReplanResult.triggerType)}
            </div>
            {props.lastReplanResult.sourceIssueIds.length > 0 ? (
              <div className="text-muted-foreground">
                来源问题：{props.lastReplanResult.sourceIssueIds.length}
              </div>
            ) : null}
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
                <div className="mt-1 text-muted-foreground">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_e6d69dda")}</div>
                <div className="mt-1 text-muted-foreground">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_5568c429")}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground">{t("gen.pages.novels.components.ChapterRuntimePanels.gen_5f718663")}</div>
        )}
      </CardContent>
    </Card>
  );
}
