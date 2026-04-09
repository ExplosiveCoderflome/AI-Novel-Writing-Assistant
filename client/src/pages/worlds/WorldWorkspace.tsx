import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import LLMSelector from "@/components/common/LLMSelector";
import KnowledgeBindingPanel from "@/components/knowledge/KnowledgeBindingPanel";
import {
  answerWorldDeepeningQuestions,
  backfillWorldStructure,
  deleteWorld,
  checkWorldConsistency,
  confirmWorldLayer,
  createWorldLibraryItem,
  createWorldSnapshot,
  diffWorldSnapshots,
  exportWorldData,
  generateAllWorldLayers,
  generateWorldDeepeningQuestions,
  generateWorldLayer,
  generateWorldStructure,
  getWorldDetail,
  getWorldOverview,
  getWorldStructure,
  getWorldVisualization,
  importWorldData,
  listWorldLibrary,
  listWorldSnapshots,
  patchWorldConsistencyIssue,
  restoreWorldSnapshot,
  updateWorldAxioms,
  updateWorldLayer,
  updateWorldStructure,
  useWorldLibraryItem,
} from "@/api/world";
import { queryKeys } from "@/api/queryKeys";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
import { useSSE } from "@/hooks/useSSE";
import { featureFlags } from "@/config/featureFlags";
import {
  parseConsistencyReport,
} from "./worldConsistencyUi";
import WorldAssetsTab from "./components/workspace/WorldAssetsTab";
import WorldAxiomsCard from "./components/workspace/WorldAxiomsCard";
import WorldConsistencyTab from "./components/workspace/WorldConsistencyTab";
import WorldDeepeningTab from "./components/workspace/WorldDeepeningTab";
import WorldLayersTab from "./components/workspace/WorldLayersTab";
import WorldOverviewTab from "./components/workspace/WorldOverviewTab";
import WorldStructureTab from "./components/workspace/WorldStructureTab";
import {
  LAYERS,
  parseLayerStates,
  type LayerKey,
  type RefineAttribute,
} from "./components/workspace/worldWorkspaceShared";

