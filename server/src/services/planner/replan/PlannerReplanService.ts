import type { AuditReport, ReplanResult } from "@ai-novel/shared/types/novel";
import { prisma } from "../../../db/prisma";
import { contextAssemblyService } from "../../novel/production/ContextAssemblyService";
import { payoffLedgerSyncService } from "../../payoff/PayoffLedgerSyncService";
import type { PlannerLlmOptions } from "../plannerLlm";
import { replanWindowDecisionService } from "../ReplanWindowDecisionService";

export interface ReplanInput extends PlannerLlmOptions {
  taskStyleProfileId?: string;
  chapterId?: string;
  triggerType?: string;
  sourceIssueIds?: string[];
  windowSize?: number;
  reason: string;
}

interface PlannerReplanAdapter {
  getChapterPlan(novelId: string, chapterId: string): Promise<{ id: string } | null>;
  generateChapterPlan(
    novelId: string,
    chapterId: string,
    options: PlannerLlmOptions & {
      replanContext: {
        reason: string;
        triggerType: string;
        triggerReason?: string;
        windowReason?: string;
        whyTheseChapters?: string;
        sourceIssueIds: string[];
        windowIndex: number;
        windowSize: number;
        affectedChapterOrders: number[];
        anchorChapterOrder?: number | null;
        blockingLedgerKeys?: string[];
        replannedFromPlanId: string | null;
      };
    },
  ): Promise<ReplanResult["primaryPlan"]>;
}

