import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LLMSelector from "@/components/common/LLMSelector";
import StreamOutput from "@/components/common/StreamOutput";
import KnowledgeBindingPanel from "@/components/knowledge/KnowledgeBindingPanel";
import {
  answerWorldDeepeningQuestions,
  checkWorldConsistency,
  confirmWorldLayer,
  createWorldLibraryItem,
  createWorldSnapshot,
  diffWorldSnapshots,
  exportWorldData,
  generateAllWorldLayers,
  generateWorldDeepeningQuestions,
  generateWorldLayer,
  getWorldDetail,
  getWorldOverview,
  getWorldVisualization,
  listWorldLibrary,
  listWorldSnapshots,
  patchWorldConsistencyIssue,
  restoreWorldSnapshot,
  updateWorldLayer,
  useWorldLibraryItem,
  importWorldData,
} from "@/api/world";
import { queryKeys } from "@/api/queryKeys";
import { useLLMStore } from "@/store/llmStore";
import { useSSE } from "@/hooks/useSSE";
import { featureFlags } from "@/config/featureFlags";
import WorldVisualizationBoard from "./components/WorldVisualizationBoard";

const LAYERS: Array<{
  key: "foundation" | "power" | "society" | "culture" | "history" | "conflict";
  label: string;
  primaryField:
    | "background"
    | "magicSystem"
    | "politics"
    | "cultures"
    | "history"
    | "conflicts";
}> = [
  { key: "foundation", label: "L1 基础层", primaryField: "background" },
  { key: "power", label: "L2 力量层", primaryField: "magicSystem" },
  { key: "society", label: "L3 社会层", primaryField: "politics" },
  { key: "culture", label: "L4 文化层", primaryField: "cultures" },
  { key: "history", label: "L5 历史层", primaryField: "history" },
  { key: "conflict", label: "L6 冲突层", primaryField: "conflicts" },
];

type LayerKey = (typeof LAYERS)[number]["key"];
type LayerField =
  | "description"
  | "background"
  | "geography"
  | "cultures"
  | "magicSystem"
  | "politics"
  | "races"
  | "religions"
  | "technology"
  | "conflicts"
  | "history"
  | "economy"
  | "factions";

const LAYER_STATUS_LABELS: Record<string, string> = {
  pending: "待生成",
  generated: "已生成",
  confirmed: "已确认",
  stale: "待重建",
};

const LAYER_FIELDS_BY_KEY: Record<LayerKey, LayerField[]> = {
  foundation: ["background", "geography"],
  power: ["magicSystem", "technology"],
  society: ["politics", "races", "factions"],
  culture: ["cultures", "religions", "economy"],
  history: ["history"],
  conflict: ["conflicts", "description"],
};

function normalizeLayerText(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }
  if (raw === null || raw === undefined) {
    return "";
  }
  if (typeof raw === "object") {
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      return "";
    }
  }
  return String(raw);
}

function pickLayerFieldText(
  layerKey: LayerKey,
  source: Record<string, unknown> | undefined,
): string {
  if (!source) {
    return "";
  }
  for (const field of LAYER_FIELDS_BY_KEY[layerKey]) {
    const text = normalizeLayerText(source[field]).trim();
    if (text) {
      return text;
    }
  }
  return "";
}

type RefineAttribute =
  | "description"
  | "background"
  | "geography"
  | "cultures"
  | "magicSystem"
  | "politics"
  | "races"
  | "religions"
  | "technology"
  | "conflicts"
  | "history"
  | "economy"
  | "factions";

const REFINE_ATTRIBUTE_OPTIONS: Array<{ value: RefineAttribute; label: string }> = [
  { value: "background", label: "基础背景" },
  { value: "geography", label: "地理环境" },
  { value: "cultures", label: "文化习俗" },
  { value: "magicSystem", label: "力量体系" },
  { value: "politics", label: "政治结构" },
  { value: "races", label: "种族设定" },
  { value: "religions", label: "宗教信仰" },
  { value: "technology", label: "技术体系" },
  { value: "history", label: "历史脉络" },
  { value: "economy", label: "经济系统" },
  { value: "conflicts", label: "核心冲突" },
  { value: "description", label: "世界概述" },
  { value: "factions", label: "势力关系" },
];

