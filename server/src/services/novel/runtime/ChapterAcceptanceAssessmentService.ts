import type { AuditReport, AuditType, QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../../db/prisma";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { resolvePromptContextBlocksForAsset } from "../../../prompting/context/promptContextResolution";
import { buildChapterReviewContextBlocks } from "../../../prompting/prompts/novel/chapterLayeredContext";
import { resolveTargetWordRange } from "../../../prompting/prompts/novel/chapterLayeredContextShared";
import {
  chapterAcceptanceAssessmentPrompt,
  type ChapterAcceptanceAssessmentOutput,
} from "../../../prompting/prompts/novel/chapterAcceptance.prompts";
import { openConflictService } from "../../state/OpenConflictService";
import { normalizeScore, ruleScore } from "../novelP0Utils";

export interface ChapterAcceptanceAssessmentInput {
  novelId: string;
  chapterId: string;
  novelTitle: string;
  chapterTitle: string;
  chapterOrder: number;
  targetWordCount?: number | null;
  content: string;
  contextPackage: GenerationContextPackage;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export interface ChapterAcceptanceAssessmentResult {
  assessment: ChapterAcceptanceAssessmentOutput;
  score: QualityScore;
  issues: ReviewIssue[];
  auditReports: AuditReport[];
}

type AcceptanceIssue = ChapterAcceptanceAssessmentOutput["blockingIssues"][number];
type AcceptanceRepairDirective = ChapterAcceptanceAssessmentOutput["repairDirectives"][number];

const UNDER_LENGTH_MARKERS = [
  "length_insufficient",
  "length_under",
  "under_soft",
  "too short",
  "insufficient length",
  "word count",
  "正文估算",
  "目标长度",
  "字数",
  "低于",
  "不足",
  "过短",
  "未达",
];

const OVER_LENGTH_MARKERS = [
  "length_over",
  "over_soft",
  "over_hard",
  "too long",
  "exceeds",
  "超出",
  "超过",
  "过长",
  "冗长",
];

function categoryToAuditType(category: AcceptanceIssue["category"]): AuditType {
  if (category === "continuity") return "continuity";
  if (category === "character") return "character";
  if (category === "plot") return "plot";
  return "mode_fit";
}

function categoryToReviewIssueCategory(category: AcceptanceIssue["category"]): ReviewIssue["category"] {
  if (category === "character") return "logic";
  if (category === "plot") return "pacing";
  if (category === "voice") return "voice";
  if (category === "mode_fit") return "coherence";
  return "coherence";
}

function countChapterCharacters(content: string): number {
  return content.replace(/\s+/g, "").trim().length;
}

function includesAnyMarker(text: string, markers: string[]): boolean {
  const normalized = text.toLowerCase();
  return markers.some((marker) => normalized.includes(marker));
}

function isUnderLengthIssue(issue: AcceptanceIssue): boolean {
  const text = [issue.code, issue.evidence, issue.fixSuggestion].join("\n");
  return includesAnyMarker(text, UNDER_LENGTH_MARKERS) && !includesAnyMarker(text, OVER_LENGTH_MARKERS);
}

function isOverLengthIssue(issue: AcceptanceIssue): boolean {
  const text = [issue.code, issue.evidence, issue.fixSuggestion].join("\n");
  return includesAnyMarker(text, OVER_LENGTH_MARKERS);
}

function isLengthDirective(directive: AcceptanceRepairDirective): boolean {
  return includesAnyMarker(directive.instruction, [...UNDER_LENGTH_MARKERS, ...OVER_LENGTH_MARKERS]);
}

function shouldDropLengthIssue(input: {
  issue: AcceptanceIssue;
  actualWordCount: number;
  minWordCount: number | null;
  maxWordCount: number | null;
}): boolean {
  if (input.minWordCount != null && input.actualWordCount >= input.minWordCount && isUnderLengthIssue(input.issue)) {
    return true;
  }
  if (input.maxWordCount != null && input.actualWordCount <= input.maxWordCount && isOverLengthIssue(input.issue)) {
    return true;
  }
  return false;
}

function reconcileLengthAssessment(
  output: ChapterAcceptanceAssessmentOutput,
  content: string,
  targetWordCount?: number | null,
): ChapterAcceptanceAssessmentOutput {
  const range = resolveTargetWordRange(targetWordCount);
  if (range.minWordCount == null && range.maxWordCount == null) {
    return output;
  }
  const actualWordCount = countChapterCharacters(content);
  const blockingIssues = output.blockingIssues.filter((issue) => !shouldDropLengthIssue({
    issue,
    actualWordCount,
    minWordCount: range.minWordCount,
    maxWordCount: range.maxWordCount,
  }));
  if (blockingIssues.length === output.blockingIssues.length) {
    return output;
  }
  return {
    ...output,
    blockingIssues,
    repairDirectives: output.repairDirectives.filter((directive) => !isLengthDirective(directive)),
    riskTags: output.riskTags.filter((tag) => !includesAnyMarker(tag, [...UNDER_LENGTH_MARKERS, ...OVER_LENGTH_MARKERS])),
  };
}

export function normalizeAssessment(
  output: ChapterAcceptanceAssessmentOutput,
  content: string,
  targetWordCount?: number | null,
): ChapterAcceptanceAssessmentOutput {
  const reconciled = reconcileLengthAssessment(output, content, targetWordCount);
  const score = normalizeScore(reconciled.score ?? ruleScore(content));
  const hasHighRisk = reconciled.blockingIssues.some((issue) => issue.severity === "high" || issue.severity === "critical");
  const hasRepairWork = reconciled.blockingIssues.length > 0 || reconciled.repairDirectives.length > 0;
  let status: ChapterAcceptanceAssessmentOutput["status"] = reconciled.status === "accepted" && hasHighRisk
    ? "repairable"
    : reconciled.status;
  if (status === "needs_manual_review" && !hasHighRisk) {
    status = hasRepairWork ? "repairable" : "continue_with_risk";
  }
  if (status === "repairable" && !hasRepairWork) {
    status = "continue_with_risk";
  }
  const continuePolicy = status === "needs_manual_review"
    ? "pause"
    : status === "repairable"
      ? "repair_once"
      : status === "continue_with_risk" && reconciled.continuePolicy === "pause"
        ? "continue"
        : reconciled.continuePolicy;
  return {
    ...reconciled,
    status,
    score,
    continuePolicy,
    riskTags: Array.from(new Set(reconciled.riskTags.map((item) => item.trim()).filter(Boolean))),
    blockingIssues: reconciled.blockingIssues.slice(0, 5),
    repairDirectives: reconciled.repairDirectives.slice(0, 4),
  };
}

function buildFallbackAssessment(content: string): ChapterAcceptanceAssessmentOutput {
  const score = ruleScore(content);
  return {
    status: "continue_with_risk",
    score,
    summary: "正文已生成，接收闸门未完成结构化判断，系统将保留正文并标记后续复查风险。",
    blockingIssues: [{
      severity: "medium",
      category: "mode_fit",
      code: "acceptance_gate_unavailable",
      evidence: "章节接收闸门未返回可用结构化结果。",
      fixSuggestion: "保留正文，后续可重新执行章节审校或局部修文。",
    }],
    repairDirectives: [],
    riskTags: ["acceptance_gate_unavailable"],
    assetSyncRecommendation: {
      priority: "normal",
      reason: "正文已保存，但建议后续补跑章节审校或资产同步。",
      requiresFullPayoffReconcile: false,
    },
    continuePolicy: "continue",
  };
}

export class ChapterAcceptanceAssessmentService {
  async assess(input: ChapterAcceptanceAssessmentInput): Promise<ChapterAcceptanceAssessmentResult> {
    const assessment = await this.invokeAssessment(input).catch(() => buildFallbackAssessment(input.content));
    const normalized = normalizeAssessment(assessment, input.content, input.targetWordCount);
    const score = normalizeScore(normalized.score);
    const issues = normalized.blockingIssues.map((issue) => ({
      severity: issue.severity,
      category: categoryToReviewIssueCategory(issue.category),
      evidence: issue.evidence,
      fixSuggestion: issue.fixSuggestion,
    }));
    const auditReports = await this.persistAcceptanceReports(input, normalized, score);
    await openConflictService.syncFromAuditReports({
      novelId: input.novelId,
      chapterId: input.chapterId,
      chapterOrder: input.chapterOrder,
      sourceSnapshotId: null,
      auditReports,
    }).catch(() => null);
    return {
      assessment: normalized,
      score,
      issues,
      auditReports,
    };
  }

  private async invokeAssessment(input: ChapterAcceptanceAssessmentInput): Promise<ChapterAcceptanceAssessmentOutput> {
    const fallbackBlocks = input.contextPackage.chapterReviewContext
      ? buildChapterReviewContextBlocks(input.contextPackage.chapterReviewContext)
      : [];
    const resolvedContext = await resolvePromptContextBlocksForAsset({
      asset: chapterAcceptanceAssessmentPrompt,
      executionContext: {
        entrypoint: "chapter_pipeline",
        novelId: input.novelId,
        chapterId: input.chapterId,
        metadata: {
          chapterReviewContext: input.contextPackage.chapterReviewContext,
        },
      },
      fallbackBlocks,
    });
    const result = await runStructuredPrompt({
      asset: chapterAcceptanceAssessmentPrompt,
      promptInput: {
        novelTitle: input.novelTitle,
        chapterOrder: input.chapterOrder,
        chapterTitle: input.chapterTitle,
        targetWordCount: input.targetWordCount ?? null,
        content: input.content,
      },
      contextBlocks: resolvedContext.blocks,
      options: {
        provider: input.provider,
        model: input.model,
        temperature: Math.min(input.temperature ?? 0.2, 0.35),
        novelId: input.novelId,
        chapterId: input.chapterId,
        stage: "chapter_acceptance",
        triggerReason: "chapter_acceptance_assessment",
      },
    });
    return result.output;
  }

  private async persistAcceptanceReports(
    input: ChapterAcceptanceAssessmentInput,
    assessment: ChapterAcceptanceAssessmentOutput,
    score: QualityScore,
  ): Promise<AuditReport[]> {
    const grouped = new Map<AuditType, AcceptanceIssue[]>();
    for (const issue of assessment.blockingIssues) {
      const auditType = categoryToAuditType(issue.category);
      grouped.set(auditType, [...(grouped.get(auditType) ?? []), issue]);
    }
    if (grouped.size === 0) {
      grouped.set("mode_fit", []);
    }
    const auditTypes = Array.from(grouped.keys());
    await prisma.$transaction(async (tx) => {
      await tx.auditReport.deleteMany({
        where: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          auditType: { in: auditTypes },
        },
      });
      for (const auditType of auditTypes) {
        const issues = grouped.get(auditType) ?? [];
        await tx.auditReport.create({
          data: {
            novelId: input.novelId,
            chapterId: input.chapterId,
            auditType,
            overallScore: score.overall,
            summary: assessment.summary,
            legacyScoreJson: JSON.stringify({
              ...score,
              acceptanceStatus: assessment.status,
              continuePolicy: assessment.continuePolicy,
              riskTags: assessment.riskTags,
              assetSyncRecommendation: assessment.assetSyncRecommendation,
              repairDirectives: assessment.repairDirectives,
            }),
            issues: {
              create: issues.map((issue, index) => ({
                auditType,
                severity: issue.severity,
                code: issue.code || `acceptance_${index + 1}`,
                description: issue.evidence,
                evidence: issue.evidence,
                fixSuggestion: issue.fixSuggestion,
              })),
            },
          },
        });
      }
    });
    return prisma.auditReport.findMany({
      where: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        auditType: { in: auditTypes },
      },
      include: {
        issues: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }) as unknown as Promise<AuditReport[]>;
  }
}
