import {
  DIRECTOR_ISSUE_CATALOG_BY_CODE,
  DIRECTOR_ISSUE_GOVERNANCE_VERSION,
  directorIssueOccurrenceSchema,
  resolveDirectorIssueDecision,
  type DirectorIssueAction,
  type DirectorIssueCode,
  type DirectorIssueDecision,
  type DirectorIssueOccurrence,
  type DirectorIssuePolicy,
} from "@ai-novel/shared/types/directorIssue";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { directorRiskAssessmentPrompt } from "../../../../prompting/prompts/director/directorRiskAssessment.prompts";
import { directorAutomationLedgerEventService } from "../runtime/DirectorAutomationLedgerEventService";

const FORCED_SCORE_CODES = new Set<DirectorIssueCode>([
  "quality.replan_required",
  "runtime.token_budget_exceeded",
  "runtime.protected_content",
  "runtime.data_integrity",
  "runtime.persistence_failed",
]);

export interface ReportDirectorIssueInput {
  issueGovernanceVersion?: number | null;
  taskId: string;
  runId?: string | null;
  novelId: string;
  issueCode: DirectorIssueCode;
  stage: string;
  summary: string;
  evidence?: string;
  affectedScope?: string;
  chapterId?: string;
  chapterOrder?: number;
  qualityScores?: Record<string, number>;
  attempt?: number;
  maxAttempts?: number;
  hasUsableOutput?: boolean;
  runMode?: string;
  fingerprint: string;
  details?: Record<string, unknown>;
  policy: DirectorIssuePolicy;
  policySource?: DirectorIssueDecision["policySource"];
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  applyAction?: (result: ReportDirectorIssueResult) => Promise<void>;
}

export interface ReportDirectorIssueResult {
  occurrence: DirectorIssueOccurrence;
  decision: DirectorIssueDecision;
}

export class DirectorIssueActionInterrupt extends Error {
  constructor(
    readonly result: ReportDirectorIssueResult,
  ) {
    super(result.occurrence.summary);
    this.name = "DirectorIssueActionInterrupt";
  }
}

export function isDirectorIssueActionInterrupt(error: unknown): error is DirectorIssueActionInterrupt {
  return error instanceof DirectorIssueActionInterrupt;
}

function severityFor(action: DirectorIssueAction): "low" | "medium" | "high" {
  if (action === "fail_task" || action === "pause_for_manual") return "high";
  if (action === "continue_with_warning") return "medium";
  return "low";
}

export class DirectorIssueService {
  async reportIssue(input: ReportDirectorIssueInput): Promise<ReportDirectorIssueResult | null> {
    if (input.issueGovernanceVersion !== DIRECTOR_ISSUE_GOVERNANCE_VERSION) {
      return null;
    }

    const forcedScore = FORCED_SCORE_CODES.has(input.issueCode) ? 8 : null;
    const assessment = forcedScore === null
      ? await runStructuredPrompt({
          asset: directorRiskAssessmentPrompt,
          promptInput: {
            suggestedIssueCode: input.issueCode,
            stage: input.stage,
            runMode: input.runMode ?? "unknown",
            summary: input.summary,
            evidence: input.evidence ?? "",
            affectedScope: input.affectedScope ?? "",
            hasUsableOutput: input.hasUsableOutput ?? false,
            attempt: input.attempt ?? 0,
            maxAttempts: input.maxAttempts ?? 0,
            detailsJson: JSON.stringify(input.details ?? {}),
          },
          options: {
            taskId: input.taskId,
            novelId: input.novelId,
            chapterId: input.chapterId,
            provider: input.provider,
            model: input.model,
            temperature: input.temperature ?? 0.2,
            entrypoint: "auto_director",
            stage: "issue_assessment",
            itemKey: input.issueCode,
            triggerReason: input.stage,
          },
        }).then((result) => result.output).catch(() => null)
      : null;

    const assessedCode = input.issueCode === "runtime.unclassified"
      ? assessment?.issueCode ?? input.issueCode
      : input.issueCode;
    const occurrence = directorIssueOccurrenceSchema.parse({
      schemaVersion: 1,
      issueCode: assessedCode,
      stage: input.stage,
      summary: assessment?.summary ?? input.summary,
      evidence: assessment?.evidence ?? input.evidence,
      affectedScope: input.affectedScope,
      chapterId: input.chapterId,
      chapterOrder: input.chapterOrder,
      riskScore: forcedScore ?? assessment?.riskScore ?? null,
      qualityScores: input.qualityScores,
      attempt: input.attempt ?? 0,
      maxAttempts: input.maxAttempts ?? 0,
      hasUsableOutput: input.hasUsableOutput ?? false,
      runMode: input.runMode,
      fingerprint: input.fingerprint,
      occurredAt: new Date().toISOString(),
    });
    const decision = resolveDirectorIssueDecision({
      occurrence,
      policy: input.policy,
      policySource: input.policySource,
    });
    const catalog = DIRECTOR_ISSUE_CATALOG_BY_CODE[occurrence.issueCode];

    await directorAutomationLedgerEventService.recordEvent({
      type: "issue_detected",
      idempotencyKey: `${input.taskId}:${input.fingerprint}`,
      taskId: input.taskId,
      runId: input.runId,
      novelId: input.novelId,
      nodeKey: input.stage,
      summary: `${catalog.label}：${occurrence.summary}`,
      affectedScope: occurrence.affectedScope ?? null,
      severity: occurrence.riskScore === 8 ? "high" : occurrence.riskScore && occurrence.riskScore >= input.policy.noticeThreshold ? "medium" : "low",
      metadata: { schemaVersion: 1, occurrence },
      occurredAt: occurrence.occurredAt,
    });

    const result = { occurrence, decision };
    await directorAutomationLedgerEventService.recordEvent({
      type: "issue_decided",
      idempotencyKey: `${input.taskId}:${input.fingerprint}:${decision.action}:decided`,
      taskId: input.taskId,
      runId: input.runId,
      novelId: input.novelId,
      nodeKey: input.stage,
      summary: `${catalog.label}处理决定：${decision.action}`,
      affectedScope: occurrence.affectedScope ?? null,
      severity: severityFor(decision.action),
      metadata: { schemaVersion: 1, occurrence, decision },
    });

    if (!input.applyAction) return result;
    await input.applyAction(result);
    await this.recordActionApplied({
      taskId: input.taskId,
      runId: input.runId,
      novelId: input.novelId,
      stage: input.stage,
      result,
    });

    return result;
  }

  async recordActionApplied(input: {
    taskId: string;
    runId?: string | null;
    novelId: string;
    stage: string;
    result: ReportDirectorIssueResult;
  }): Promise<void> {
    const { occurrence, decision } = input.result;
    const catalog = DIRECTOR_ISSUE_CATALOG_BY_CODE[occurrence.issueCode];
    await directorAutomationLedgerEventService.recordEvent({
      type: "issue_action_applied",
      idempotencyKey: `${input.taskId}:${occurrence.fingerprint}:${decision.action}:applied`,
      taskId: input.taskId,
      runId: input.runId,
      novelId: input.novelId,
      nodeKey: input.stage,
      summary: `${catalog.label}已执行：${decision.action}`,
      affectedScope: occurrence.affectedScope ?? null,
      severity: severityFor(decision.action),
      metadata: { schemaVersion: 1, occurrence, decision },
    });
  }
}

export const directorIssueService = new DirectorIssueService();
