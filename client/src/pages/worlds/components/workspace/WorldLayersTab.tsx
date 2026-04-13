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

  return (
    <Card>
      <CardHeader>
        <CardTitle>分层构建</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
          <Button onClick={onGenerateAll} disabled={generateAllPending || !world}>
            {generateAllPending ? "六层生成中..." : isInitialLayerGeneration ? "首次 AI 生成六层" : "一键重建六层"}
          </Button>
          <div className="text-xs text-muted-foreground">
            {isInitialLayerGeneration
              ? "首次 AI 生成会并发构建 6 层。"
              : "首次生成已完成，支持单层 AI 重写。"}
          </div>
        </div>

        <div className="space-y-3">
          {LAYERS.map((layer) => {
            const hasDraft = Object.prototype.hasOwnProperty.call(layerDrafts, layer.key);
            const worldRecord = world as unknown as Record<string, unknown> | undefined;
            const layerValue = hasDraft
              ? (layerDrafts[layer.key] ?? "")
              : pickLayerFieldText(layer.key, worldRecord);
            const layerStatus = layerStates[layer.key]?.status ?? "pending";
            const isGeneratingCurrentLayer = generateLayerPending && generateLayerVariable === layer.key;
            const isSavingCurrentLayer =
              saveLayerPending && saveLayerVariable?.layerKey === layer.key;
            const isConfirmingCurrentLayer =
              confirmLayerPending && confirmLayerVariable === layer.key;

            return (
              <div key={layer.key} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{layer.label}</div>
                  <div className="text-xs text-muted-foreground">
                    状态：{LAYER_STATUS_LABELS[layerStatus] ?? layerStatus}
                  </div>
                </div>
                <textarea
                  className="min-h-[160px] w-full rounded-md border bg-background p-2 text-sm"
                  value={layerValue}
                  onFocus={() => setSelectedLayer(layer.key)}
                  onChange={(event) =>
                    setLayerDrafts((prev) => ({
                      ...prev,
                      [layer.key]: event.target.value,
                    }))
                  }
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      setSelectedLayer(layer.key);
                      if (isInitialLayerGeneration) {
                        onGenerateAll();
                        return;
                      }
                      onGenerateLayer(layer.key);
                    }}
                    disabled={generateAllPending || generateLayerPending || !world}
                  >
                    {isInitialLayerGeneration
                      ? generateAllPending
                        ? "六层生成中..."
                        : "首次 AI 生成六层"
                      : isGeneratingCurrentLayer
                        ? "重写中..."
                        : "AI 重写本层"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => onSaveLayer({ layerKey: layer.key, content: layerValue })}
                    disabled={saveLayerPending || generateAllPending || !layerValue.trim()}
                  >
                    {isSavingCurrentLayer ? "保存中..." : "手动保存本层"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onConfirmLayer(layer.key)}
                    disabled={confirmLayerPending || generateAllPending}
                  >
                    {isConfirmingCurrentLayer ? "确认中..." : "确认本层"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-md border p-3">
          <div className="mb-2 text-sm font-medium">精炼</div>
          <div className="grid gap-2 md:grid-cols-4">
            <select
              className="rounded-md border bg-background p-2 text-sm"
              value={refineAttribute}
              onChange={(event) => setRefineAttribute(event.target.value as RefineAttribute)}
            >
              {REFINE_ATTRIBUTE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border bg-background p-2 text-sm"
              value={refineMode}
              onChange={(event) => setRefineMode(event.target.value as "replace" | "alternatives")}
            >
              <option value="replace">替换优化</option>
              <option value="alternatives">提供备选方案</option>
            </select>
            <select
              className="rounded-md border bg-background p-2 text-sm"
              value={refineLevel}
              onChange={(event) => setRefineLevel(event.target.value as "light" | "deep")}
            >
              <option value="light">轻度</option>
              <option value="deep">深度</option>
            </select>
            <Button onClick={onStartRefine} disabled={refineStreaming}>
              {refineStreaming ? "精炼中..." : `开始精炼 ${selectedLayer === "foundation" ? "当前世界" : ""}`.trim()}
            </Button>
          </div>
          <StreamOutput content={refineContent} isStreaming={refineStreaming} onAbort={onAbortRefine} />
        </div>
      </CardContent>
    </Card>
  );
}