export class PlannerReplanService {
  async replan(
    novelId: string,
    input: ReplanInput,
    planner: PlannerReplanAdapter,
  ): Promise<ReplanResult> {
    const targetChapter = input.chapterId
      ? await prisma.chapter.findFirst({
          where: { id: input.chapterId, novelId },
          select: { id: true, order: true },
        })
      : await prisma.chapter.findFirst({
          where: { novelId },
          orderBy: { order: "desc" },
          select: { id: true, order: true },
        });
    if (!targetChapter) {
      throw new Error("当前小说没有可重规划的章节。");
    }
    const [allChapters, recentAuditReports, pendingReviewProposalCount, payoffLedger] = await Promise.all([
      prisma.chapter.findMany({
        where: { novelId },
        orderBy: { order: "asc" },
        select: { id: true, order: true },
      }),
      prisma.auditReport.findMany({
        where: { novelId, chapterId: targetChapter.id },
        orderBy: { createdAt: "desc" },
        take: 4,
        include: {
          issues: {
            where: input.sourceIssueIds?.length
              ? { id: { in: input.sourceIssueIds } }
              : { status: "open" },
          },
        },
      }),
      prisma.stateChangeProposal.count({
        where: {
          novelId,
          status: "pending_review",
        },
      }),
      payoffLedgerSyncService.getPayoffLedger(novelId, {
        chapterOrder: targetChapter.order,
      }).catch(() => ({
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
      })),
    ]);
    const resolvedStateDrivenContext = await contextAssemblyService.build({
      novelId,
      chapterId: targetChapter.id,
      chapterOrder: targetChapter.order,
      includeCurrentChapterState: false,
      policy: {
        kickoffMode: "manual_start",
        advanceMode: "stage_review",
      },
      pendingReviewProposalCount,
      openAuditIssueCount: recentAuditReports.flatMap((report) => report.issues).length,
      hasRepairableDraft: false,
    });
    const mappedAuditReports: AuditReport[] = recentAuditReports.map((report) => ({
      id: report.id,
      novelId: report.novelId,
      chapterId: report.chapterId,
      auditType: report.auditType as AuditReport["auditType"],
      overallScore: report.overallScore ?? null,
      summary: report.summary ?? null,
      legacyScoreJson: report.legacyScoreJson ?? null,
      issues: report.issues.map((issue) => ({
        id: issue.id,
        reportId: issue.reportId,
        auditType: issue.auditType as AuditReport["issues"][number]["auditType"],
        severity: issue.severity as AuditReport["issues"][number]["severity"],
        code: issue.code,
        description: issue.description,
        evidence: issue.evidence,
        fixSuggestion: issue.fixSuggestion,
        status: issue.status as AuditReport["issues"][number]["status"],
        createdAt: issue.createdAt.toISOString(),
        updatedAt: issue.updatedAt.toISOString(),
      })),
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    }));
    const replanDecision = await replanWindowDecisionService.decide({
      requestedWindowSize: input.windowSize ?? 3,
      availableChapterOrders: allChapters.map((item) => item.order),
      targetChapterOrder: targetChapter.order,
      triggerType: input.triggerType ?? "manual",
      reason: input.reason,
      sourceIssueIds: input.sourceIssueIds ?? [],
      auditReports: mappedAuditReports,
      ledgerSummary: payoffLedger.summary,
      snapshot: resolvedStateDrivenContext.snapshot,
      nextAction: resolvedStateDrivenContext.nextAction,
      chapterStateGoal: resolvedStateDrivenContext.chapterStateGoal,
      protectedSecrets: resolvedStateDrivenContext.protectedSecrets,
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
    });
    const affectedChapterOrderSet = new Set(replanDecision.affectedChapterOrders);
    const affectedChapters = allChapters.filter((item) => affectedChapterOrderSet.has(item.order));
    if (affectedChapters.length === 0) {
      throw new Error("当前小说没有可重规划的章节。");
    }

    const generatedPlans: ReplanResult["generatedPlans"] = [];
    const affectedOrders = affectedChapters.map((item) => item.order);

    for (let index = 0; index < affectedChapters.length; index += 1) {
      const chapter = affectedChapters[index];
      const existingPlan = await planner.getChapterPlan(novelId, chapter.id);
      const plan = await planner.generateChapterPlan(novelId, chapter.id, {
        provider: input.provider,
        model: input.model,
        temperature: input.temperature,
        replanContext: {
          reason: input.reason,
          triggerType: input.triggerType ?? "manual",
          triggerReason: replanDecision.triggerReason,
          windowReason: replanDecision.windowReason,
          whyTheseChapters: replanDecision.whyTheseChapters,
          sourceIssueIds: replanDecision.blockingIssueIds.length > 0
            ? replanDecision.blockingIssueIds
            : input.sourceIssueIds ?? [],
          windowIndex: index,
          windowSize: affectedChapters.length,
          affectedChapterOrders: affectedOrders,
          anchorChapterOrder: replanDecision.anchorChapterOrder,
          blockingLedgerKeys: replanDecision.blockingLedgerKeys,
          replannedFromPlanId: existingPlan?.id ?? null,
        },
      });
      generatedPlans.push(plan);
    }

    const primaryPlan = generatedPlans[0];
    if (!primaryPlan) {
      throw new Error("章节规划生成失败。");
    }
    const runPayload = {
      affectedChapterIds: affectedChapters.map((item) => item.id),
      affectedChapterOrders: affectedOrders,
      generatedPlanIds: generatedPlans.map((plan) => plan.id),
      sourceIssueIds: replanDecision.blockingIssueIds.length > 0
        ? replanDecision.blockingIssueIds
        : input.sourceIssueIds ?? [],
      triggerType: input.triggerType ?? "manual",
      reason: input.reason,
      triggerReason: replanDecision.triggerReason,
      windowReason: replanDecision.windowReason,
      whyTheseChapters: replanDecision.whyTheseChapters,
      anchorChapterOrder: replanDecision.anchorChapterOrder,
      windowSize: affectedChapters.length,
      blockingLedgerKeys: replanDecision.blockingLedgerKeys,
      repairIntent: replanDecision.repairIntent,
      confidence: replanDecision.confidence,
    };

    const run = await prisma.replanRun.create({
      data: {
        novelId,
        chapterId: targetChapter.id,
        sourcePlanId: primaryPlan.replannedFromPlanId ?? null,
        triggerType: input.triggerType ?? "manual",
        reason: input.reason,
        outputSummary: JSON.stringify(runPayload),
      },
    });
    return {
      primaryPlan,
      generatedPlans,
      affectedChapterIds: runPayload.affectedChapterIds,
      affectedChapterOrders: runPayload.affectedChapterOrders,
      anchorChapterOrder: runPayload.anchorChapterOrder,
      sourceIssueIds: runPayload.sourceIssueIds,
      triggerType: runPayload.triggerType,
      reason: runPayload.reason,
      triggerReason: runPayload.triggerReason,
      windowReason: runPayload.windowReason,
      whyTheseChapters: runPayload.whyTheseChapters,
      windowSize: runPayload.windowSize,
      blockingLedgerKeys: runPayload.blockingLedgerKeys,
      run: {
        id: run.id,
        outputSummary: run.outputSummary ?? null,
        createdAt: run.createdAt.toISOString(),
      },
    };
  }
}

export const plannerReplanService = new PlannerReplanService();
