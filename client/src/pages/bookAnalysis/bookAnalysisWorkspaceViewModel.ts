import type {
  BookAnalysisDetail,
  BookAnalysisSection,
  BookAnalysisStatus,
} from "@ai-novel/shared/types/bookAnalysis";
import { isBookAnalysisBudgetExceeded } from "./bookAnalysis.utils.ts";

export type BookAnalysisWorkspaceTone = "neutral" | "info" | "success" | "warning" | "danger";

export type BookAnalysisPrimaryAction =
  | "create"
  | "select"
  | "view_results"
  | "resume_budget"
  | "rebuild"
  | "copy";

export interface BookAnalysisSectionSummary {
  total: number;
  expected: number;
  frozen: number;
  unselected: number;
  frozenReadable: number;
  readable: number;
  readableExpected: number;
  missingExpected: number;
  failedExpected: number;
  succeeded: number;
  running: number;
  failed: number;
}

export interface BookAnalysisNextAction {
  tone: BookAnalysisWorkspaceTone;
  title: string;
  description: string;
  action: BookAnalysisPrimaryAction | null;
  actionLabel?: string;
}

function hasStructuredContent(value: Record<string, unknown> | null | undefined): boolean {
  return Boolean(value && Object.keys(value).length > 0);
}

export function isReadableBookAnalysisSection(section: BookAnalysisSection): boolean {
  return Boolean(
    section.editedContent?.trim()
      || section.aiContent?.trim()
      || hasStructuredContent(section.structuredData),
  );
}

export function isUnselectedBookAnalysisSection(section: BookAnalysisSection): boolean {
  return section.frozen && !isReadableBookAnalysisSection(section);
}

export function summarizeBookAnalysisSections(
  analysis: Pick<BookAnalysisDetail, "sections"> | null | undefined,
): BookAnalysisSectionSummary {
  const summary: BookAnalysisSectionSummary = {
    total: 0,
    expected: 0,
    frozen: 0,
    unselected: 0,
    frozenReadable: 0,
    readable: 0,
    readableExpected: 0,
    missingExpected: 0,
    failedExpected: 0,
    succeeded: 0,
    running: 0,
    failed: 0,
  };
  for (const section of analysis?.sections ?? []) {
    summary.total += 1;
    if (section.frozen) {
      summary.frozen += 1;
    } else {
      summary.expected += 1;
    }
    const readable = isReadableBookAnalysisSection(section);
    if (section.frozen) {
      if (readable) {
        summary.frozenReadable += 1;
      } else {
        summary.unselected += 1;
      }
    }
    if (readable) {
      summary.readable += 1;
    }
    if (!section.frozen && readable) {
      summary.readableExpected += 1;
    }
    if (!section.frozen && !readable) {
      summary.missingExpected += 1;
    }
    if (section.status === "succeeded") {
      summary.succeeded += 1;
    } else if (section.status === "running") {
      summary.running += 1;
    } else if (section.status === "failed") {
      summary.failed += 1;
      if (!section.frozen) {
        summary.failedExpected += 1;
      }
    }
  }
  return summary;
}

export function getPreferredBookAnalysisSection(
  sections: BookAnalysisSection[],
): BookAnalysisSection | null {
  return sections.find(isReadableBookAnalysisSection)
    ?? sections.find((section) => section.status === "succeeded")
    ?? sections[0]
    ?? null;
}

function describeMissingExpectedSections(sections: BookAnalysisSectionSummary): string {
  return sections.missingExpected > 0
    ? `仍有 ${sections.missingExpected} 个计划小节缺少可读结果。`
    : "There are no missing sections within the scope of the plan.";
}

