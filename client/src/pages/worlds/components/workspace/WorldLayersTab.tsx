import type { Dispatch, SetStateAction } from "react";
import type { World } from "@ai-novel/shared/types/world";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StreamOutput from "@/components/common/StreamOutput";
import {
  LAYERS,
  LAYER_STATUS_LABELS,
  pickLayerFieldText,
  type LayerKey,
  type RefineAttribute,
  REFINE_ATTRIBUTE_OPTIONS,
} from "./worldWorkspaceShared";
import SelectControl from "@/components/common/SelectControl";

interface WorldLayersTabProps {
  world?: World;
  selectedLayer: LayerKey;
  setSelectedLayer: (layer: LayerKey) => void;
  layerDrafts: Partial<Record<LayerKey, string>>;
  setLayerDrafts: Dispatch<SetStateAction<Partial<Record<LayerKey, string>>>>;
  layerStates: Record<string, { status: string; updatedAt: string }>;
  isInitialLayerGeneration: boolean;
  generateAllPending: boolean;
  generateLayerPending: boolean;
  generateLayerVariable?: LayerKey;
  saveLayerPending: boolean;
  saveLayerVariable?: { layerKey: LayerKey; content: string };
  confirmLayerPending: boolean;
  confirmLayerVariable?: LayerKey;
  onGenerateAll: () => void;
  onGenerateLayer: (layer: LayerKey) => void;
  onSaveLayer: (payload: { layerKey: LayerKey; content: string }) => void;
  onConfirmLayer: (layer: LayerKey) => void;
  refineAttribute: RefineAttribute;
  setRefineAttribute: (value: RefineAttribute) => void;
  refineMode: "replace" | "alternatives";
  setRefineMode: (value: "replace" | "alternatives") => void;
  refineLevel: "light" | "deep";
  setRefineLevel: (value: "light" | "deep") => void;
  onStartRefine: () => void;
  refineStreaming: boolean;
  refineContent: string;
  onAbortRefine: () => void;
}

