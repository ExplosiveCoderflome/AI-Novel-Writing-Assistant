import {
  BOOK_ANALYSIS_STRUCTURED_FIELD_LABELS,
  type BookAnalysisSection,
} from "@ai-novel/shared/types/bookAnalysis";

interface SummaryRow {
  key: string;
  label: string;
  values: string[];
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

  return Object.entries(structuredData)
    .map(([key, value]) => ({
      key,
      label: BOOK_ANALYSIS_STRUCTURED_FIELD_LABELS[key] ?? key,
      values: normalizeStructuredValue(value),
    }))
    .filter((row) => row.values.length > 0)
    .slice(0, 8);
}

export default function BookAnalysisStructuredSummary({ section }: { section: BookAnalysisSection }) {
  const rows = buildSummaryRows(section);
  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">关键结论</div>
        <div className="text-xs text-muted-foreground">来自结构化拆书结果</div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.map((row) => (
          <div key={row.key} className="rounded-md border bg-background p-3">
            <div className="text-xs font-medium text-muted-foreground">{row.label}</div>
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
          </div>
        ))}
      </div>
    </div>
  );
}
