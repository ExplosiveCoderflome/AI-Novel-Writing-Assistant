import {
  BOOK_ANALYSIS_STRUCTURED_FIELD_SPECS,
  BOOK_ANALYSIS_STRUCTURED_FIELD_LABELS,
  type BookAnalysisEvidenceItem,
  type BookAnalysisSection,
  type BookAnalysisTimelineNode,
} from "@ai-novel/shared/types/bookAnalysis";
import {
  groupBookAnalysisTimelineNodesByPhase,
  normalizeBookAnalysisTimelineNodes,
} from "@ai-novel/shared/utils/bookAnalysisTimeline";
import { Info } from "lucide-react";
import type { BookAnalysisMode } from "../hooks/bookAnalysisWorkspace.types";

interface SummaryRow {
  key: string;
  label: string;
  values: string[];
  timelineNodes: BookAnalysisTimelineNode[];
  evidence: BookAnalysisEvidenceItem[];
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
      .slice(0, 6);
  }
  return [];
}

function buildSummaryRows(section: BookAnalysisSection): SummaryRow[] {
  const structuredData = section.structuredData;
  if (!structuredData || typeof structuredData !== "object") {
    return [];
  }
  const fieldSpecs = new Map((BOOK_ANALYSIS_STRUCTURED_FIELD_SPECS[section.sectionKey] ?? [])
    .map((field) => [field.key, field.type]));

  return Object.entries(structuredData)
    .map(([key, value]) => {
      const isTimelineNodeArray = fieldSpecs.get(key) === "timelineNodeArray";
      return {
        key,
        label: BOOK_ANALYSIS_STRUCTURED_FIELD_LABELS[key] ?? key,
        values: isTimelineNodeArray ? [] : normalizeStructuredValue(value),
        timelineNodes: isTimelineNodeArray ? normalizeBookAnalysisTimelineNodes(value, 6) : [],
        evidence: section.evidence.filter((item) => item.fieldKey === key),
      };
    })
    .filter((row) => row.values.length > 0 || row.timelineNodes.length > 0)
    .slice(0, 8);
}

function formatEvidenceTooltip(evidence: BookAnalysisEvidenceItem[]): string {
  return evidence
    .slice(0, 4)
    .map((item) => {
      const indexLabel = item.fieldIndex === undefined ? "" : ` #${item.fieldIndex + 1}`;
      return `[${item.sourceLabel}] ${item.label}${indexLabel}\n${item.excerpt}`;
    })
    .join("\n\n");
}

function getWarningLabels(section: BookAnalysisSection): string[] {
  return Array.from(new Set((section.normalizationWarnings ?? [])
    .map((fieldKey) => BOOK_ANALYSIS_STRUCTURED_FIELD_LABELS[fieldKey] ?? fieldKey)
    .filter(Boolean)));
}

function TimelineNodeList({ nodes }: { nodes: BookAnalysisTimelineNode[] }) {
  const groups = groupBookAnalysisTimelineNodesByPhase(nodes);
  return (
    <div className="mt-2 space-y-2">
      {groups.map((group) => (
        <div key={group.phase} className="space-y-1.5">
          <div className="text-[11px] font-medium text-muted-foreground">{group.phase}</div>
          {group.nodes.map((node, index) => (
            <div key={`${group.phase}-${node.label}-${index}`} className="rounded-md border bg-muted/20 px-2 py-1.5 text-xs">
              <div className="leading-5 text-foreground">{node.label}</div>
              {node.timeHint || node.sourceRefs?.length ? (
                <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                  {node.timeHint ? <span>时间：{node.timeHint}</span> : null}
                  {node.sourceRefs?.length ? <span>来源：{node.sourceRefs.join("、")}</span> : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function BookAnalysisStructuredSummary({
  section,
  analysisMode = "reference",
}: {
  section: BookAnalysisSection;
  analysisMode?: BookAnalysisMode;
}) {
  const rows = buildSummaryRows(section);
  const warningLabels = getWarningLabels(section);
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{analysisMode === "diagnosis" ? "诊断结论" : "关键结论"}</div>
        <div className="text-xs text-muted-foreground">
          {analysisMode === "diagnosis" ? "来自结构化稿件诊断" : "来自结构化拆书结果"}
        </div>
      </div>
      {warningLabels.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          以下字段内容较多，已按上限保留：{warningLabels.join("、")}
        </div>
      ) : null}
      <div className="grid gap-2 md:grid-cols-2">
        {rows.map((row) => (
          <div key={row.key} className="rounded-md border bg-background p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span>{row.label}</span>
              {row.evidence.length > 0 ? (
                <span
                  aria-label={`${row.label}的来源摘录`}
                  title={formatEvidenceTooltip(row.evidence)}
                >
                  <Info className="h-3.5 w-3.5 text-primary" />
                </span>
              ) : null}
            </div>
            {row.timelineNodes.length > 0 ? (
              <TimelineNodeList nodes={row.timelineNodes} />
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {row.values.map((value, index) => (
                  <span
                    key={`${row.key}-${index}-${value}`}
                    className="rounded-md border bg-muted/30 px-2 py-1 text-xs leading-5 text-foreground"
                  >
                    {value}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
