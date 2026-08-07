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
          label: "conflict intensity",
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
        Select a volume on the left first, or generate the entire volume skeleton first, and then edit the details of the current volume here.
                  </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-[linear-gradient(135deg,hsl(var(--background))_0%,hsl(var(--muted)/0.34)_100%)] p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">Section{selectedVolume.sortOrder}roll</Badge>
              {selectedStrategyVolume ? (
                <Badge variant={selectedStrategyVolume.planningMode === "hard" ? "secondary" : "outline"}>
                  {selectedStrategyVolume.planningMode === "hard" ? "Hard planning" : "soft planning"}
                </Badge>
              ) : null}
              <Badge variant="outline">{selectedVolume.chapters.length} chapter</Badge>
            </div>
            <div className="text-lg font-semibold tracking-tight">
              {selectedVolume.title || selectedStrategyVolume?.roleLabel || `第${selectedVolume.sortOrder}卷`}
            </div>
            <div className="max-w-4xl text-sm leading-6 text-muted-foreground">
              {selectedVolume.mainPromise || selectedVolume.summary || selectedStrategyVolume?.coreReward || "First confirm what rewards this volume will give readers, and then add the starting point, stress source and end-of-volume traction."}
            </div>
          </div>
          <div className="grid min-w-[220px] grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-border/60 bg-background/75 p-3">
              <div className="text-muted-foreground">source of oppression</div>
              <div className="mt-1 line-clamp-2 font-medium">{selectedVolume.primaryPressureSource || "To be replenished"}</div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/75 p-3">
              <div className="text-muted-foreground">Cash in at the end of the volume</div>
              <div className="mt-1 line-clamp-2 font-medium">{selectedVolume.payoffType || selectedVolume.climax || "To be replenished"}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="self-start xl:sticky xl:top-4">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-base font-semibold">Volume Navigation</div>
                <div className="text-sm text-muted-foreground">Locate the current volume to be edited with the volume title and volume description on the left.</div>
              </div>
              <Button size="sm" variant="outline" onClick={onAddVolume}>Add volume</Button>
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
                        <Badge variant={isSelected ? "default" : "outline"}>Section{volume.sortOrder}roll</Badge>
                        {strategyVolume ? (
                          <Badge variant={strategyVolume.planningMode === "hard" ? "secondary" : "outline"}>
                            {strategyVolume.planningMode === "hard" ? "Hard planning" : "soft planning"}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-2 text-sm font-medium">
                        {volume.title || strategyVolume?.roleLabel || `第${volume.sortOrder}卷`}
                      </div>
                      <div className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
                        {volume.summary || volume.mainPromise || strategyVolume?.coreReward || "First fill in the title and description of this volume to facilitate subsequent navigation."}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
                There is currently no volume skeleton. First create volume strategy suggestions, and then click "Generate full volume skeleton".
                                                </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3">
          <VolumePayoffOverviewCard selectedVolume={selectedVolume} />
          <TensionCurvePanel
            title="The tension of this volume"
            subtitle="Check the chapter conflict intensity trend. The red dot indicates the intensity you have reserved for subsequent AI."
            series={tensionCurveSeries}
            readonly
            compact
          />
          <div className="flex justify-end">
            <Button type="button" size="sm" variant="outline" onClick={onGoToStructuredTab}>
              De-rhythm/de-chapter editing curve
                                      </Button>
          </div>
          <Card key={selectedVolume.id} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Section{selectedVolume.sortOrder}roll</Badge>
                  {selectedStrategyVolume ? (
                    <Badge variant={selectedStrategyVolume.planningMode === "hard" ? "secondary" : "outline"}>
                      {selectedStrategyVolume.planningMode === "hard" ? "Hard planning" : "soft planning"}
                    </Badge>
                  ) : null}
                  {selectedStrategyVolume?.roleLabel ? <span className="text-sm text-muted-foreground">{selectedStrategyVolume.roleLabel}</span> : null}
                  <span className="text-sm text-muted-foreground">
                    {selectedVolume.chapters.length > 0
                      ? `章节 ${selectedVolume.chapters[0]?.chapterOrder}-${selectedVolume.chapters[selectedVolume.chapters.length - 1]?.chapterOrder}`
                      : "Unopened"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => onMoveVolume(selectedVolume.id, -1)} disabled={selectedVolume.sortOrder === 1}>move up</Button>
                  <Button size="sm" variant="outline" onClick={() => onMoveVolume(selectedVolume.id, 1)} disabled={selectedVolume.sortOrder === volumes.length}>move down</Button>
                  <Button size="sm" variant="outline" onClick={() => onRemoveVolume(selectedVolume.id)} disabled={volumes.length <= 1}>delete</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <VolumeEditSection
                title="Volume location"
                description="Determine the first impression, readability, and core selling points of this volume on readers."
              >
                <VolumeTextField label="Volume title" value={selectedVolume.title} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "title", value)} wide singleLine />
                <VolumeTextField label="Volume summary" value={selectedVolume.summary ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "summary", value)} />
                <VolumeTextField label="Unwinding handle" value={selectedVolume.openingHook ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "openingHook", value)} />
                <VolumeTextField label="main promise" value={selectedVolume.mainPromise ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "mainPromise", value)} />
                <VolumeTextField label="core selling point" value={selectedVolume.coreSellingPoint ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "coreSellingPoint", value)} />
              </VolumeEditSection>

              <VolumeEditSection
                title="push pressure"
                description="Control the source of oppression, upgrade methods and role changes in this volume to avoid looseness in the middle."
              >
                <VolumeTextField label="main source of oppression" value={selectedVolume.primaryPressureSource ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "primaryPressureSource", value)} />
                <VolumeTextField label="Upgrade method" value={selectedVolume.escalationMode ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "escalationMode", value)} />
                <VolumeTextField label="Protagonist changes" value={selectedVolume.protagonistChange ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "protagonistChange", value)} />
                <VolumeTextField label="mid-range risk" value={selectedVolume.midVolumeRisk ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "midVolumeRisk", value)} />
              </VolumeEditSection>

              <VolumeEditSection
                title="cash in traction"
                description="Clarify end-of-volume rewards, legacy commitments, and traction into the next volume."
              >
                <VolumeTextField label="Climax at the end of the volume" value={selectedVolume.climax ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "climax", value)} />
                <VolumeTextField label="Redemption type" value={selectedVolume.payoffType ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "payoffType", value)} />
                <VolumeTextField label="Lower roll hook" value={selectedVolume.nextVolumeHook ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "nextVolumeHook", value)} />
                <VolumeTextField label="intervolume reset point" value={selectedVolume.resetPoint ?? ""} onChange={(value) => onVolumeFieldChange(selectedVolume.id, "resetPoint", value)} />
                <VolumeTextField
                  label="Unfulfilled matters in this volume"
                  value={selectedVolume.openPayoffs.join("\n")}
                  onChange={(value) => onOpenPayoffsChange(selectedVolume.id, value)}
                  placeholder="One per line, or separated by Chinese commas."
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