export default function WorldWorkspace() {
  const navigate = useNavigate();
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
  const structureQuery = useQuery({
    queryKey: queryKeys.worlds.structure(id),
    queryFn: () => getWorldStructure(id),
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
  const consistencyIssues = useMemo(() => world?.consistencyIssues ?? [], [world?.consistencyIssues]);
  const consistencyReport = useMemo(
    () => parseConsistencyReport(world?.consistencyReport, consistencyIssues),
    [consistencyIssues, world?.consistencyReport],
  );
  const selectedLayerMeta = useMemo(
    () => LAYERS.find((item) => item.key === selectedLayer) ?? LAYERS[0],
    [selectedLayer],
  );
  const layerStates = useMemo(() => parseLayerStates(world?.layerStates), [world?.layerStates]);
  const isInitialLayerGeneration = useMemo(
    () => LAYERS.every((layer) => (layerStates[layer.key]?.status ?? "pending") === "pending"),
    [layerStates],
  );
  const visibleDeepeningQuestions = useMemo(() => {
    const list = world?.deepeningQA ?? [];
    const actionable = list.filter((question) => question.status !== "integrated");
    return (actionable.length > 0 ? actionable : list).slice(0, 3);
  }, [world?.deepeningQA]);

  const invalidateWorld = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.worlds.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.worlds.detail(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.worlds.structure(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.worlds.overview(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.worlds.visualization(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.worlds.snapshots(id) }),
    ]);
  };

  const generateLayerMutation = useMutation({
    mutationFn: (layerKey: LayerKey) =>
      generateWorldLayer(id, layerKey, { provider: llm.provider, model: llm.model, temperature: 0.7 }),
    onSuccess: async (response, layerKey) => {
      const generated = response.data?.generated ?? {};
      const text = Object.values(generated).find((item) => typeof item === "string" && item.trim()) ?? "";
      if (typeof text === "string" && text.trim()) {
        setLayerDrafts((prev) => ({ ...prev, [layerKey]: text }));
      }
      await invalidateWorld();
    },
  });
  const generateAllLayersMutation = useMutation({
    mutationFn: () => generateAllWorldLayers(id, { provider: llm.provider, model: llm.model, temperature: 0.7 }),
    onSuccess: invalidateWorld,
  });
  const saveLayerMutation = useMutation({
    mutationFn: (payload: { layerKey: LayerKey; content: string }) => updateWorldLayer(id, payload.layerKey, payload.content),
    onSuccess: invalidateWorld,
  });
  const confirmLayerMutation = useMutation({
    mutationFn: (layerKey: LayerKey) => confirmWorldLayer(id, layerKey),
    onSuccess: invalidateWorld,
  });
  const deepeningQuestionMutation = useMutation({
    mutationFn: () => generateWorldDeepeningQuestions(id, { provider: llm.provider, model: llm.model }),
    onSuccess: async (response) => {
      const nextMap: Record<string, string[]> = {};
      for (const item of response.data ?? []) {
        const options = (item.quickOptions ?? []).map((option) => option.trim()).filter(Boolean).slice(0, 4);
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
    mutationFn: () => checkWorldConsistency(id, { provider: llm.provider, model: llm.model }),
    onSuccess: invalidateWorld,
  });
  const patchIssueMutation = useMutation({
    mutationFn: (payload: { issueId: string; status: "open" | "resolved" | "ignored" }) =>
      patchWorldConsistencyIssue(id, payload.issueId, payload.status),
    onSuccess: invalidateWorld,
  });
  const saveStructureMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateWorldStructure>[1]) => updateWorldStructure(id, payload),
  });
  const saveAxiomsMutation = useMutation({
    mutationFn: (axioms: string[]) => updateWorldAxioms(id, axioms),
    onSuccess: invalidateWorld,
  });
  const backfillStructureMutation = useMutation({
    mutationFn: () => backfillWorldStructure(id, { provider: llm.provider, model: llm.model }),
  });
  const generateStructureMutation = useMutation({
    mutationFn: (payload: Parameters<typeof generateWorldStructure>[1]) => generateWorldStructure(id, payload),
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
  const publishLibraryMutation = useMutation({
    mutationFn: () =>
      createWorldLibraryItem({
        name: publishName.trim() || `${world?.name ?? "world"}-${selectedLayerMeta.key}`,
        description: publishDescription.trim() || (world?.[selectedLayerMeta.primaryField] ?? "")?.slice(0, 240) || "world setting item",
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
    mutationFn: () => importWorldData({ format: importFormat, content: importContent, provider: llm.provider, model: llm.model }),
    onSuccess: async () => {
      setImportContent("");
      await invalidateWorld();
    },
  });
  const deleteWorldMutation = useMutation({
    mutationFn: (worldId: string) => deleteWorld(worldId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.worlds.all });
      toast.success("世界观已删除。");
      navigate("/worlds", { replace: true });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "删除世界观失败。");
    },
  });

  const refineSSE = useSSE({ onDone: invalidateWorld });

  const handleExport = async (format: "markdown" | "json") => {
    const response = await exportWorldData(id, format);
    if (response.data?.content) {
      await navigator.clipboard.writeText(response.data.content);
    }
  };

  const handleDelete = () => {
    if (!id || !world) {
      return;
    }
    const confirmed = window.confirm(`确认删除世界观「${world.name}」？此操作不可恢复。`);
    if (!confirmed) {
      return;
    }
    deleteWorldMutation.mutate(id);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>世界工作台：{world?.name ?? "加载中..."} {world?.version ? `(v${world.version})` : ""}</CardTitle>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <LLMSelector />
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={!id || !world || deleteWorldMutation.isPending}
            >
              {deleteWorldMutation.isPending ? "删除中..." : "删除世界观"}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {id ? (
        <Card>
          <CardHeader>
            <CardTitle>参考资料</CardTitle>
          </CardHeader>
          <CardContent>
            <KnowledgeBindingPanel targetType="world" targetId={id} title="已绑定的参考资料" />
          </CardContent>
        </Card>
      ) : null}

      {id ? (
        <WorldAxiomsCard
          rawAxioms={world?.axioms}
          savePending={saveAxiomsMutation.isPending}
          onSave={(axioms) => saveAxiomsMutation.mutate(axioms)}
        />
      ) : null}

      <Tabs defaultValue="layers" className="space-y-4">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="structure">结构化设定</TabsTrigger>
          <TabsTrigger value="layers">分层构建</TabsTrigger>
          <TabsTrigger value="deepening">问答深化</TabsTrigger>
          <TabsTrigger value="consistency">一致性</TabsTrigger>
          <TabsTrigger value="overview">总览{featureFlags.worldVisEnabled ? "/可视化" : ""}</TabsTrigger>
          <TabsTrigger value="assets">素材/版本/导入导出</TabsTrigger>
        </TabsList>

        <TabsContent value="structure">
          <WorldStructureTab
            initialPayload={structureQuery.data?.data}
            savePending={saveStructureMutation.isPending}
            backfillPending={backfillStructureMutation.isPending}
            generatePending={generateStructureMutation.isPending}
            onSave={async (structure, bindingSupport) => {
              await saveStructureMutation.mutateAsync({ structure, bindingSupport });
              await invalidateWorld();
            }}
            onBackfill={async () => {
              const response = await backfillStructureMutation.mutateAsync();
              await invalidateWorld();
              return response.data
                ? { structure: response.data.structure, bindingSupport: response.data.bindingSupport }
                : undefined;
            }}
            onGenerate={async (section, structure, bindingSupport) => {
              const response = await generateStructureMutation.mutateAsync({
                section,
                structure,
                bindingSupport,
                provider: llm.provider,
                model: llm.model,
              });
              return response.data
                ? { structure: response.data.structure, bindingSupport: response.data.bindingSupport }
                : undefined;
            }}
          />
        </TabsContent>

        <TabsContent value="layers">
          <WorldLayersTab
            world={world}
            selectedLayer={selectedLayer}
            setSelectedLayer={setSelectedLayer}
            layerDrafts={layerDrafts}
            setLayerDrafts={setLayerDrafts}
            layerStates={layerStates}
            isInitialLayerGeneration={isInitialLayerGeneration}
            generateAllPending={generateAllLayersMutation.isPending}
            generateLayerPending={generateLayerMutation.isPending}
            generateLayerVariable={generateLayerMutation.variables}
            saveLayerPending={saveLayerMutation.isPending}
            saveLayerVariable={saveLayerMutation.variables}
            confirmLayerPending={confirmLayerMutation.isPending}
            confirmLayerVariable={confirmLayerMutation.variables}
            onGenerateAll={() => generateAllLayersMutation.mutate()}
            onGenerateLayer={(layerKey) => generateLayerMutation.mutate(layerKey)}
            onSaveLayer={(payload) => saveLayerMutation.mutate(payload)}
            onConfirmLayer={(layerKey) => confirmLayerMutation.mutate(layerKey)}
            refineAttribute={refineAttribute}
            setRefineAttribute={setRefineAttribute}
            refineMode={refineMode}
            setRefineMode={setRefineMode}
            refineLevel={refineLevel}
            setRefineLevel={setRefineLevel}
            onStartRefine={() =>
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
            refineStreaming={refineSSE.isStreaming}
            refineContent={refineSSE.content}
            onAbortRefine={refineSSE.abort}
          />
        </TabsContent>

        <TabsContent value="deepening">
          <WorldDeepeningTab
            questions={visibleDeepeningQuestions}
            answerDrafts={answerDrafts}
            setAnswerDrafts={setAnswerDrafts}
            llmQuickOptions={llmQuickOptions}
            generatePending={deepeningQuestionMutation.isPending}
            submitPending={deepeningAnswerMutation.isPending}
            onGenerate={() => deepeningQuestionMutation.mutate()}
            onSubmit={() => deepeningAnswerMutation.mutate()}
          />
        </TabsContent>

        <TabsContent value="consistency">
          <WorldConsistencyTab
            report={consistencyReport}
            issues={consistencyIssues}
            checkPending={consistencyMutation.isPending}
            onCheck={() => consistencyMutation.mutate()}
            onPatchIssue={(payload) => patchIssueMutation.mutate(payload)}
          />
        </TabsContent>

        <TabsContent value="overview">
          <WorldOverviewTab
            summary={overviewQuery.data?.data?.summary}
            sections={overviewQuery.data?.data?.sections ?? []}
            visualization={visualizationQuery.data?.data}
          />
        </TabsContent>

        <TabsContent value="assets">
          <WorldAssetsTab
            worldId={id}
            world={world}
            selectedLayerPrimaryField={selectedLayerMeta.primaryField}
            libraryKeyword={libraryKeyword}
            setLibraryKeyword={setLibraryKeyword}
            libraryCategory={libraryCategory}
            setLibraryCategory={setLibraryCategory}
            publishName={publishName}
            setPublishName={setPublishName}
            publishCategory={publishCategory}
            setPublishCategory={setPublishCategory}
            publishDescription={publishDescription}
            setPublishDescription={setPublishDescription}
            snapshotLabel={snapshotLabel}
            setSnapshotLabel={setSnapshotLabel}
            diffFrom={diffFrom}
            setDiffFrom={setDiffFrom}
            diffTo={diffTo}
            setDiffTo={setDiffTo}
            importFormat={importFormat}
            setImportFormat={setImportFormat}
            importContent={importContent}
            setImportContent={setImportContent}
            libraryItems={libraryQuery.data?.data ?? []}
            snapshots={snapshotQuery.data?.data ?? []}
            diffChanges={snapshotDiffMutation.data?.data?.changes ?? []}
            createSnapshotPending={snapshotCreateMutation.isPending}
            publishPending={publishLibraryMutation.isPending}
            importPending={importMutation.isPending}
            onRefreshLibrary={() =>
              void queryClient.invalidateQueries({
                queryKey: queryKeys.worlds.library(
                  `${worldDetailQuery.data?.data?.worldType ?? "all"}-${libraryCategory}-${libraryKeyword}`,
                ),
              })
            }
            onInjectLibraryField={(libraryId) =>
              void useWorldLibraryItem(libraryId, { worldId: id, targetField: selectedLayerMeta.primaryField }).then(
                () => invalidateWorld(),
              )
            }
            onInjectLibraryStructure={(libraryId, targetCollection) =>
              void useWorldLibraryItem(libraryId, { worldId: id, targetCollection }).then(() => invalidateWorld())
            }
            onPublishLibrary={() => publishLibraryMutation.mutate()}
            onCreateSnapshot={() => snapshotCreateMutation.mutate()}
            onRestoreSnapshot={(snapshotId) => snapshotRestoreMutation.mutate(snapshotId)}
            onDiffSnapshots={() => snapshotDiffMutation.mutate()}
            onExport={handleExport}
            onImport={() => importMutation.mutate()}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
