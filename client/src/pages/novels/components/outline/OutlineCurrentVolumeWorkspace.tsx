import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import TensionCurvePanel, { type TensionCurveSeries } from "@/components/tensionCurve/TensionCurvePanel";
import VolumePayoffOverviewCard from "../VolumePayoffOverviewCard";
import type { OutlineTabViewProps } from "../NovelEditView.types";

type OutlineVolume = OutlineTabViewProps["volumes"][number];

interface OutlineCurrentVolumeWorkspaceProps {
  selectedVolume: OutlineVolume | undefined;
  strategyPlan: OutlineTabViewProps["strategyPlan"];
  volumes: OutlineVolume[];
  onSelectedVolumeChange: (volumeId: string) => void;
  onAddVolume: () => void;
  onRemoveVolume: OutlineTabViewProps["onRemoveVolume"];
  onMoveVolume: OutlineTabViewProps["onMoveVolume"];
  onVolumeFieldChange: OutlineTabViewProps["onVolumeFieldChange"];
  onOpenPayoffsChange: OutlineTabViewProps["onOpenPayoffsChange"];
  onGoToStructuredTab: () => void;
}

export default function OutlineCurrentVolumeWorkspace(props: OutlineCurrentVolumeWorkspaceProps) {
  const {
    selectedVolume,
    strategyPlan,
    volumes,
    onSelectedVolumeChange,
    onAddVolume,
    onRemoveVolume,
    onMoveVolume,
    onVolumeFieldChange,
    onOpenPayoffsChange,
    onGoToStructuredTab,
  } = props;
  const selectedStrategyVolume = selectedVolume
    ? strategyPlan?.volumes.find((item) => item.sortOrder === selectedVolume.sortOrder) ?? null
    : null;
  const tensionCurveSeries: TensionCurveSeries[] = selectedVolume
    ? [
        {
          id: "conflictLevel",
          label: "冲突强度",
          color: "#2563eb",
          points: selectedVolume.chapters.map((chapter) => ({
            id: chapter.id,
            chapterOrder: chapter.chapterOrder,
            title: chapter.title || `第${chapter.chapterOrder}章`,
            value: typeof chapter.conflictLevel === "number" ? chapter.conflictLevel : null,
            source: chapter.conflictLevelSource ?? "ai",
          })),
        },
      ]
    : [];

  if (!selectedVolume) {
    return (
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
        左侧先选择一卷，或先生成全书卷骨架，再在这里编辑当前卷详情。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,hsl(var(--background))_0%,hsl(var(--muted)/0.34)_100%)] p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">第{selectedVolume.sortOrder}卷</Badge>
              {selectedStrategyVolume ? (
                <Badge variant={selectedStrategyVolume.planningMode === "hard" ? "secondary" : "outline"}>
                  {selectedStrategyVolume.planningMode === "hard" ? "硬规划" : "软规划"}
                </Badge>
              ) : null}
              <Badge variant="outline">{selectedVolume.chapters.length} 章</Badge>
            </div>
            <div className="text-lg font-semibold tracking-tight">
              {selectedVolume.title || selectedStrategyVolume?.roleLabel || `第${selectedVolume.sortOrder}卷`}
            </div>
            <div className="max-w-4xl text-sm leading-6 text-muted-foreground">
              {selectedVolume.mainPromise || selectedVolume.summary || selectedStrategyVolume?.coreReward || "先确认这一卷要给读者什么回报，再补开卷抓手、压力源和卷末牵引。"}
            </div>
          </div>
          <div className="grid min-w-[220px] grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-border/60 bg-background/75 p-3">
              <div className="text-muted-foreground">压迫源</div>
              <div className="mt-1 line-clamp-2 font-medium">{selectedVolume.primaryPressureSource || "待补"}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/75 p-3">
              <div className="text-muted-foreground">卷末兑现</div>
              <div className="mt-1 line-clamp-2 font-medium">{selectedVolume.payoffType || selectedVolume.climax || "待补"}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="self-start xl:sticky xl:top-4">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-base font-semibold">卷导航</div>
                <div className="text-sm text-muted-foreground">左侧用卷标题和卷描述定位当前要编辑的卷。</div>
              </div>
              <Button size="sm" variant="outline" onClick={onAddVolume}>新增卷</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {volumes.length > 0 ? (
              <div className="max-h-[720px] space-y-2 overflow-y-auto pr-1">
                {volumes.map((volume) => {
                  const strategyVolume = strategyPlan?.volumes.find((item) => item.sortOrder === volume.sortOrder) ?? null;
                  const isSelected = selectedVolume.id === volume.id;
                  return (
                    <button
                      key={volume.id}
                      type="button"
                      onClick={() => onSelectedVolumeChange(volume.id)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        isSelected
                          ? "border-sky-400/70 bg-sky-50 shadow-sm ring-1 ring-sky-200"
                          : "border-border/70 bg-background hover:border-primary/30 hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant={isSelected ? "default" : "outline"}>第{volume.sortOrder}卷</Badge>
                        {strategyVolume ? (
                          <Badge variant={strategyVolume.planningMode === "hard" ? "secondary" : "outline"}>
                            {strategyVolume.planningMode === "hard" ? "硬规划" : "软规划"}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-2 text-sm font-medium">
                        {volume.title || strategyVolume?.roleLabel || `第${volume.sortOrder}卷`}
                      </div>
                      <div className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
                        {volume.summary || volume.mainPromise || strategyVolume?.coreReward || "先补这卷的标题和描述，便于后续导航。"}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
                当前还没有卷骨架。先生成卷战略建议，再点击“生成全书卷骨架”。
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3">
          <VolumePayoffOverviewCard selectedVolume={selectedVolume} />
          <TensionCurvePanel
            title="本卷紧张度"
            subtitle="查看章节冲突强度走向，红点表示你固定给后续 AI 保留的强度。"
            series={tensionCurveSeries}
            readonly
            compact
          />
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="outline" onClick={onGoToStructuredTab}>
              去节奏 / 拆章编辑曲线
            </Button>
          </div>
          <Card key={selectedVolume.id} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">第{selectedVolume.sortOrder}卷</Badge>
                  {selectedStrategyVolume ? (
                    <Badge variant={selectedStrategyVolume.planningMode === "hard" ? "secondary" : "outline"}>
                      {selectedStrategyVolume.planningMode === "hard" ? "硬规划" : "软规划"}
                    </Badge>
                  ) : null}
                  {selectedStrategyVolume?.roleLabel ? <span className="text-sm text-muted-foreground">{selectedStrategyVolume.roleLabel}</span> : null}
                  <span className="text-sm text-muted-foreground">
                    {selectedVolume.chapters.length > 0
                      ? `章节 ${selectedVolume.chapters[0]?.chapterOrder}-${selectedVolume.chapters[selectedVolume.chapters.length - 1]?.chapterOrder}`
                      : "未拆章"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => onMoveVolume(selectedVolume.id, -1)} disabled={selectedVolume.sortOrder === 1}>上移</Button>
                  <Button size="sm" variant="outline" onClick={() => onMoveVolume(selectedVolume.id, 1)} disabled={selectedVolume.sortOrder === volumes.length}>下移</Button>
                  <Button size="sm" variant="outline" onClick={() => onRemoveVolume(selectedVolume.id)} disabled={volumes.length <= 1}>删除</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <VolumeEditSection
                title="卷定位"
                description="确定这一卷给读者的第一印象、阅读承诺和核心卖点。"
              >
                <VolumeTextField label="卷标题" value={selectedVolume.title} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "title", value)} wide singleLine />
                <VolumeTextField label="卷摘要" value={selectedVolume.summary ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "summary", value)} />
                <VolumeTextField label="开卷抓手" value={selectedVolume.openingHook ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "openingHook", value)} />
                <VolumeTextField label="主承诺" value={selectedVolume.mainPromise ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "mainPromise", value)} />
                <VolumeTextField label="核心卖点" value={selectedVolume.coreSellingPoint ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "coreSellingPoint", value)} />
              </VolumeEditSection>

              <VolumeEditSection
                title="推进压力"
                description="控制本卷的压迫来源、升级方式和角色变化，避免中段松散。"
              >
                <VolumeTextField label="主压迫源" value={selectedVolume.primaryPressureSource ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "primaryPressureSource", value)} />
                <VolumeTextField label="升级方式" value={selectedVolume.escalationMode ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "escalationMode", value)} />
                <VolumeTextField label="主角变化" value={selectedVolume.protagonistChange ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "protagonistChange", value)} />
                <VolumeTextField label="中段风险" value={selectedVolume.midVolumeRisk ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "midVolumeRisk", value)} />
              </VolumeEditSection>

              <VolumeEditSection
                title="兑现牵引"
                description="明确卷末回报、遗留承诺和进入下一卷的牵引。"
              >
                <VolumeTextField label="卷末高潮" value={selectedVolume.climax ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "climax", value)} />
                <VolumeTextField label="兑现类型" value={selectedVolume.payoffType ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "payoffType", value)} />
                <VolumeTextField label="下卷钩子" value={selectedVolume.nextVolumeHook ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "nextVolumeHook", value)} />
                <VolumeTextField label="卷间重置点" value={selectedVolume.resetPoint ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "resetPoint", value)} />
                <VolumeTextField
                  label="本卷未兑现事项"
                  value={selectedVolume.openPayoffs.join("\n")}
                  onChange={(value) => onOpenPayoffsChange(selectedVolume.id, value)}
                  placeholder="每行一个，或用中文逗号分隔。"
                  wide
                />
              </VolumeEditSection>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function VolumeEditSection(props: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-muted/10 p-3">
      <div className="mb-3 flex flex-col gap-1 border-b border-border/50 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-foreground">{props.title}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{props.description}</div>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">{props.children}</div>
    </section>
  );
}

function VolumeTextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  wide?: boolean;
  singleLine?: boolean;
}) {
  return (
    <label className={`space-y-1 text-sm ${props.wide ? "md:col-span-2" : ""}`}>
      <span className="text-xs text-muted-foreground">{props.label}</span>
      {props.singleLine ? (
        <input
          className="w-full rounded-md border bg-background p-2"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      ) : (
        <textarea
          className="min-h-[84px] w-full rounded-md border bg-background p-2"
          placeholder={props.placeholder}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
    </label>
  );
}
