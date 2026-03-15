import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

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

  useEffect(() => {
    setExpanded(!defaultCollapsed);
  }, [defaultCollapsed]);

  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-slate-900">运行细节</div>
          <div className="mt-1 text-xs text-slate-500">
            {runId ? `Run ${runId.slice(0, 8)}` : "当前回合调试信息"} · {entries.length} 条
          </div>
        </div>
        <button
          type="button"
          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] text-slate-600 transition hover:bg-slate-100"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收起细节" : "展开细节"}
        </button>
      </div>
      {expanded ? (
        <div className="mt-3 space-y-3">
          {entries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-3 text-xs text-slate-500">
              当前回合还没有可展示的调试信息。
            </div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-slate-900">{entry.title}</div>
                  <Badge variant={toVariant(entry.tone)}>{entry.kind}</Badge>
                </div>
                <div className="mt-2 text-xs leading-5 text-slate-700">{entry.summary}</div>
                {entry.meta.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {entry.meta.map((item) => (
                      <span key={item} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
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
        <div className="mt-2 text-xs text-slate-500">
          默认已折叠底层运行、工具与 checkpoint 细节；展开后可查看完整调试轨迹。
        </div>
      )}
    </div>
  );
}
