import { buildStateContextBlockFromCanonical } from "../../novel/state/CanonicalStateService";
import { mapRowToPlan } from "../../novel/storyMacro/storyMacroPlanPersistence";
import { buildDefaultPlanMetadata } from "../plannerPlanMetadata";
import { buildChapterPlanContextBlocks } from "../plannerContextBlocks";
import { buildCurrentVolumeWindowSummary,buildPlannerConflictLevelAnchorContext,buildPlannerCharacterDynamicsContext,buildPlannerPayoffLedgerContext,buildPlannerStoryModeBlock,buildStoryMacroSummary,type PlannerMappedVolume } from "../plannerContextHelpers";
import { buildPlannerStateDrivenDirective,buildPlannerStateGoalText } from "../plannerStateDirectives";
import { buildPlannerPromptRequest } from "../plannerLlm";
import { readChapterPlanInputs } from "./readInputs";
import type { ChapterPlanPreparationDependencies,GenerateChapterPlanOptions } from "./types";

/** Read-only native source assembly. Caller owns dispatch and persistence. */
export async function prepareChapterPlan(novelId: string, chapterId: string, options: GenerateChapterPlanOptions, deps: ChapterPlanPreparationDependencies) {
  const {novel,chapter,bible,plotBeats,summaries,characters,bookPlan,arcPlans,volumePlans,recentAuditReports,recentDecisions,storyMacroPlanRow,styleEngine,pendingReviewProposalCount}=await readChapterPlanInputs(novelId,chapterId,options,deps);
  const storyModeBlock = buildPlannerStoryModeBlock(novel);
  const storyMacroPlan = storyMacroPlanRow ? mapRowToPlan(storyMacroPlanRow) : null;
  const payoffLedger = await deps.readPayoff(novelId, {
    chapterOrder: chapter.order,
  }).catch(error => { if (deps.strictSources) throw error; return {
    summary: {
      totalCount: 0,
      pendingCount: 0,
      urgentCount: 0,
      overdueCount: 0,
      paidOffCount: 0,
      failedCount: 0,
      updatedAt: null,
    },
    items: [],
    updatedAt: null,
  }; });
  const characterDynamicsOverview = await deps.readDynamics(novelId, {
    chapterOrder: chapter.order,
  }).catch(error => { if (deps.strictSources) throw error; return null; });
  const characterDynamicsContext = buildPlannerCharacterDynamicsContext(characterDynamicsOverview);
  const mappedVolumes = volumePlans.map((volume) => ({
    id: volume.id,
    novelId,
    sortOrder: volume.sortOrder,
    title: volume.title,
    summary: volume.summary,
    mainPromise: volume.mainPromise,
    escalationMode: volume.escalationMode,
    protagonistChange: volume.protagonistChange,
    climax: volume.climax,
    nextVolumeHook: volume.nextVolumeHook,
    resetPoint: volume.resetPoint,
    openPayoffs: volume.openPayoffsJson ? JSON.parse(volume.openPayoffsJson) as string[] : [],
    status: volume.status,
    sourceVersionId: volume.sourceVersionId,
    chapters: volume.chapters.map((item) => ({
      id: item.id,
      volumeId: item.volumeId,
      chapterOrder: item.chapterOrder,
      title: item.title,
      summary: item.summary,
      purpose: item.purpose,
      conflictLevel: item.conflictLevel,
      conflictLevelSource: item.conflictLevelSource === "user"
        ? "user" as const
        : item.conflictLevelSource === "ai"
          ? "ai" as const
          : null,
      revealLevel: item.revealLevel,
      targetWordCount: item.targetWordCount,
      mustAvoid: item.mustAvoid,
      taskSheet: item.taskSheet,
      payoffRefs: item.payoffRefsJson ? JSON.parse(item.payoffRefsJson) as string[] : [],
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    createdAt: volume.createdAt.toISOString(),
    updatedAt: volume.updatedAt.toISOString(),
  }));
  const plannerVolumes: PlannerMappedVolume[] = mappedVolumes.map((volume) => ({
    sortOrder: volume.sortOrder,
    title: volume.title,
    summary: volume.summary,
    mainPromise: volume.mainPromise,
    climax: volume.climax,
    openPayoffs: volume.openPayoffs,
    updatedAt: volume.updatedAt,
    chapters: volume.chapters.map((item) => ({
      chapterOrder: item.chapterOrder,
      title: item.title,
      summary: item.summary,
      conflictLevel: item.conflictLevel,
      conflictLevelSource: item.conflictLevelSource,
    })),
  }));
  const anchoredVolumeChapter = mappedVolumes
    .flatMap((volume) => volume.chapters)
    .find((item) => item.chapterOrder === chapter.order && item.conflictLevelSource === "user");
  const defaultMetadata = buildDefaultPlanMetadata("chapter", {
    chapterOrder: chapter.order,
    totalChapters: novel.estimatedChapterCount ?? null,
    expectation: chapter.expectation ?? null,
  });
  const openAuditIssues = recentAuditReports.flatMap((report) => report.issues.map((issue) => (
    `${issue.auditType}/${issue.severity}: ${issue.description} | 证据=${issue.evidence}`
  )));
  const resolvedStateDrivenContext = await deps.buildStateContext({
    novelId,
    chapterId,
    chapterOrder: chapter.order,
    includeCurrentChapterState: false,
    policy: {
      kickoffMode: "manual_start",
      advanceMode: options.replanContext ? "stage_review" : "manual",
    },
    pendingReviewProposalCount,
    openAuditIssueCount: openAuditIssues.length,
    hasRepairableDraft: Boolean(chapter.content?.trim()),
  });
  const plannerStateGoalText = buildPlannerStateGoalText({
    summary: resolvedStateDrivenContext.chapterStateGoal?.summary ?? null,
    targetConflicts: resolvedStateDrivenContext.chapterStateGoal?.targetConflicts ?? [],
    targetRelationships: resolvedStateDrivenContext.chapterStateGoal?.targetRelationships ?? [],
    targetPayoffs: resolvedStateDrivenContext.chapterStateGoal?.targetPayoffs ?? [],
    protectedSecrets: resolvedStateDrivenContext.protectedSecrets,
    recentTimeline: resolvedStateDrivenContext.recentTimeline.map((item) => item.summary),
  });
  const replanContextBlock = options.replanContext
    ? [
        `重规划原因：${options.replanContext.reason}`,
        `触发类型：${options.replanContext.triggerType}`,
        options.replanContext.triggerReason
          ? `状态触发理由：${options.replanContext.triggerReason}`
          : "",
        options.replanContext.windowReason
          ? `选窗理由：${options.replanContext.windowReason}`
          : "",
        options.replanContext.whyTheseChapters
          ? `为何改这几章：${options.replanContext.whyTheseChapters}`
          : "",
        `重规划窗口：第 ${options.replanContext.affectedChapterOrders.join("、")} 章`,
        typeof options.replanContext.anchorChapterOrder === "number"
          ? `锚点章节：第 ${options.replanContext.anchorChapterOrder} 章`
          : "",
        options.replanContext.sourceIssueIds.length > 0
          ? `来源问题：${options.replanContext.sourceIssueIds.join("、")}`
          : "",
        options.replanContext.blockingLedgerKeys?.length
          ? `账本风险：${options.replanContext.blockingLedgerKeys.join("、")}`
          : "",
        options.replanContext.replannedFromPlanId
          ? `上一版计划：${options.replanContext.replannedFromPlanId}`
          : "",
      ].filter(Boolean).join("\n")
    : "无";
  const contextBlocks = buildChapterPlanContextBlocks({
    novelTitle: novel.title,
    description: novel.description,
    genreName: novel.genre?.name ?? null,
    targetAudience: novel.targetAudience,
    bookSellingPoint: novel.bookSellingPoint,
    competingFeel: novel.competingFeel,
    first30ChapterPromise: novel.first30ChapterPromise,
    narrativePov: novel.narrativePov,
    pacePreference: novel.pacePreference,
    emotionIntensity: novel.emotionIntensity,
    styleTone: novel.styleTone,
    chapterExpectation: chapter.expectation,
    chapterTaskSheet: chapter.taskSheet,
    chapterTargetWordCount: chapter.targetWordCount,
    bible: bible?.rawContent ?? "无",
    styleEngine,
    outline: novel.outline,
    structuredOutline: novel.structuredOutline,
    mappedVolumes: plannerVolumes.map((volume) => ({
      sortOrder: volume.sortOrder,
      title: volume.title,
      summary: volume.summary,
      mainPromise: volume.mainPromise,
      climax: volume.climax,
      updatedAt: volume.updatedAt,
      chapters: volume.chapters,
    })),
    bookPlan: bookPlan ? `${bookPlan.title} | ${bookPlan.objective}${bookPlan.phaseLabel ? ` | 阶段=${bookPlan.phaseLabel}` : ""}` : "无",
    arcPlans: arcPlans.length > 0
      ? arcPlans.map((plan) => `${plan.externalRef ?? "-"} ${plan.title} | ${plan.objective}${plan.phaseLabel ? ` | 阶段=${plan.phaseLabel}` : ""}`).join("\n")
      : "无",
    characters: characters.map((item) => `${item.id}|${item.name}|${item.role}|goal=${item.currentGoal ?? ""}|state=${item.currentState ?? ""}`).join("\n") || "无",
    recentSummaries: summaries.map((item) => `${item.summary}`).join("\n") || "无",
    plotBeats: plotBeats.map((item) => `${item.chapterOrder ?? "-"} ${item.title} ${item.content}`).join("\n") || "无",
    stateSnapshot: buildStateContextBlockFromCanonical(resolvedStateDrivenContext.snapshot),
    openAuditIssues: openAuditIssues.join("\n") || "无",
    recentDecisions: recentDecisions.map((item) => `${item.category}/${item.importance}: ${item.content}`).join("\n") || "无",
    characterDynamicsSummary: characterDynamicsContext.summary,
    characterVolumeAssignments: characterDynamicsContext.volumeAssignments,
    characterRelationStages: characterDynamicsContext.relationStages,
    characterCandidateGuards: characterDynamicsContext.candidateGuards,
    stateDrivenDirective: buildPlannerStateDrivenDirective({
      nextAction: resolvedStateDrivenContext.nextAction,
      pendingReviewProposalCount,
      openAuditIssueCount: openAuditIssues.length,
    }),
    stateDrivenGoal: plannerStateGoalText,
    defaultMetadata: [
      `planRole=${defaultMetadata.planRole ?? "progress"} | phase=${defaultMetadata.phaseLabel ?? "无"}`,
      `mustAdvance=${defaultMetadata.mustAdvance.join("；") || "无"}`,
      `mustPreserve=${defaultMetadata.mustPreserve.join("；") || "无"}`,
    ].join("\n"),
    replanContext: replanContextBlock,
    replanConflictLevelAnchors: options.replanContext
      ? buildPlannerConflictLevelAnchorContext(plannerVolumes, options.replanContext.affectedChapterOrders)
      : "无",
    storyMacroSummary: buildStoryMacroSummary(storyMacroPlan),
    currentVolumeWindow: buildCurrentVolumeWindowSummary(plannerVolumes, chapter.order),
    payoffLedgerSummary: buildPlannerPayoffLedgerContext(payoffLedger, chapter.order),
    storyModeBlock,
  });

  return {request:buildPlannerPromptRequest({options,scopeLabel:`章节规划：第${chapter.order}章《${chapter.title}》`,novelId,chapterId,planLevel:"chapter",contextBlocks}),
    projection:{novelId,chapter:{...chapter,updatedAt:chapter.updatedAt.toISOString()},defaultMetadata,characters,characterDynamicsOverview,resolvedStateDrivenContext,anchoredVolumeChapter:anchoredVolumeChapter ?? null,replanContext:options.replanContext}};
}
export type PreparedChapterPlan=Awaited<ReturnType<typeof prepareChapterPlan>>;
