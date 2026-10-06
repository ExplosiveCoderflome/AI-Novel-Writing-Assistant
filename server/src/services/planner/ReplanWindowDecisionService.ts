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
import { buildReplanAuditContext, buildReplanStateContext } from "./replan/context";
import { createContextBlock } from "../../prompting/core/contextBudget";

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
    const state = buildReplanStateContext(input.snapshot);
    const contextBlocks = [
      { id: "canonical_baseline", label: "书级状态基线", content: state.stableJson, reuseScope: "book" as const },
      { id: "canonical_state", label: "canonical state（动态状态）", content: state.dynamicJson },
      { id: "audit", label: "审校报告", content: compactJson(buildReplanAuditContext(input.auditReports)) },
      { id: "payoff_ledger", label: "伏笔账本摘要", content: compactJson(input.ledgerSummary) },
      { id: "chapter_goal", label: "章节目标", content: compactJson(input.chapterStateGoal) },
      { id: "protected_secrets", label: "受保护秘密", content: compactJson(input.protectedSecrets) },
    ].map((block, index) => createContextBlock({
      id: block.id, group: block.id, priority: 100 - index,
      required: true, allowSummary: false, reuseScope: block.reuseScope,
      content: `【${block.label}】\n${block.content}`,
    }));
    const result = await runStructuredPrompt({
      asset: replanWindowDecisionPrompt,
      contextBlocks,
      promptInput: {
        triggerType: input.triggerType,
        reason: input.reason,
        targetChapterOrder: input.targetChapterOrder,
        requestedWindowSize,
        availableChapterOrdersJson: compactJson(input.availableChapterOrders),
        sourceIssueIdsJson: compactJson(input.sourceIssueIds),
        auditReportsJson: "null",
        payoffSummaryJson: "null",
        canonicalStateJson: "null",
        nextAction: input.nextAction ?? "none",
        chapterStateGoalJson: "null",
        protectedSecretsJson: "null",
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
