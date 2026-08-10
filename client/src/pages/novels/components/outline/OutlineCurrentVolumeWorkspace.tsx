import i18next from "i18next";
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
          label: i18next.t("dict.gen_3e85c65a"),
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
      <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">{i18next.t("novels.outlineCurrentVolumeWorkspace.ao8me3")}</div>
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
              <div className="text-muted-foreground">{i18next.t("novels.outlineCurrentVolumeWorkspace.cxlu8")}</div>
              <div className="mt-1 line-clamp-2 font-medium">{selectedVolume.primaryPressureSource || "待补"}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/75 p-3">
              <div className="text-muted-foreground">{i18next.t("novels.outlineCurrentVolumeWorkspace.ayhtlf")}</div>
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
                <div className="text-base font-semibold">{i18next.t("dict.gen_a0fa6f5c")}</div>
                <div className="text-sm text-muted-foreground">{i18next.t("dict.gen_dd22e3c6")}</div>
              </div>
              <Button size="sm" variant="outline" onClick={onAddVolume}>{i18next.t("dict.gen_495efc7f")}</Button>
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
              <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">{i18next.t("novels.outlineCurrentVolumeWorkspace.q01dx8")}</div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3">
          <VolumePayoffOverviewCard selectedVolume={selectedVolume} />
          <TensionCurvePanel
            title={i18next.t("dict.gen_623fc2f6")}
            subtitle="查看章节冲突强度走向，红点表示你固定给后续 AI 保留的强度。"
            series={tensionCurveSeries}
            readonly
            compact
          />
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="outline" onClick={onGoToStructuredTab}>{i18next.t("novels.outlineCurrentVolumeWorkspace.p6v3w5")}</Button>
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
                  <Button size="sm" variant="outline" onClick={() => onMoveVolume(selectedVolume.id, -1)} disabled={selectedVolume.sortOrder === 1}>{i18next.t("novels.outlineCurrentVolumeWorkspace.dxyp")}</Button>
                  <Button size="sm" variant="outline" onClick={() => onMoveVolume(selectedVolume.id, 1)} disabled={selectedVolume.sortOrder === volumes.length}>{i18next.t("novels.outlineCurrentVolumeWorkspace.dxzk")}</Button>
                  <Button size="sm" variant="outline" onClick={() => onRemoveVolume(selectedVolume.id)} disabled={volumes.length <= 1}>{i18next.t("dict.gen_2f4aaddd")}</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <VolumeEditSection
                title={i18next.t("novels.outlineCurrentVolumeWorkspace.co4h6")}
                description={i18next.t("novels.outlineCurrentVolumeWorkspace.o0t9ao")}
              >
                <VolumeTextField label={i18next.t("dict.gen_5a33e631")} value={selectedVolume.title} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "title", value)} wide singleLine />
                <VolumeTextField label={i18next.t("dict.gen_4f518d8c")} value={selectedVolume.summary ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "summary", value)} />
                <VolumeTextField label={i18next.t("dict.gen_67523299")} value={selectedVolume.openingHook ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "openingHook", value)} />
                <VolumeTextField label={i18next.t("dict.mainPromise")} value={selectedVolume.mainPromise ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "mainPromise", value)} />
                <VolumeTextField label={i18next.t("dict.gen_144c6d68")} value={selectedVolume.coreSellingPoint ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "coreSellingPoint", value)} />
              </VolumeEditSection>

              <VolumeEditSection
                title={i18next.t("novels.outlineCurrentVolumeWorkspace.d5z8wz")}
                description={i18next.t("novels.outlineCurrentVolumeWorkspace.j2km2r")}
              >
                <VolumeTextField label={i18next.t("dict.mainOppressor")} value={selectedVolume.primaryPressureSource ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "primaryPressureSource", value)} />
                <VolumeTextField label={i18next.t("dict.gen_bc363719")} value={selectedVolume.escalationMode ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "escalationMode", value)} />
                <VolumeTextField label={i18next.t("dict.mainCharacterChange")} value={selectedVolume.protagonistChange ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "protagonistChange", value)} />
                <VolumeTextField label={i18next.t("dict.midSectionRisk")} value={selectedVolume.midVolumeRisk ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "midVolumeRisk", value)} />
              </VolumeEditSection>

              <VolumeEditSection
                title={i18next.t("novels.outlineCurrentVolumeWorkspace.aqq67z")}
                description={i18next.t("novels.outlineCurrentVolumeWorkspace.p88o6l")}
              >
                <VolumeTextField label={i18next.t("dict.gen_c268bee7")} value={selectedVolume.climax ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "climax", value)} />
                <VolumeTextField label={i18next.t("dict.gen_057e169f")} value={selectedVolume.payoffType ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "payoffType", value)} />
                <VolumeTextField label={i18next.t("dict.volumeHook")} value={selectedVolume.nextVolumeHook ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "nextVolumeHook", value)} />
                <VolumeTextField label={i18next.t("dict.gen_315e0a35")} value={selectedVolume.resetPoint ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "resetPoint", value)} />
                <VolumeTextField
                  label={i18next.t("dict.gen_db7f46ca")}
                  value={selectedVolume.openPayoffs.join("\n")}
                  onChange={(value) => onOpenPayoffsChange(selectedVolume.id, value)}
                  placeholder={i18next.t("dict.gen_756ea85e")}
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
