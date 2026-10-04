import type { ChapterStateGoal, CanonicalStateSnapshot, GenerationNextAction } from "@ai-novel/shared/types/canonicalState";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { AuditReport } from "@ai-novel/shared/types/novel";
import type { PayoffLedgerSummary } from "@ai-novel/shared/types/payoffLedger";
import {
  sanitizeAiReplanWindowDecision,
  type SanitizedReplanWindowDecision,
} from "@ai-novel/shared/types/replanWindowDecision";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { replanWindowDecisionPrompt } from "../../prompting/prompts/planner/replanWindowDecision.prompts";
import { buildReplanAuditContext } from "./replan/context";

interface ReplanWindowDecisionInput {
  triggerType: string;
  reason: string;
  targetChapterOrder: number;
  requestedWindowSize?: number | null;
  availableChapterOrders: number[];
  sourceIssueIds: string[];
  auditReports: AuditReport[];
  ledgerSummary: PayoffLedgerSummary | null;
  snapshot: CanonicalStateSnapshot | null;
  nextAction: GenerationNextAction | null;
  chapterStateGoal: ChapterStateGoal | null;
  protectedSecrets: string[];
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

function compactJson(value: unknown): string {
  // Never cut JSON in the middle of a field: it discards late facts and produces invalid input.
  return JSON.stringify(value ?? null);
}

export class ReplanWindowDecisionService {
  async decide(input: ReplanWindowDecisionInput): Promise<SanitizedReplanWindowDecision> {
    const requestedWindowSize = Math.max(1, Math.min(input.requestedWindowSize ?? 3, 5));
    const result = await runStructuredPrompt({
      asset: replanWindowDecisionPrompt,
      promptInput: {
        triggerType: input.triggerType,
        reason: input.reason,
        targetChapterOrder: input.targetChapterOrder,
        requestedWindowSize,
        availableChapterOrdersJson: compactJson(input.availableChapterOrders),
        sourceIssueIdsJson: compactJson(input.sourceIssueIds),
        auditReportsJson: compactJson(buildReplanAuditContext(input.auditReports)),
        payoffSummaryJson: compactJson(input.ledgerSummary),
        canonicalStateJson: compactJson(input.snapshot),
        nextAction: input.nextAction ?? "none",
        chapterStateGoalJson: compactJson(input.chapterStateGoal),
        protectedSecretsJson: compactJson(input.protectedSecrets),
      },
      options: {
        provider: input.provider,
        model: input.model,
        temperature: Math.min(input.temperature ?? 0.2, 0.4),
        stage: "planner_replan_window_decision",
        triggerReason: input.triggerType,
      },
    });
    return sanitizeAiReplanWindowDecision({
      decision: result.output,
      availableChapterOrders: input.availableChapterOrders,
      targetChapterOrder: input.targetChapterOrder,
      maxWindowSize: requestedWindowSize,
    });
  }
}

export const replanWindowDecisionService = new ReplanWindowDecisionService();