export default function WorldLayersTab(props: WorldLayersTabProps) {
  const {
    world,
    selectedLayer,
    setSelectedLayer,
    layerDrafts,
    setLayerDrafts,
    layerStates,
    isInitialLayerGeneration,
    generateAllPending,
    generateLayerPending,
    generateLayerVariable,
    saveLayerPending,
    saveLayerVariable,
    confirmLayerPending,
    confirmLayerVariable,
    onGenerateAll,
    onGenerateLayer,
    onSaveLayer,
    onConfirmLayer,
    refineAttribute,
    setRefineAttribute,
    refineMode,
    setRefineMode,
    refineLevel,
    setRefineLevel,
    onStartRefine,
    refineStreaming,
    refineContent,
    onAbortRefine,
  } = props;
  const selectedLayerMeta = LAYERS.find((layer) => layer.key === selectedLayer) ?? LAYERS[0];
  const worldRecord = world as unknown as Record<string, unknown> | undefined;
  const hasSelectedDraft = Object.prototype.hasOwnProperty.call(layerDrafts, selectedLayerMeta.key);
  const selectedLayerValue = hasSelectedDraft
    ? (layerDrafts[selectedLayerMeta.key] ?? "")
    : pickLayerFieldText(selectedLayerMeta.key, worldRecord);
  const selectedLayerStatus = layerStates[selectedLayerMeta.key]?.status ?? "pending";
  const isGeneratingSelectedLayer = generateLayerPending && generateLayerVariable === selectedLayerMeta.key;
  const isSavingSelectedLayer =
    saveLayerPending && saveLayerVariable?.layerKey === selectedLayerMeta.key;
  const isConfirmingSelectedLayer =
    confirmLayerPending && confirmLayerVariable === selectedLayerMeta.key;

  return (
    <Card>
      <CardHeader>
        <CardTitle>分层整理世界</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
          <Button onClick={onGenerateAll} disabled={generateAllPending || !world}>
            {generateAllPending ? "整理中..." : isInitialLayerGeneration ? "AI 整理六层摘要" : "重新整理六层摘要"}
          </Button>
          <div className="text-xs text-muted-foreground">
            {isInitialLayerGeneration
              ? "系统会把世界手册整理为基础、力量、社会、文化、历史和冲突六个写作摘要。"
              : "有世界骨架时会按手册内容整理摘要；没有骨架的旧世界才会补写缺失层级。"}
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="space-y-2 rounded-md border p-3">
            <div className="text-sm font-medium">选择要整理的层级</div>
            <div className="space-y-2">
              {LAYERS.map((layer) => {
                const layerStatus = layerStates[layer.key]?.status ?? "pending";
                const hasDraft = Object.prototype.hasOwnProperty.call(layerDrafts, layer.key);

                return (
                  <button
                    key={layer.key}
                    type="button"
                    className={[
                      "w-full rounded-md border p-2 text-left text-sm transition-colors",
                      selectedLayer === layer.key ? "border-primary bg-primary/5" : "border-border/70 bg-background hover:bg-muted/40",
                    ].join(" ")}
                    onClick={() => setSelectedLayer(layer.key)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{layer.label}</span>
                      {hasDraft ? <span className="text-xs text-primary">草稿</span> : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {LAYER_STATUS_LABELS[layerStatus] ?? layerStatus}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{selectedLayerMeta.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  状态：{LAYER_STATUS_LABELS[selectedLayerStatus] ?? selectedLayerStatus}
                </div>
              </div>
              {hasSelectedDraft ? <div className="text-xs text-primary">有未保存草稿</div> : null}
            </div>
            <textarea
              className="min-h-[260px] w-full rounded-md border bg-background p-2 text-sm"
              value={selectedLayerValue}
              onChange={(event) =>
                setLayerDrafts((prev) => ({
                  ...prev,
                  [selectedLayerMeta.key]: event.target.value,
                }))
              }
            />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  if (isInitialLayerGeneration) {
                    onGenerateAll();
                    return;
                  }
                  onGenerateLayer(selectedLayerMeta.key);
                }}
                disabled={generateAllPending || generateLayerPending || !world}
              >
                {isInitialLayerGeneration
                  ? generateAllPending
                    ? "六层生成中..."
                    : "首次 AI 生成六层"
                  : isGeneratingSelectedLayer
                    ? "重写中..."
                    : "AI 整理本层"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => onSaveLayer({ layerKey: selectedLayerMeta.key, content: selectedLayerValue })}
                disabled={saveLayerPending || generateAllPending || !selectedLayerValue.trim()}
              >
                {isSavingSelectedLayer ? "保存中..." : "保存本层"}
              </Button>
              <Button
                variant="outline"
                onClick={() => onConfirmLayer(selectedLayerMeta.key)}
                disabled={confirmLayerPending || generateAllPending}
              >
                {isConfirmingSelectedLayer ? "确认中..." : "确认本层"}
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-md border p-3">
          <div className="mb-2 text-sm font-medium">AI 精修</div>
          <div className="grid gap-2 md:grid-cols-4">
            <SelectControl
              className="rounded-md border bg-background p-2 text-sm"
              value={refineAttribute}
              onChange={(event) => setRefineAttribute(event.target.value as RefineAttribute)}
            >
              {REFINE_ATTRIBUTE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </SelectControl>
            <SelectControl
              className="rounded-md border bg-background p-2 text-sm"
              value={refineMode}
              onChange={(event) => setRefineMode(event.target.value as "replace" | "alternatives")}
            >
              <option value="replace">替换优化</option>
              <option value="alternatives">提供备选方案</option>
            </SelectControl>
            <SelectControl
              className="rounded-md border bg-background p-2 text-sm"
              value={refineLevel}
              onChange={(event) => setRefineLevel(event.target.value as "light" | "deep")}
            >
              <option value="light">轻度</option>
              <option value="deep">深度</option>
            </SelectControl>
            <Button onClick={onStartRefine} disabled={refineStreaming}>
              {refineStreaming ? "精修中..." : selectedLayer === "foundation" ? "精修世界基底" : "精修本层"}
            </Button>
          </div>
          <StreamOutput content={refineContent} isStreaming={refineStreaming} onAbort={onAbortRefine} />
        </div>
      </CardContent>
    </Card>
  );
}
