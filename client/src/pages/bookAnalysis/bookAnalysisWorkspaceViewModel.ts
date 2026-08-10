import i18next from "i18next";
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
    : "计划范围内没有缺失小节。";
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
        title: i18next.t("bookAnalysis.bookAnalysisWorkspaceViewModel.fz09wn"),
        description: i18next.t("bookAnalysis.bookAnalysisWorkspaceViewModel.19wqof"),
        action: "select",
      };
    }
    return {
      tone: "info",
      title: i18next.t("bookAnalysis.bookAnalysisWorkspaceViewModel.1rlsfo"),
      description: i18next.t("bookAnalysis.bookAnalysisWorkspaceViewModel.9muso5"),
      action: "create",
      actionLabel: i18next.t("dict.gen_989a71a3"),
    };
  }

  const status = input.status ?? analysis.status;
  const sections = summarizeBookAnalysisSections(analysis);
  if (status === "queued" || status === "running") {
    const hasReadableResults = sections.readable > 0;
    return {
      tone: "info",
      title: status === "queued" ? "拆书分析正在排队" : "拆书分析正在生成",
      description: hasReadableResults
        ? `当前进度 ${Math.round(analysis.progress * 100)}%，已有 ${sections.readable} 个小节可阅读；其余计划小节继续生成。`
        : `当前进度 ${Math.round(analysis.progress * 100)}%。已完成的小节会直接保留，全部完成后可在“拆书内容”中阅读。`,
      action: hasReadableResults ? "view_results" : null,
      actionLabel: hasReadableResults ? "查看已有结果" : undefined,
    };
  }

  if ((status === "failed" || status === "cancelled") && isBookAnalysisBudgetExceeded(analysis.lastError)) {
    return {
      tone: "warning",
      title: i18next.t("bookAnalysis.bookAnalysisWorkspaceViewModel.a9vqvy"),
      description: `已有 ${sections.readable} 个可阅读小节会保留。${describeMissingExpectedSections(sections)}扩容续跑只处理尚未成功的部分。`,
      action: "resume_budget",
      actionLabel: i18next.t("dict.gen_a69ce727"),
    };
  }

  if (status === "succeeded") {
    if (sections.readable === 0) {
      return {
        tone: "danger",
        title: i18next.t("bookAnalysis.bookAnalysisWorkspaceViewModel.oya78w"),
        description: i18next.t("bookAnalysis.bookAnalysisWorkspaceViewModel.b37c2b"),
        action: "rebuild",
        actionLabel: i18next.t("bookAnalysis.bookAnalysisWorkspaceViewModel.roxt0i"),
      };
    }
    if (sections.missingExpected > 0) {
      return {
        tone: "warning",
        title: i18next.t("bookAnalysis.bookAnalysisWorkspaceViewModel.nl1aem"),
        description: `已有 ${sections.readableExpected}/${sections.expected} 个计划生成的小节可阅读，仍有 ${sections.missingExpected} 个小节可通过重新生成补齐。`,
        action: "view_results",
        actionLabel: i18next.t("bookAnalysis.bookAnalysisWorkspaceViewModel.11bypy"),
      };
    }
    if (sections.failedExpected > 0) {
      return {
        tone: "warning",
        title: i18next.t("bookAnalysis.bookAnalysisWorkspaceViewModel.5guiur"),
        description: `${sections.readableExpected}/${sections.expected} 个计划小节均有可读内容，其中 ${sections.failedExpected} 个小节最近一次生成失败。先检查保留内容，再决定是否重新生成。`,
        action: "view_results",
        actionLabel: i18next.t("bookAnalysis.bookAnalysisWorkspaceViewModel.11bypy"),
      };
    }
    return {
      tone: "success",
      title: i18next.t("bookAnalysis.bookAnalysisWorkspaceViewModel.344rn9"),
      description: `共 ${sections.readable} 个小节已生成，可继续查看证据、整理角色，或发布到小说知识库。`,
      action: "view_results",
      actionLabel: i18next.t("bookAnalysis.bookAnalysisWorkspaceViewModel.1jn9sf"),
    };
  }

  if (status === "failed" || status === "cancelled") {
    if (sections.readable > 0) {
      return {
        tone: "warning",
        title: i18next.t("bookAnalysis.bookAnalysisWorkspaceViewModel.66fjli"),
        description: `已保留 ${sections.readable} 个可阅读小节。${describeMissingExpectedSections(sections)}先检查已有结果，再决定是否重新生成。`,
        action: "view_results",
        actionLabel: i18next.t("bookAnalysis.bookAnalysisWorkspaceViewModel.11bypy"),
      };
    }
    return {
      tone: "danger",
      title: i18next.t("bookAnalysis.bookAnalysisWorkspaceViewModel.uxf7wf"),
      description: analysis.lastError?.trim() || "本次分析没有生成可阅读结果，源文档不会受影响。",
      action: "rebuild",
      actionLabel: i18next.t("bookAnalysis.bookAnalysisWorkspaceViewModel.roxt0i"),
    };
  }

  if (status === "archived") {
    return {
      tone: "neutral",
      title: sections.readable > 0 ? "查看归档结果" : "复制归档分析后继续",
      description: sections.readable > 0
        ? "归档分析保持只读，已有结果、证据和角色档案仍可查看。"
        : "这份归档分析没有可阅读结果，可复制为新分析后重新生成。",
      action: sections.readable > 0 ? "view_results" : "copy",
      actionLabel: sections.readable > 0 ? "查看归档结果" : "复制为新分析",
    };
  }

  return {
    tone: "info",
    title: i18next.t("bookAnalysis.bookAnalysisWorkspaceViewModel.wve6z"),
    description: i18next.t("bookAnalysis.bookAnalysisWorkspaceViewModel.tt94xa"),
    action: "rebuild",
    actionLabel: i18next.t("dict.gen_dac38a8b"),
  };
}