export default function WorldWorkspace() {
  const { id = "" } = useParams();
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const [selectedLayer, setSelectedLayer] = useState<LayerKey>("foundation");
  const [layerDrafts, setLayerDrafts] = useState<Partial<Record<LayerKey, string>>>({});
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [llmQuickOptions, setLlmQuickOptions] = useState<Record<string, string[]>>({});
  const [diffFrom, setDiffFrom] = useState("");
  const [diffTo, setDiffTo] = useState("");
  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [importFormat, setImportFormat] = useState<"json" | "markdown" | "text">("text");
  const [importContent, setImportContent] = useState("");
  const [libraryKeyword, setLibraryKeyword] = useState("");
  const [libraryCategory, setLibraryCategory] = useState("all");
  const [publishName, setPublishName] = useState("");
  const [publishCategory, setPublishCategory] = useState("custom");
  const [publishDescription, setPublishDescription] = useState("");
  const [refineAttribute, setRefineAttribute] = useState<RefineAttribute>("background");
  const [refineMode, setRefineMode] = useState<"replace" | "alternatives">("replace");
  const [refineLevel, setRefineLevel] = useState<"light" | "deep">("light");

  const worldDetailQuery = useQuery({
    queryKey: queryKeys.worlds.detail(id),
    queryFn: () => getWorldDetail(id),
    enabled: Boolean(id),
  });

  const overviewQuery = useQuery({
    queryKey: queryKeys.worlds.overview(id),
    queryFn: () => getWorldOverview(id),
    enabled: Boolean(id),
  });

  const visualizationQuery = useQuery({
    queryKey: queryKeys.worlds.visualization(id),
    queryFn: () => getWorldVisualization(id),
    enabled: Boolean(id) && featureFlags.worldVisEnabled,
  });

  const snapshotQuery = useQuery({
    queryKey: queryKeys.worlds.snapshots(id),
    queryFn: () => listWorldSnapshots(id),
    enabled: Boolean(id),
  });

  const libraryQuery = useQuery({
    queryKey: queryKeys.worlds.library(
      `${worldDetailQuery.data?.data?.worldType ?? "all"}-${libraryCategory}-${libraryKeyword}`,
    ),
    queryFn: () =>
      listWorldLibrary({
        worldType: worldDetailQuery.data?.data?.worldType ?? undefined,
        category: libraryCategory === "all" ? undefined : libraryCategory,
        keyword: libraryKeyword.trim() || undefined,
        limit: 40,
      }),
    enabled: Boolean(id),
  });

  const world = worldDetailQuery.data?.data;
  const selectedLayerMeta = useMemo(
    () => LAYERS.find((item) => item.key === selectedLayer) ?? LAYERS[0],
    [selectedLayer],
  );

  const invalidateWorld = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.worlds.detail(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.worlds.overview(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.worlds.visualization(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.worlds.snapshots(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.worlds.library("all") });
  };

  const generateLayerMutation = useMutation({
    mutationFn: (layerKey: LayerKey) =>
      generateWorldLayer(id, layerKey, {
        provider: llm.provider,
        model: llm.model,
        temperature: 0.7,
      }),
    onSuccess: async (response, layerKey) => {
      const generated = pickLayerFieldText(
        layerKey,
        response.data?.generated as Record<string, unknown> | undefined,
      );
      if (generated.trim()) {
        setLayerDrafts((prev) => ({ ...prev, [layerKey]: generated }));
      }
      await invalidateWorld();
    },
  });

  const generateAllLayersMutation = useMutation({
    mutationFn: () =>
      generateAllWorldLayers(id, {
        provider: llm.provider,
        model: llm.model,
        temperature: 0.7,
      }),
    onSuccess: async (response) => {
      setLayerDrafts((prev) => {
        const next = { ...prev };
        for (const layer of LAYERS) {
          const generated = pickLayerFieldText(
            layer.key,
            response.data?.generated?.[layer.key] as Record<string, unknown> | undefined,
          );
          if (generated.trim()) {
            next[layer.key] = generated;
          }
        }
        return next;
      });
      await invalidateWorld();
    },
  });

  const saveLayerMutation = useMutation({
    mutationFn: (payload: { layerKey: LayerKey; content: string }) =>
      updateWorldLayer(id, payload.layerKey, payload.content),
    onSuccess: invalidateWorld,
  });

  const confirmLayerMutation = useMutation({
    mutationFn: (layerKey: LayerKey) => confirmWorldLayer(id, layerKey),
    onSuccess: invalidateWorld,
  });

  const deepeningQuestionMutation = useMutation({
    mutationFn: () =>
      generateWorldDeepeningQuestions(id, {
        provider: llm.provider,
        model: llm.model,
      }),
    onSuccess: async (response) => {
      const nextMap: Record<string, string[]> = {};
      for (const item of response.data ?? []) {
        const options = (item.quickOptions ?? [])
          .map((option) => option.trim())
          .filter(Boolean)
          .slice(0, 4);
        if (options.length > 0) {
          nextMap[item.id] = options;
        }
      }
      if (Object.keys(nextMap).length > 0) {
        setLlmQuickOptions((prev) => ({ ...prev, ...nextMap }));
      }
      await invalidateWorld();
    },
  });

  const deepeningAnswerMutation = useMutation({
    mutationFn: () =>
      answerWorldDeepeningQuestions(
        id,
        Object.entries(answerDrafts)
          .filter(([, answer]) => answer.trim())
          .map(([questionId, answer]) => ({ questionId, answer })),
      ),
    onSuccess: async () => {
      setAnswerDrafts({});
      await invalidateWorld();
    },
  });

  const consistencyMutation = useMutation({
    mutationFn: () =>
      checkWorldConsistency(id, {
        provider: llm.provider,
        model: llm.model,
      }),
    onSuccess: invalidateWorld,
  });

  const patchIssueMutation = useMutation({
    mutationFn: (payload: { issueId: string; status: "open" | "resolved" | "ignored" }) =>
      patchWorldConsistencyIssue(id, payload.issueId, payload.status),
    onSuccess: invalidateWorld,
  });

  const snapshotCreateMutation = useMutation({
    mutationFn: () => createWorldSnapshot(id, snapshotLabel || undefined),
    onSuccess: async () => {
      setSnapshotLabel("");
      await invalidateWorld();
    },
  });

  const snapshotRestoreMutation = useMutation({
    mutationFn: (snapshotId: string) => restoreWorldSnapshot(id, snapshotId),
    onSuccess: invalidateWorld,
  });

  const snapshotDiffMutation = useMutation({
    mutationFn: () => diffWorldSnapshots(id, diffFrom, diffTo),
  });

  const useLibraryMutation = useMutation({
    mutationFn: (payload: { libraryId: string; targetField: typeof selectedLayerMeta.primaryField }) =>
      useWorldLibraryItem(payload.libraryId, {
        worldId: id,
        targetField: payload.targetField,
      }),
    onSuccess: invalidateWorld,
  });

  const publishLibraryMutation = useMutation({
    mutationFn: () =>
      createWorldLibraryItem({
        name: publishName.trim() || `${world?.name ?? "world"}-${selectedLayerMeta.key}`,
        description:
          publishDescription.trim()
          || (world?.[selectedLayerMeta.primaryField] ?? "")?.slice(0, 240)
          || "world setting item",
        category: publishCategory,
        worldType: world?.worldType ?? undefined,
        sourceWorldId: id,
      }),
    onSuccess: async () => {
      setPublishName("");
      setPublishDescription("");
      await queryClient.invalidateQueries({
        queryKey: queryKeys.worlds.library(
          `${worldDetailQuery.data?.data?.worldType ?? "all"}-${libraryCategory}-${libraryKeyword}`,
        ),
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: () =>
      importWorldData({
        format: importFormat,
        content: importContent,
        provider: llm.provider,
        model: llm.model,
      }),
    onSuccess: async (response) => {
      setImportContent("");
      if (response.data?.id) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.worlds.all });
      }
    },
  });

  const refineSSE = useSSE({
    onDone: invalidateWorld,
  });

  const layerStates = useMemo(() => {
    try {
      return JSON.parse(world?.layerStates ?? "{}") as Record<string, { status: string; updatedAt: string }>;
    } catch {
      return {};
    }
  }, [world?.layerStates]);

  const isInitialLayerGeneration = useMemo(
    () => LAYERS.every((layer) => (layerStates[layer.key]?.status ?? "pending") === "pending"),
    [layerStates],
  );

  const visibleDeepeningQuestions = useMemo(() => {
    const list = world?.deepeningQA ?? [];
    const actionable = list.filter((question) => question.status !== "integrated");
    return (actionable.length > 0 ? actionable : list).slice(0, 3);
  }, [world?.deepeningQA]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            世界工作台：{world?.name ?? "加载中..."} {world?.version ? `(v${world.version})` : ""}
          </CardTitle>
          <LLMSelector />
        </CardHeader>
      </Card>

      {id ? (
        <Card>
          <CardHeader>
            <CardTitle>Reference Knowledge</CardTitle>
          </CardHeader>
          <CardContent>
            <KnowledgeBindingPanel targetType="world" targetId={id} title="World knowledge bindings" />
          </CardContent>
        </Card>
      ) : null}

      <Tabs defaultValue="layers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="layers">分层构建</TabsTrigger>
          <TabsTrigger value="deepening">问答深化</TabsTrigger>
          <TabsTrigger value="consistency">一致性</TabsTrigger>
          <TabsTrigger value="overview">总览{featureFlags.worldVisEnabled ? "可视化" : ""}</TabsTrigger>
          <TabsTrigger value="assets">素材/版本/导入导出</TabsTrigger>
        </TabsList>

        <TabsContent value="layers">
          <Card>
            <CardHeader>
              <CardTitle>分层构建器</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                <Button
                  onClick={() => generateAllLayersMutation.mutate()}
                  disabled={generateAllLayersMutation.isPending || !world}
                >
                  {generateAllLayersMutation.isPending
                    ? "六层生成中..."
                    : isInitialLayerGeneration
                      ? "首次 AI 生成六层"
                      : "一键重建六层"}
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
                    : (pickLayerFieldText(layer.key, worldRecord)
                      || normalizeLayerText(world?.[layer.primaryField] ?? ""));
                  const layerStatus = layerStates[layer.key]?.status ?? "pending";
                  const layerStatusLabel = LAYER_STATUS_LABELS[layerStatus] ?? layerStatus;
                  const isGeneratingCurrentLayer =
                    generateLayerMutation.isPending && generateLayerMutation.variables === layer.key;
                  const isSavingCurrentLayer =
                    saveLayerMutation.isPending && saveLayerMutation.variables?.layerKey === layer.key;
                  const isConfirmingCurrentLayer =
                    confirmLayerMutation.isPending && confirmLayerMutation.variables === layer.key;

                  return (
                    <div key={layer.key} className="rounded-md border p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">{layer.label}</div>
                        <div className="text-xs text-muted-foreground">状态：{layerStatusLabel}</div>
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
                              generateAllLayersMutation.mutate();
                              return;
                            }
                            generateLayerMutation.mutate(layer.key);
                          }}
                          disabled={generateAllLayersMutation.isPending || generateLayerMutation.isPending || !world}
                        >
                          {isInitialLayerGeneration
                            ? generateAllLayersMutation.isPending
                              ? "六层生成中..."
                              : "首次 AI 生成六层"
                            : isGeneratingCurrentLayer
                              ? "重写中..."
                              : "AI 重写本层"}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => saveLayerMutation.mutate({ layerKey: layer.key, content: layerValue })}
                          disabled={
                            saveLayerMutation.isPending
                            || generateAllLayersMutation.isPending
                            || !layerValue.trim()
                          }
                        >
                          {isSavingCurrentLayer ? "保存中..." : "手动保存本层"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => confirmLayerMutation.mutate(layer.key)}
                          disabled={confirmLayerMutation.isPending || generateAllLayersMutation.isPending}
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
                  <Button
                    onClick={() =>
                      void refineSSE.start(`/worlds/${id}/refine`, {
                        attribute: refineAttribute,
                        currentValue: (world?.[refineAttribute] ?? "") || "N/A",
                        refinementLevel: refineLevel,
                        mode: refineMode,
                        alternativesCount: 3,
                        provider: llm.provider,
                        model: llm.model,
                      })
                    }
                    disabled={refineSSE.isStreaming}
                  >
                    {refineSSE.isStreaming ? "精炼中..." : "开始精炼"}
                  </Button>
                </div>
                <StreamOutput content={refineSSE.content} isStreaming={refineSSE.isStreaming} onAbort={refineSSE.abort} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deepening">
          <Card>
            <CardHeader>
              <CardTitle>Deepening Q&A</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={() => deepeningQuestionMutation.mutate()} disabled={deepeningQuestionMutation.isPending}>
                {deepeningQuestionMutation.isPending ? "生成中..." : "生成深化问题"}
              </Button>
              {visibleDeepeningQuestions.map((question) => {
                const quickOptions = (question.quickOptions ?? llmQuickOptions[question.id] ?? [])
                  .map((option) => option.trim())
                  .filter(Boolean)
                  .slice(0, 4);
                return (
                  <div key={question.id} className="rounded-md border p-3 space-y-2">
                    <div className="text-sm font-medium">
                      [{question.priority}] {question.question}
                    </div>
                    {quickOptions.length > 0 ? (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">快捷选项（由模型返回，可一键填入）</div>
                        <div className="flex flex-wrap gap-2">
                          {quickOptions.map((option) => (
                            <Button
                              key={`${question.id}-${option}`}
                              size="sm"
                              variant={answerDrafts[question.id] === option ? "default" : "outline"}
                              className="h-auto whitespace-normal text-left"
                              onClick={() =>
                                setAnswerDrafts((prev) => ({ ...prev, [question.id]: option }))
                              }
                            >
                              {option}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        当前问题未返回快捷选项，请直接填写回答。
                      </div>
                    )}
                    <textarea
                      className="min-h-[100px] w-full rounded-md border bg-background p-2 text-sm"
                      value={answerDrafts[question.id] ?? ""}
                      onChange={(event) =>
                        setAnswerDrafts((prev) => ({ ...prev, [question.id]: event.target.value }))
                      }
                      placeholder="填写你的回答"
                    />
                    <div className="text-xs text-muted-foreground">
                      target: {question.targetLayer ?? "-"} / {question.targetField ?? "-"} / status:{" "}
                      {question.status}
                    </div>
                  </div>
                );
              })}
              <Button
                onClick={() => deepeningAnswerMutation.mutate()}
                disabled={
                  deepeningAnswerMutation.isPending
                  || Object.keys(answerDrafts).length === 0
                  || visibleDeepeningQuestions.length === 0
                }
              >
                {deepeningAnswerMutation.isPending ? "整合中..." : "提交并整合回答"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="consistency">
          <Card>
            <CardHeader>
              <CardTitle>Consistency Check</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={() => consistencyMutation.mutate()} disabled={consistencyMutation.isPending}>
                {consistencyMutation.isPending ? "检查中..." : "运行一致性检查"}
              </Button>
              <div className="text-sm text-muted-foreground">
                {world?.consistencyReport
                  ? `report: ${world.consistencyReport}`
                  : "暂无一致性报告"}
              </div>
              {(world?.consistencyIssues ?? []).map((issue) => (
                <div key={issue.id} className="rounded-md border p-3 space-y-2">
                  <div className="font-medium">
                    [{issue.severity}] {issue.code}
                  </div>
                  <div className="text-sm">{issue.message}</div>
                  <div className="text-xs text-muted-foreground">{issue.detail ?? "-"}</div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => patchIssueMutation.mutate({ issueId: issue.id, status: "resolved" })}
                    >
                      Resolve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => patchIssueMutation.mutate({ issueId: issue.id, status: "ignored" })}
                    >
                      Ignore
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>{featureFlags.worldVisEnabled ? "Overview + Visualization" : "Overview"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium mb-1">Summary</div>
                <div>{overviewQuery.data?.data?.summary ?? "N/A"}</div>
              </div>
              {(overviewQuery.data?.data?.sections ?? []).map((section) => (
                <div key={section.key} className="rounded-md border p-3 text-sm">
                  <div className="font-medium mb-1">{section.title}</div>
                  <div className="whitespace-pre-wrap">{section.content}</div>
                </div>
              ))}
              {featureFlags.worldVisEnabled ? (
                <WorldVisualizationBoard payload={visualizationQuery.data?.data} />
              ) : (
                <div className="rounded-md border p-3 text-sm text-muted-foreground">
                  可视化功能已关闭（`VITE_WORLD_VIS_ENABLED=false`）。
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assets">
          <Card>
            <CardHeader>
              <CardTitle>Library + Snapshots + Import/Export</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border p-3 space-y-2">
                <div className="font-medium">Library</div>
                <div className="grid gap-2 md:grid-cols-3">
                  <Input
                    placeholder="keyword"
                    value={libraryKeyword}
                    onChange={(event) => setLibraryKeyword(event.target.value)}
                  />
                  <select
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={libraryCategory}
                    onChange={(event) => setLibraryCategory(event.target.value)}
                  >
                    <option value="all">all categories</option>
                    <option value="terrain">terrain</option>
                    <option value="race">race</option>
                    <option value="power_system">power_system</option>
                    <option value="organization">organization</option>
                    <option value="resource">resource</option>
                    <option value="event">event</option>
                    <option value="artifact">artifact</option>
                    <option value="custom">custom</option>
                  </select>
                  <Button
                    variant="outline"
                    onClick={() =>
                      queryClient.invalidateQueries({
                        queryKey: queryKeys.worlds.library(
                          `${worldDetailQuery.data?.data?.worldType ?? "all"}-${libraryCategory}-${libraryKeyword}`,
                        ),
                      })
                    }
                  >
                    Refresh
                  </Button>
                </div>
                <div className="rounded-md border p-2 space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground">
                    Publish current setting to library
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <Input
                      placeholder="item name"
                      value={publishName}
                      onChange={(event) => setPublishName(event.target.value)}
                    />
                    <select
                      className="w-full rounded-md border bg-background p-2 text-sm"
                      value={publishCategory}
                      onChange={(event) => setPublishCategory(event.target.value)}
                    >
                      <option value="custom">custom</option>
                      <option value="terrain">terrain</option>
                      <option value="race">race</option>
                      <option value="power_system">power_system</option>
                      <option value="organization">organization</option>
                      <option value="resource">resource</option>
                      <option value="event">event</option>
                      <option value="artifact">artifact</option>
                    </select>
                    <Button
                      onClick={() => publishLibraryMutation.mutate()}
                      disabled={publishLibraryMutation.isPending}
                    >
                      {publishLibraryMutation.isPending ? "Publishing..." : "Publish"}
                    </Button>
                  </div>
                  <textarea
                    className="min-h-[80px] w-full rounded-md border bg-background p-2 text-sm"
                    value={publishDescription}
                    onChange={(event) => setPublishDescription(event.target.value)}
                    placeholder="optional description (default uses current layer content)"
                  />
                </div>
                {(libraryQuery.data?.data ?? []).map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
                    <div>
                      <div>{item.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.category} / use={item.usageCount}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() =>
                        useLibraryMutation.mutate({
                          libraryId: item.id,
                          targetField: selectedLayerMeta.primaryField,
                        })
                      }
                    >
                      Inject
                    </Button>
                  </div>
                ))}
              </div>

              <div className="rounded-md border p-3 space-y-2">
                <div className="font-medium">Snapshots</div>
                <div className="flex gap-2">
                  <Input
                    placeholder="snapshot label (optional)"
                    value={snapshotLabel}
                    onChange={(event) => setSnapshotLabel(event.target.value)}
                  />
                  <Button onClick={() => snapshotCreateMutation.mutate()} disabled={snapshotCreateMutation.isPending}>
                    Create Snapshot
                  </Button>
                </div>
                {(snapshotQuery.data?.data ?? []).map((snapshot) => (
                  <div key={snapshot.id} className="flex items-center justify-between rounded border p-2 text-sm">
                    <div>
                      {snapshot.label ?? snapshot.id.slice(0, 8)} / {new Date(snapshot.createdAt).toLocaleString()}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => snapshotRestoreMutation.mutate(snapshot.id)}
                    >
                      Restore
                    </Button>
                  </div>
                ))}
                <div className="grid gap-2 md:grid-cols-3">
                  <select
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={diffFrom}
                    onChange={(event) => setDiffFrom(event.target.value)}
                  >
                    <option value="">from snapshot</option>
                    {(snapshotQuery.data?.data ?? []).map((snapshot) => (
                      <option key={`from-${snapshot.id}`} value={snapshot.id}>
                        {snapshot.label ?? snapshot.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="w-full rounded-md border bg-background p-2 text-sm"
                    value={diffTo}
                    onChange={(event) => setDiffTo(event.target.value)}
                  >
                    <option value="">to snapshot</option>
                    {(snapshotQuery.data?.data ?? []).map((snapshot) => (
                      <option key={`to-${snapshot.id}`} value={snapshot.id}>
                        {snapshot.label ?? snapshot.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                  <Button onClick={() => snapshotDiffMutation.mutate()} disabled={!diffFrom || !diffTo}>
                    Diff
                  </Button>
                </div>
                {snapshotDiffMutation.data?.data?.changes?.map((change) => (
                  <div key={change.field} className="rounded border p-2 text-xs">
                    {change.field}: {change.before ?? "null"} {"->"} {change.after ?? "null"}
                  </div>
                ))}
              </div>

              <div className="rounded-md border p-3 space-y-2">
                <div className="font-medium">Export</div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      const response = await exportWorldData(id, "markdown");
                      if (response.data?.content) {
                        await navigator.clipboard.writeText(response.data.content);
                      }
                    }}
                  >
                    Export Markdown (Copy)
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      const response = await exportWorldData(id, "json");
                      if (response.data?.content) {
                        await navigator.clipboard.writeText(response.data.content);
                      }
                    }}
                  >
                    Export JSON (Copy)
                  </Button>
                </div>
              </div>

              <div className="rounded-md border p-3 space-y-2">
                <div className="font-medium">Import</div>
                <select
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  value={importFormat}
                  onChange={(event) => setImportFormat(event.target.value as "json" | "markdown" | "text")}
                >
                  <option value="text">text</option>
                  <option value="markdown">markdown</option>
                  <option value="json">json</option>
                </select>
                <textarea
                  className="min-h-[160px] w-full rounded-md border bg-background p-2 text-sm"
                  value={importContent}
                  onChange={(event) => setImportContent(event.target.value)}
                  placeholder="paste import content here"
                />
                <Button
                  onClick={() => importMutation.mutate()}
                  disabled={importMutation.isPending || !importContent.trim()}
                >
                  {importMutation.isPending ? "导入中..." : "导入为新世界"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
