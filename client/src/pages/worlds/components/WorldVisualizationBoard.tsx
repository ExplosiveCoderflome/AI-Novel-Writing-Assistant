import { useMemo, useState } from "react";
import type { WorldVisualizationPayload } from "@ai-novel/shared/types/world";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SelectControl from "@/components/common/SelectControl";
import WorldGraphCanvas from "./visualization/WorldGraphCanvas";
import WorldTimelinePanel from "./visualization/WorldTimelinePanel";

interface WorldVisualizationBoardProps {
  payload?: WorldVisualizationPayload;
}

const FACTION_TYPE_LABELS: Record<string, string> = {
  all: "全部类型",
  state: "政权",
  faction: "阵营",
  race: "种族",
  organization: "组织",
  other: "其他",
};

const FACTION_TYPE_COLORS: Record<string, string> = {
  state: "#2563eb",
  faction: "#16a34a",
  race: "#ea580c",
  organization: "#7c3aed",
  other: "#64748b",
};

export default function WorldVisualizationBoard({ payload }: WorldVisualizationBoardProps) {
  const [mode, setMode] = useState<"faction" | "geography" | "power" | "timeline">("faction");
  const [keyword, setKeyword] = useState("");
  const [factionType, setFactionType] = useState("all");
  const [timelineLimit, setTimelineLimit] = useState(8);

  const factionTypeOptions = useMemo(() => {
    const types = Array.from(
      new Set((payload?.factionGraph.nodes ?? []).map((node) => node.type?.trim()).filter(Boolean)),
    );
    return ["all", ...types];
  }, [payload?.factionGraph.nodes]);

  const factionNodes = useMemo(() => {
    const source = payload?.factionGraph.nodes ?? [];
    return source.filter((node) => {
      const matchType = factionType === "all" || node.type === factionType;
      const matchKeyword = keyword.trim()
        ? node.label.toLowerCase().includes(keyword.trim().toLowerCase())
        : true;
      return matchType && matchKeyword;
    });
  }, [factionType, keyword, payload?.factionGraph.nodes]);

  const factionNodeIds = useMemo(() => new Set(factionNodes.map((node) => node.id)), [factionNodes]);
  const factionEdges = useMemo(
    () => (payload?.factionGraph.edges ?? []).filter(
      (edge) => factionNodeIds.has(edge.source) && factionNodeIds.has(edge.target),
    ),
    [factionNodeIds, payload?.factionGraph.edges],
  );

  const geographyNodes = useMemo(() => {
    const source = payload?.geographyMap.nodes ?? [];
    return source.filter((node) => (
      keyword.trim() ? node.label.toLowerCase().includes(keyword.trim().toLowerCase()) : true
    ));
  }, [keyword, payload?.geographyMap.nodes]);
  const geographyNodeIds = useMemo(() => new Set(geographyNodes.map((node) => node.id)), [geographyNodes]);
  const geographyEdges = useMemo(
    () => (payload?.geographyMap.edges ?? []).filter(
      (edge) => geographyNodeIds.has(edge.source) && geographyNodeIds.has(edge.target),
    ),
    [geographyNodeIds, payload?.geographyMap.edges],
  );

  const filteredPower = useMemo(() => {
    const source = payload?.powerTree ?? [];
    if (!keyword.trim()) {
      return source;
    }
    const lower = keyword.trim().toLowerCase();
    return source.filter((item) => item.level.toLowerCase().includes(lower) || item.description.toLowerCase().includes(lower));
  }, [keyword, payload?.powerTree]);

  const filteredTimeline = useMemo(() => {
    const source = payload?.timeline ?? [];
    const byKeyword = keyword.trim()
      ? source.filter((item) => `${item.year} ${item.event}`.toLowerCase().includes(keyword.trim().toLowerCase()))
      : source;
    return byKeyword.slice(0, timelineLimit);
  }, [keyword, payload?.timeline, timelineLimit]);

  return (
    <section className="space-y-4 border-t border-border/30 pt-6" aria-label="世界图谱">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-full bg-muted/30 p-1">
          {[
            { value: "faction", label: "势力图谱" },
            { value: "geography", label: "地理地图" },
            { value: "power", label: "力量体系" },
            { value: "timeline", label: "世界时间线" },
          ].map((item) => (
            <Button
              key={item.value}
              type="button"
              size="sm"
              variant={mode === item.value ? "default" : "ghost"}
              className="shrink-0 rounded-full"
              onClick={() => setMode(item.value as typeof mode)}
            >
              {item.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="w-full rounded-full sm:w-72"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="筛选名称或关键词"
          />
          {mode === "faction" ? (
            <SelectControl
              className="rounded-full border border-border/45 bg-background px-4 py-2 text-sm"
              value={factionType}
              onChange={(event) => setFactionType(event.target.value)}
            >
              {factionTypeOptions.map((type) => (
                <option key={type} value={type}>{FACTION_TYPE_LABELS[type] ?? type}</option>
              ))}
            </SelectControl>
          ) : null}
          {mode === "timeline" ? (
            <label className="flex items-center gap-2 rounded-full bg-muted/30 px-4 text-xs text-muted-foreground">
              <span>显示</span>
              <input type="range" min={3} max={20} step={1} value={timelineLimit} onChange={(event) => setTimelineLimit(Number(event.target.value))} />
              <span className="tabular-nums">{timelineLimit}</span>
            </label>
          ) : null}
        </div>
      </div>

      {mode === "faction" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-4 px-1 text-xs text-muted-foreground">
            {factionTypeOptions.filter((type) => type !== "all").map((type) => (
              <div key={type} className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: FACTION_TYPE_COLORS[type] ?? FACTION_TYPE_COLORS.other }} />
                <span>{FACTION_TYPE_LABELS[type] ?? type}</span>
              </div>
            ))}
          </div>
          <WorldGraphCanvas
            title={`势力图谱 · ${factionNodes.length} 个节点 · ${factionEdges.length} 条关系`}
            nodes={factionNodes}
            edges={factionEdges}
            colorByType={(type) => FACTION_TYPE_COLORS[type ?? "other"] ?? FACTION_TYPE_COLORS.other}
          />
        </div>
      ) : null}

      {mode === "geography" ? (
        <WorldGraphCanvas
          title={`世界地图 · ${geographyNodes.length} 个地点 · ${geographyEdges.length} 条路线`}
          nodes={geographyNodes}
          edges={geographyEdges}
          layout="map"
        />
      ) : null}

      {mode === "power" ? (
        <div className="rounded-3xl border border-border/35 bg-card/70 p-5">
          <div className="mb-3 font-medium">力量体系 · {filteredPower.length} 项</div>
          <div className="grid gap-3 md:grid-cols-2">
            {filteredPower.map((item) => (
              <div key={`${item.level}-${item.description}`} className="rounded-2xl bg-muted/20 p-4">
                <div className="text-xs font-semibold text-primary">{item.level}</div>
                <div className="mt-1 text-sm leading-6">{item.description}</div>
              </div>
            ))}
            {filteredPower.length === 0 ? <div className="text-sm text-muted-foreground">暂无匹配内容</div> : null}
          </div>
        </div>
      ) : null}

      {mode === "timeline" ? (
        <WorldTimelinePanel items={filteredTimeline} />
      ) : null}
    </section>
  );
}
