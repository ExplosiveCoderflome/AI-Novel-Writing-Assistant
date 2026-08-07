import { useEffect, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface CreativeHubDebugTraceEntry {
  id: string;
  kind: string;
  title: string;
  summary: string;
  meta: string[];
  tone?: "default" | "secondary" | "destructive";
}

interface CreativeHubDebugTraceCardProps {
  runId?: string | null;
  entries: CreativeHubDebugTraceEntry[];
  defaultCollapsed: boolean;
}

function toVariant(tone?: CreativeHubDebugTraceEntry["tone"]): "outline" | "secondary" | "destructive" {
  if (tone === "destructive") {
    return "destructive";
  }
  if (tone === "secondary") {
    return "secondary";
  }
  return "outline";
}

export default function CreativeHubDebugTraceCard({
  runId,
  entries,
  defaultCollapsed,
}: CreativeHubDebugTraceCardProps) {
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  const detailsId = useId();

  useEffect(() => {
    setExpanded(!defaultCollapsed);
  }, [defaultCollapsed]);

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/20 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-foreground">Operational details</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Low-level execution records · {entries.length} strip
                                </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={detailsId}
        >
          {expanded ? "Collapse details" : "Expand details"}
        </Button>
      </div>
      {expanded ? (
        <div id={detailsId} className="mt-3 space-y-3">
          {runId ? (
            <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-xs">
              <span className="shrink-0 text-muted-foreground">Run ID</span>
              <span className="break-all text-right text-foreground">{runId}</span>
            </div>
          ) : null}
          {entries.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-background px-3 py-3 text-xs text-muted-foreground">
              There is no debugging information to display for the current round.
                                      </div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="rounded-md border border-border bg-background px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-foreground">{entry.title}</div>
                  <Badge variant={toVariant(entry.tone)}>{entry.kind}</Badge>
                </div>
                <div className="mt-2 text-xs leading-5 text-muted-foreground">{entry.summary}</div>
                {entry.meta.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {entry.meta.map((item) => (
                      <span key={item} className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                        {item}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="mt-2 text-xs text-muted-foreground">
          The underlying run, tool and checkpoint details are collapsed by default; you can view the complete debugging trace after expanding.
                              </div>
      )}
    </div>
  );
}
