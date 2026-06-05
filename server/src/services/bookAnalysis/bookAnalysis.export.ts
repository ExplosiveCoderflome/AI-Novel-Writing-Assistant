import {
  BOOK_ANALYSIS_STRUCTURED_FIELD_LABELS,
  type BookAnalysisDetail,
  type BookAnalysisSection,
} from "@ai-novel/shared/types/bookAnalysis";
import { getEffectiveContent } from "./bookAnalysis.utils";

function sectionContentToMarkdown(section: BookAnalysisSection): string {
  const content = getEffectiveContent(section);
  if (!content) {
    return "_暂无内容_";
  }
  return content;
}

function normalizeStructuredValue(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .slice(0, 8);
  }
  return [];
}

function buildStructuredSummaryMarkdown(section: BookAnalysisSection): string[] {
  const structuredData = section.structuredData;
  if (!structuredData || typeof structuredData !== "object") {
    return [];
  }

  const rows = Object.entries(structuredData)
    .map(([key, value]) => ({
      label: BOOK_ANALYSIS_STRUCTURED_FIELD_LABELS[key] ?? key,
      values: normalizeStructuredValue(value),
    }))
    .filter((row) => row.values.length > 0)
    .slice(0, 12);

  if (rows.length === 0) {
    return [];
  }

  return [
    "### 关键结论",
    "",
    ...rows.map((row) => `- ${row.label}：${row.values.join("；")}`),
    "",
  ];
}

export function buildPublishDocumentTitle(detail: Pick<BookAnalysisDetail, "id" | "documentTitle">): string {
  return `${detail.documentTitle}｜拆书发布(${detail.id})`;
}

export function buildPublishFileName(
  detail: Pick<BookAnalysisDetail, "id" | "documentTitle" | "documentVersionNumber">,
): string {
  const slug = `${detail.documentTitle}-v${detail.documentVersionNumber}`.replace(/[\\/:*?"<>|]/g, "-");
  return `${slug}-book-analysis-${detail.id}.md`;
}

export function buildPublishMarkdown(
  detail: Pick<
    BookAnalysisDetail,
    | "id"
    | "title"
    | "status"
    | "documentTitle"
    | "documentFileName"
    | "documentVersionNumber"
    | "currentDocumentVersionNumber"
    | "sections"
  >,
  publishedAtISO: string,
): { content: string; hasPublishableContent: boolean } {
  const markdownParts: string[] = [
    `# ${detail.title}（发布版）`,
    "",
    "## 发布元信息",
    "",
    `- 来源拆书ID：${detail.id}`,
    `- 来源文档：${detail.documentTitle}`,
    `- 来源文件名：${detail.documentFileName}`,
    `- 来源版本：v${detail.documentVersionNumber}`,
    `- 当前激活版本：v${detail.currentDocumentVersionNumber}`,
    `- 拆书状态：${detail.status}`,
    `- 发布时间：${publishedAtISO}`,
    "",
  ];

  let hasPublishableContent = false;

  for (const section of detail.sections) {
    const content = getEffectiveContent(section).trim();
    const notes = section.notes?.trim() ?? "";
    const evidence = section.evidence.filter((item) => item.label.trim() || item.excerpt.trim());
    const structuredSummary = buildStructuredSummaryMarkdown(section);
    if (!content && !notes && evidence.length === 0 && structuredSummary.length === 0) {
      continue;
    }
    hasPublishableContent = true;
    markdownParts.push(`## ${section.title}`);
    markdownParts.push("");
    markdownParts.push(...structuredSummary);
    markdownParts.push(content || "_暂无内容_");
    markdownParts.push("");

    if (notes) {
      markdownParts.push("### 人工备注");
      markdownParts.push("");
      markdownParts.push(notes);
      markdownParts.push("");
    }

    if (evidence.length > 0) {
      markdownParts.push("### 证据摘录");
      markdownParts.push("");
      for (const item of evidence) {
        markdownParts.push(`- [${item.sourceLabel}] ${item.label}：${item.excerpt}`);
      }
      markdownParts.push("");
    }
  }

  return {
    content: markdownParts.join("\n"),
    hasPublishableContent,
  };
}

export function buildAnalysisExportContent(
  detail: BookAnalysisDetail,
  format: "markdown" | "json",
): { fileName: string; contentType: string; content: string } {
  const slugBase = `${detail.documentTitle}-v${detail.documentVersionNumber}`.replace(/[\\/:*?"<>|]/g, "-");
  if (format === "json") {
    return {
      fileName: `${slugBase}-book-analysis.json`,
      contentType: "application/json; charset=utf-8",
      content: JSON.stringify(detail, null, 2),
    };
  }

  const markdownParts: string[] = [
    `# ${detail.title}`,
    "",
    `- 文档：${detail.documentTitle}`,
    `- 原文件：${detail.documentFileName}`,
    `- 来源版本：v${detail.documentVersionNumber}`,
    `- 当前激活版本：v${detail.currentDocumentVersionNumber}`,
    `- 状态：${detail.status}`,
    detail.summary ? `- 摘要：${detail.summary}` : "",
    "",
  ];

  for (const section of detail.sections) {
    markdownParts.push(`## ${section.title}`);
    markdownParts.push("");
    markdownParts.push(...buildStructuredSummaryMarkdown(section));
    markdownParts.push(sectionContentToMarkdown(section));
    if (section.notes?.trim()) {
      markdownParts.push("");
      markdownParts.push("### 人工备注");
      markdownParts.push("");
      markdownParts.push(section.notes.trim());
    }
    if (section.evidence.length > 0) {
      markdownParts.push("");
      markdownParts.push("### 证据摘录");
      markdownParts.push("");
      for (const evidence of section.evidence) {
        markdownParts.push(`- [${evidence.sourceLabel}] ${evidence.label}：${evidence.excerpt}`);
      }
    }
    markdownParts.push("");
  }

  return {
    fileName: `${slugBase}-book-analysis.md`,
    contentType: "text/markdown; charset=utf-8",
    content: markdownParts.join("\n"),
  };
}
