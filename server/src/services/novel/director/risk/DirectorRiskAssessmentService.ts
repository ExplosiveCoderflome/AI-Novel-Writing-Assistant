import {
  DIRECTOR_RISK_SCORE_MIN,
  DIRECTOR_RISK_SCORE_MAX,
} from "@ai-novel/shared/types/directorRisk";
import type {
  AiDirectorRiskAssessment,
  DirectorRiskAction,
  DirectorRiskAssessment,
  DirectorRiskCategory,
  DirectorRiskPolicy,
} from "@ai-novel/shared/types/directorRisk";
import type { DirectorQualityRepairRisk } from "@ai-novel/shared/types/novelDirector";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { directorRiskAssessmentPrompt } from "../../../../prompting/prompts/director/directorRiskAssessment.prompts";
import { directorAutomationLedgerEventService } from "../runtime/DirectorAutomationLedgerEventService";
import { AutoDirectorFollowUpNotificationService } from "../../../task/autoDirectorFollowUps/AutoDirectorFollowUpNotificationService";

export interface DirectorRiskAssessmentInput {
  taskId: string;
  novelId: string;
  policy: DirectorRiskPolicy;
  failureStage: string;
  failureType: string;
  failureSummary: string;
  category?: DirectorRiskCategory;
  affectedChapterOrders?: number[];
  failureDetails?: Record<string, unknown>;
  taskContext?: Record<string, unknown>;
  auditReports?: unknown[];
  replanDecision?: Record<string, unknown> | null;
  existingQualityDebt?: unknown[];
  /** Explicit runtime safety/replan conditions always win over configurable thresholds. */
  forcePause?: boolean;
  /** Local quality debt must never stop the book-level director. */
  localOnly?: boolean;
  issueFingerprint: string;
  provider?: string;
  model?: string;
  temperature?: number;
}

export interface DirectorRiskDecision {
  assessment: DirectorRiskAssessment;
  shouldNotify: boolean;
  shouldPause: boolean;
}

/**
 * Applies the two non-negotiable runtime guards after AI has evaluated a
 * problem: explicit global stops use the capped maximum score and a distinct
 * forced-pause action, while chapter-local debt can never stop the full-book
 * director merely because of its score.
 */
export function resolveDirectorRiskDecision(input: {
  assessment: AiDirectorRiskAssessment;
  policy: DirectorRiskPolicy;
  forcePause?: boolean;
  localOnly?: boolean;
}): Pick<DirectorRiskDecision, "shouldNotify" | "shouldPause"> & {
  score: number;
  canPause: boolean;
} {
  const forcePause = Boolean(input.forcePause);
  const localOnly = Boolean(input.localOnly) && !forcePause;
  const score = forcePause
    ? DIRECTOR_RISK_SCORE_MAX
    : Math.max(DIRECTOR_RISK_SCORE_MIN, Math.min(DIRECTOR_RISK_SCORE_MAX, input.assessment.score));
  const canPause = forcePause || (!localOnly && input.assessment.canPause);
  return {
    score,
    canPause,
    shouldNotify: score >= input.policy.noticeThreshold,
    shouldPause: forcePause || (canPause && score >= input.policy.pauseThreshold),
  };
}

function stringify(value: unknown, fallback: string): string {
  try {
    return JSON.stringify(value ?? fallback);
  } catch {
    return JSON.stringify(fallback);
  }
}

function resolveAction(input: {
  forcePause: boolean;
  localOnly: boolean;
  shouldPause: boolean;
  shouldNotify: boolean;
}): DirectorRiskAction {
  if (input.forcePause) return "forced_pause";
  if (input.shouldPause) return "pause_requested";
  if (input.localOnly) return "quality_debt_recorded";
  if (input.shouldNotify) return "notified";
  return "logged";
}

function resolveLedgerSeverity(score: number): "low" | "medium" | "high" {
  if (score >= 8) return "high";
  if (score >= 5) return "medium";
  return "low";
}

/**
 * Converts a workflow-level issue to a scored, persisted decision. The prompt
 * owns semantic assessment; deterministic code only preserves safety floors
 * and the project-wide non-blocking quality-debt rule.
 */
export class DirectorRiskAssessmentService {
  private readonly notificationService = new AutoDirectorFollowUpNotificationService();