export function resolveBookAnalysisNextAction(input: {
  analysis?: BookAnalysisDetail | null;
  analysesCount: number;
  status?: BookAnalysisStatus | null;
}): BookAnalysisNextAction {
  const analysis = input.analysis ?? null;
  if (!analysis) {
    if (input.analysesCount > 0) {
      return {
        tone: "info",
        title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
        description: "After selecting a record from the analysis list, the source, generation stage, and human-readable results are displayed here.",
        action: "select",
      };
    }
    return {
      tone: "info",
      title: "Create your first book-opening analysis",
      description: "Select a knowledge document and scope of analysis, and AI will organize the results into readable, quoteable sections.",
      action: "create",
      actionLabel: "Create a new book",
    };
  }

  const status = input.status ?? analysis.status;
  const sections = summarizeBookAnalysisSections(analysis);
  if (status === "queued" || status === "running") {
    const hasReadableResults = sections.readable > 0;
    return {
      tone: "info",
      title: status === "queued" ? "Book splitting analysis is queuing up" : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      description: hasReadableResults
        ? `当前进度 ${Math.round(analysis.progress * 100)}%，已有 ${sections.readable} 个小节可阅读；其余计划小节继续生成。`
        : `当前进度 ${Math.round(analysis.progress * 100)}%。已完成的小节会直接保留，全部完成后可在“拆书内容”中阅读。`,
      action: hasReadableResults ? "view_results" : null,
      actionLabel: hasReadableResults ? "View existing results" : undefined,
    };
  }

  if ((status === "failed" || status === "cancelled") && isBookAnalysisBudgetExceeded(analysis.lastError)) {
    return {
      tone: "warning",
      title: "Continue generation after expansion budget",
      description: `已有 ${sections.readable} 个可阅读小节会保留。${describeMissingExpectedSections(sections)}扩容续跑只处理尚未成功的部分。`,
      action: "resume_budget",
      actionLabel: "Expand budget and continue running",
    };
  }

  if (status === "succeeded") {
    if (sections.readable === 0) {
      return {
        tone: "danger",
        title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
        description: "The source document will not be affected. Please regenerate the analysis, or open the task center to view the detailed records of this task.",
        action: "rebuild",
        actionLabel: "Regenerate analysis",
      };
    }
    if (sections.missingExpected > 0) {
      return {
        tone: "warning",
        title: "Check the results of existing book openings first",
        description: `已有 ${sections.readableExpected}/${sections.expected} 个计划生成的小节可阅读，仍有 ${sections.missingExpected} 个小节可通过重新生成补齐。`,
        action: "view_results",
        actionLabel: "View existing results",
      };
    }
    if (sections.failedExpected > 0) {
      return {
        tone: "warning",
        title: "The results are readable, but some sections require review.",
        description: `All planned sections ${sections.readableExpected}/${sections.expected} have readable content, of which ${sections.failedExpected} sections failed to be generated most recently. First, check the retained content, then decide whether to regenerate.`,
        action: "view_results",
        actionLabel: "View existing results",
      };
    }
    return {
      tone: "success",
      title: "The result of opening the book can be read",
      description: `共 ${sections.readable} 个小节已生成，可继续查看证据、整理角色，或发布到小说知识库。`,
      action: "view_results",
      actionLabel: "Check the results of opening the book",
    };
  }

  if (status === "failed" || status === "cancelled") {
    if (sections.readable > 0) {
      return {
        tone: "warning",
        title: "Analysis has been stopped, existing results can still be read",
        description: `已保留 ${sections.readable} 个可阅读小节。${describeMissingExpectedSections(sections)}先检查已有结果，再决定是否重新生成。`,
        action: "view_results",
        actionLabel: "View existing results",
      };
    }
    return {
      tone: "danger",
      title: "Open book analysis needs to be regenerated",
      description: analysis.lastError?.trim() || "This analysis produced no readable results and the source documents will not be affected.",
      action: "rebuild",
      actionLabel: "Regenerate analysis",
    };
  }

  if (status === "archived") {
    return {
      tone: "neutral",
      title: sections.readable > 0 ? "View archived results" : "Continue after copying archive analysis",
      description: sections.readable > 0
        ? "Archived analyzes remain read-only and existing results, evidence, and role profiles can still be viewed."
        : "This archived analysis has no readable results and can be copied as a new analysis and regenerated.",
      action: sections.readable > 0 ? "view_results" : "copy",
      actionLabel: sections.readable > 0 ? "View archived results" : "Copy as new analysis",
    };
  }

  return {
    tone: "info",
    title: "Start generating book-opening results",
    description: "The AI ​​will generate structure, characters, world, and writing conclusions item by item according to the selected scope, and retain each completed section.",
    action: "rebuild",
    actionLabel: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  };
}