  async assess(input: DirectorRiskAssessmentInput): Promise<DirectorRiskDecision | null> {
    const localOnly = Boolean(input.localOnly) && !input.forcePause;
    let aiAssessment: AiDirectorRiskAssessment;
    if (input.forcePause) {
      // Runtime safety and explicitly global stop conditions must not depend
      // on a secondary model call that may itself be unavailable.
      aiAssessment = {
        score: DIRECTOR_RISK_SCORE_MAX,
        category: input.category ?? "runtime_safety",
        impactScope: input.category === "data_integrity" || input.category === "runtime_safety"
          ? "system"
          : "task",
        affectedChapterOrders: input.affectedChapterOrders ?? [],
        evidenceSummary: input.failureSummary,
        recommendation: "pause",
        recommendationReason: "为保护小说内容和执行状态，自动导演将在当前安全节点暂停。",
        canPause: true,
      };
    } else {
      try {
        const result = await runStructuredPrompt({
          asset: directorRiskAssessmentPrompt,
          promptInput: {
            failureStage: input.failureStage,
            failureType: input.failureType,
            failureSummary: input.failureSummary,
            failureDetailsJson: stringify(input.failureDetails, "{}"),
            taskContextJson: stringify(input.taskContext, "{}"),
            auditReportsJson: stringify(input.auditReports, "[]"),
            replanDecisionJson: stringify(input.replanDecision, "null"),
            existingQualityDebtJson: stringify(input.existingQualityDebt, "[]"),
          },
          options: {
            taskId: input.taskId,
            novelId: input.novelId,
            provider: input.provider as never,
            model: input.model,
            temperature: input.temperature ?? 0.2,
            entrypoint: "auto_director",
            stage: "risk_assessment",
            itemKey: input.failureType,
            triggerReason: input.failureStage,
          },
        });
        aiAssessment = result.output;
      } catch {
        // Do not turn a secondary assessment failure into a new production stop.
        return null;
      }
    }

    const decision = resolveDirectorRiskDecision({
      assessment: aiAssessment,
      policy: input.policy,
      forcePause: input.forcePause,
      localOnly,
    });
    const { score, canPause, shouldNotify, shouldPause } = decision;
    const action = resolveAction({
      forcePause: Boolean(input.forcePause),
      localOnly,
      shouldPause,
      shouldNotify,
    });
    const assessment: DirectorRiskAssessment = {
      ...aiAssessment,
      score,
      category: input.forcePause && input.category ? input.category : aiAssessment.category,
      affectedChapterOrders: input.affectedChapterOrders?.length
        ? input.affectedChapterOrders
        : aiAssessment.affectedChapterOrders,
      canPause,
      action,
      assessedAt: new Date().toISOString(),
      issueFingerprint: input.issueFingerprint,
    };
    await directorAutomationLedgerEventService.recordEvent({
      type: "policy_changed",
      idempotencyKey: [input.taskId, input.issueFingerprint, assessment.score, assessment.action].join(":"),
      taskId: input.taskId,
      novelId: input.novelId,
      nodeKey: `risk.${assessment.category}`,
      summary: `自动导演风险 ${assessment.score}/8：${assessment.evidenceSummary}`,
      affectedScope: assessment.affectedChapterOrders.length > 0
        ? `chapters:${assessment.affectedChapterOrders.join(",")}`
        : assessment.impactScope,
      severity: resolveLedgerSeverity(assessment.score),
      metadata: { riskAssessment: assessment },
    }).catch(() => null);
    if (shouldNotify) {
      await this.notificationService.notifyRiskAssessment({
        taskId: input.taskId,
        novelId: input.novelId,
        assessment,
        pauseRequested: shouldPause,
        notificationBand: shouldPause
          ? `pause-${input.policy.pauseThreshold}-8`
          : `notice-${input.policy.noticeThreshold}-${input.policy.pauseThreshold - 1}`,
      }).catch(() => null);
    }
    return { assessment, shouldNotify, shouldPause };
  }

  async assessQualityRepair(input: Omit<DirectorRiskAssessmentInput,
    "failureStage" | "failureType" | "category" | "forcePause" | "localOnly"> & {
      qualityRepairRisk: DirectorQualityRepairRisk;
    }): Promise<DirectorRiskDecision | null> {
    const risk = input.qualityRepairRisk;
    return this.assess({
      ...input,
      failureStage: "quality_repair",
      failureType: risk.noticeCode ?? risk.riskLevel,
      category: risk.riskLevel === "replan" ? "replan" : "chapter_repair",
      forcePause: risk.riskLevel === "replan",
      // A large-scope repair is still chapter-level quality work. It can be
      // surfaced at high risk but cannot pause the whole-book director.
      localOnly: risk.riskLevel !== "replan",
      failureDetails: {
        ...(input.failureDetails ?? {}),
        qualityRepairRisk: risk,
      },
      replanDecision: risk.riskLevel === "replan"
        ? { decision: "replan_required", reason: risk.reason }
        : input.replanDecision,
    });
  }
}

export const directorRiskAssessmentService = new DirectorRiskAssessmentService();
