import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreativeHubResourceBinding } from "@ai-novel/shared/types/creativeHub";
import type { LangChainMessage } from "@assistant-ui/react-langgraph";
import { useSearchParams } from "react-router-dom";
import {
  createCreativeHubThread,
  deleteCreativeHubThread,
  getCreativeHubThreadHistory,
  getCreativeHubThreadState,
  listCreativeHubThreads,
  resolveCreativeHubInterrupt,
  updateCreativeHubThread,
} from "@/api/creativeHub";
import { getNovelList } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { useLLMStore } from "@/store/llmStore";
import { Badge } from "@/components/ui/badge";
import CreativeHubConversation from "./components/CreativeHubConversation";
import CreativeHubSidebar from "./components/CreativeHubSidebar";
import CreativeHubThreadList from "./components/CreativeHubThreadList";
import { hasCreativeHubBindings } from "@/lib/creativeHubLinks";
import { useCreativeHubRuntime } from "./hooks/useCreativeHubRuntime";

function buildBindingsFromSearch(searchParams: URLSearchParams): CreativeHubResourceBinding {
  const knowledgeIds = searchParams.getAll("knowledgeDocumentId").map((item) => item.trim()).filter(Boolean);
  return {
    novelId: searchParams.get("novelId")?.trim() || null,
    chapterId: searchParams.get("chapterId")?.trim() || null,
    worldId: searchParams.get("worldId")?.trim() || null,
    taskId: searchParams.get("taskId")?.trim() || null,
    bookAnalysisId: searchParams.get("bookAnalysisId")?.trim() || null,
    formulaId: searchParams.get("formulaId")?.trim() || null,
    baseCharacterId: searchParams.get("baseCharacterId")?.trim() || null,
    knowledgeDocumentIds: knowledgeIds,
  };
}

function applyBindingsToSearchParams(searchParams: URLSearchParams, bindings: CreativeHubResourceBinding) {
  const next = new URLSearchParams(searchParams);
  const singleValueKeys = [
    "novelId",
    "chapterId",
    "worldId",
    "taskId",
    "bookAnalysisId",
    "formulaId",
    "baseCharacterId",
  ] as const;

  for (const key of singleValueKeys) {
    const value = bindings[key];
    if (typeof value === "string" && value.trim()) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
  }

  next.delete("knowledgeDocumentId");
  for (const knowledgeId of bindings.knowledgeDocumentIds ?? []) {
    if (knowledgeId.trim()) {
      next.append("knowledgeDocumentId", knowledgeId);
    }
  }

  return next;
}

function sameBindings(a: CreativeHubResourceBinding, b: CreativeHubResourceBinding): boolean {
  const normalizeList = (value?: string[]) => (value ?? []).filter(Boolean).slice().sort();
  return (a.novelId ?? null) === (b.novelId ?? null)
    && (a.chapterId ?? null) === (b.chapterId ?? null)
    && (a.worldId ?? null) === (b.worldId ?? null)
    && (a.taskId ?? null) === (b.taskId ?? null)
    && (a.bookAnalysisId ?? null) === (b.bookAnalysisId ?? null)
    && (a.formulaId ?? null) === (b.formulaId ?? null)
    && (a.baseCharacterId ?? null) === (b.baseCharacterId ?? null)
    && JSON.stringify(normalizeList(a.knowledgeDocumentIds)) === JSON.stringify(normalizeList(b.knowledgeDocumentIds));
}

export default function CreativeHubPage() {
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeThreadId, setActiveThreadId] = useState(searchParams.get("threadId")?.trim() ?? "");
  const [approvalNote, setApprovalNote] = useState("");

  const initialBindings = useMemo(
    () => buildBindingsFromSearch(searchParams),
    [searchParams],
  );
  const shouldCreateBoundThread = useMemo(
    () => !searchParams.get("threadId") && hasCreativeHubBindings(initialBindings),
    [initialBindings, searchParams],
  );

  const threadsQuery = useQuery({
    queryKey: queryKeys.creativeHub.threads,
    queryFn: listCreativeHubThreads,
    staleTime: 30_000,
  });
  const threads = threadsQuery.data?.data ?? [];
  const novelsQuery = useQuery({
    queryKey: queryKeys.novels.list(1, 100),
    queryFn: () => getNovelList({ page: 1, limit: 100 }),
    staleTime: 60_000,
  });
  const novels = (novelsQuery.data?.data?.items ?? []).map((item) => ({
    id: item.id,
    title: item.title,
  }));

  const createThreadMutation = useMutation({
    mutationFn: createCreativeHubThread,
    onSuccess: async (response, variables) => {
      const threadId = response.data?.id;
      await queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.threads });
      if (threadId) {
        setActiveThreadId(threadId);
        setSearchParams((prev) => {
          const next = applyBindingsToSearchParams(prev, variables?.resourceBindings ?? {});
          next.set("threadId", threadId);
          return next;
        }, { replace: true });
      }
    },
  });

  useEffect(() => {
    if (activeThreadId) return;
    if (threads.length > 0) {
      const matchedThread = shouldCreateBoundThread
        ? threads.find((thread) => sameBindings(thread.resourceBindings, initialBindings))
        : null;
      const nextThread = matchedThread ?? threads[0];
      setActiveThreadId(nextThread.id);
      setSearchParams((prev) => {
        const next = applyBindingsToSearchParams(prev, nextThread.resourceBindings);
        next.set("threadId", nextThread.id);
        return next;
      }, { replace: true });
      return;
    }
    if (shouldCreateBoundThread && !createThreadMutation.isPending) {
      createThreadMutation.mutate({
        title: "新对话",
        resourceBindings: initialBindings,
      });
      return;
    }
    if (!threadsQuery.isLoading && !createThreadMutation.isPending) {
      createThreadMutation.mutate({
        title: "新对话",
        resourceBindings: initialBindings,
      });
    }
  }, [activeThreadId, createThreadMutation, initialBindings, shouldCreateBoundThread, threads, threadsQuery.isLoading]);

  const stateQuery = useQuery({
    queryKey: queryKeys.creativeHub.state(activeThreadId || "none"),
    queryFn: () => getCreativeHubThreadState(activeThreadId),
    enabled: Boolean(activeThreadId),
  });

  const historyQuery = useQuery({
    queryKey: queryKeys.creativeHub.history(activeThreadId || "none"),
    queryFn: () => getCreativeHubThreadHistory(activeThreadId),
    enabled: Boolean(activeThreadId),
  });

  const rawThreadBindings = stateQuery.data?.data?.thread.resourceBindings ?? initialBindings;
  const currentThread = stateQuery.data?.data?.thread ?? threads.find((item) => item.id === activeThreadId);
  const productionStatus = stateQuery.data?.data?.metadata?.productionStatus ?? null;
  const currentBindings = useMemo<CreativeHubResourceBinding>(() => ({
    ...rawThreadBindings,
    worldId: rawThreadBindings.worldId ?? productionStatus?.worldId ?? null,
  }), [productionStatus?.worldId, rawThreadBindings]);

  const loadThread = useCallback(async (threadId: string) => {
    const response = await getCreativeHubThreadState(threadId);
    const state = response.data;
    return {
      messages: (state?.messages ?? []) as unknown as LangChainMessage[],
      interrupts: state?.interrupts ?? [],
      checkpointId: state?.currentCheckpointId ?? null,
    };
  }, []);

  const resolveCheckpointId = useCallback(async (threadId: string, parentMessages: unknown[]) => {
    const response = await getCreativeHubThreadHistory(threadId);
    const history = response.data ?? [];
    const target = JSON.stringify(parentMessages);
    const matched = history.find((item) => JSON.stringify(item.messages) === target);
    return matched?.checkpointId ?? null;
  }, []);

  const runtimeState = useCreativeHubRuntime({
    threadId: activeThreadId,
    resourceBindings: currentBindings,
    runSettings: {
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
      maxTokens: llm.maxTokens,
    },
    loadThread,
    getCheckpointId: resolveCheckpointId,
    onRefreshState: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.threads });
      void queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.state(activeThreadId || "none") });
      void queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.history(activeThreadId || "none") });
    },
    diagnostics: stateQuery.data?.data?.diagnostics,
  });

  const archiveThread = async (threadId: string, archived: boolean) => {
    await updateCreativeHubThread(threadId, { archived });
    await queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.threads });
  };

  const handleBindingsChange = useCallback(async (patch: Partial<CreativeHubResourceBinding>) => {
    if (!activeThreadId) {
      return;
    }
    const nextBindings: CreativeHubResourceBinding = {
      ...currentBindings,
      ...patch,
    };
    if (patch.novelId !== undefined && !patch.novelId) {
      nextBindings.chapterId = null;
    }
    await updateCreativeHubThread(activeThreadId, { resourceBindings: nextBindings });
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("threadId", activeThreadId);
      if (nextBindings.novelId) {
        next.set("novelId", nextBindings.novelId);
      } else {
        next.delete("novelId");
      }
      if (nextBindings.chapterId) {
        next.set("chapterId", nextBindings.chapterId);
      } else {
        next.delete("chapterId");
      }
      return next;
    }, { replace: true });
    await queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.threads });
    await queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.state(activeThreadId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.history(activeThreadId) });
  }, [activeThreadId, currentBindings, queryClient, setSearchParams]);

  const removeThread = async (threadId: string) => {
    await deleteCreativeHubThread(threadId);
    if (activeThreadId === threadId) {
      setActiveThreadId("");
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.threads });
  };

  const handleResolveInterrupt = async (action: "approve" | "reject") => {
    const interrupt = runtimeState.interrupt;
    if (!activeThreadId || !interrupt?.id) return;
    await resolveCreativeHubInterrupt(activeThreadId, interrupt.id, {
      action,
      note: approvalNote.trim() || undefined,
    });
    setApprovalNote("");
    runtimeState.setInterrupt(undefined);
    await queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.state(activeThreadId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.history(activeThreadId) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.threads });
  };

  const handleQuickAction = useCallback(async (prompt: string) => {
    await runtimeState.sendPrompt(prompt);
  }, [runtimeState]);

  const handleCreateNovelQuickAction = useCallback(async (title: string) => {
    const normalized = title.trim();
    if (!normalized) {
      return;
    }
    await runtimeState.sendPrompt(`创建一本小说《${normalized}》`);
  }, [runtimeState]);

  useEffect(() => {
    if (!activeThreadId || !productionStatus?.worldId || rawThreadBindings.worldId === productionStatus.worldId) {
      return;
    }
    void updateCreativeHubThread(activeThreadId, {
      resourceBindings: {
        ...rawThreadBindings,
        worldId: productionStatus.worldId,
      },
    }).then(async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.threads });
      await queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.state(activeThreadId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.history(activeThreadId) });
    });
  }, [activeThreadId, productionStatus?.worldId, queryClient, rawThreadBindings]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">创作中枢</Badge>
        {currentThread ? <Badge variant="outline">{currentThread.title}</Badge> : null}
        {currentBindings.novelId ? <Badge variant="outline">小说 {currentBindings.novelId}</Badge> : null}
        {currentBindings.worldId ? <Badge variant="outline">世界观 {currentBindings.worldId}</Badge> : null}
        {currentBindings.taskId ? <Badge variant="outline">任务 {currentBindings.taskId}</Badge> : null}
        {currentBindings.bookAnalysisId ? <Badge variant="outline">拆书 {currentBindings.bookAnalysisId}</Badge> : null}
        {currentBindings.formulaId ? <Badge variant="outline">公式 {currentBindings.formulaId}</Badge> : null}
        {currentBindings.baseCharacterId ? <Badge variant="outline">角色 {currentBindings.baseCharacterId}</Badge> : null}
        {currentBindings.knowledgeDocumentIds?.length ? (
          <Badge variant="outline">知识文档 {currentBindings.knowledgeDocumentIds.length} 个</Badge>
        ) : null}
        {stateQuery.data?.data?.currentCheckpointId ? (
          <Badge variant="outline">Checkpoint {stateQuery.data.data.currentCheckpointId.slice(0, 8)}</Badge>
        ) : null}
      </div>

      <div className="grid min-h-[72vh] gap-4 lg:h-[calc(100vh-11rem)] lg:grid-cols-[240px_minmax(0,1fr)_320px]">
        <div className="min-h-0">
          <CreativeHubThreadList
            threads={threads}
            activeThreadId={activeThreadId}
            onSelect={(threadId) => {
              setActiveThreadId(threadId);
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set("threadId", threadId);
                return next;
              }, { replace: true });
            }}
            onCreate={() => {
              createThreadMutation.mutate({
                title: "新对话",
                resourceBindings: {},
              });
            }}
            onArchive={(threadId, archived) => void archiveThread(threadId, archived)}
            onDelete={(threadId) => void removeThread(threadId)}
          />
        </div>

        <div className="min-h-0">
          <CreativeHubConversation
            runtime={runtimeState.runtime}
            onQuickAction={(prompt) => void handleQuickAction(prompt)}
            interrupt={runtimeState.interrupt}
            approvalNote={approvalNote}
            onApprovalNoteChange={setApprovalNote}
            onResolveInterrupt={(action) => void handleResolveInterrupt(action)}
            diagnostics={stateQuery.data?.data?.diagnostics}
          />
        </div>

        <div className="min-h-0">
          <CreativeHubSidebar
            thread={currentThread}
            bindings={currentBindings}
            novels={novels}
            interrupt={runtimeState.interrupt}
            diagnostics={stateQuery.data?.data?.diagnostics}
            productionStatus={productionStatus}
            modelSummary={{
              provider: llm.provider,
              model: llm.model,
              temperature: llm.temperature,
              maxTokens: llm.maxTokens,
            }}
            approvalNote={approvalNote}
            onApprovalNoteChange={setApprovalNote}
            onNovelChange={(novelId) => void handleBindingsChange({ novelId: novelId || null })}
            onResolveInterrupt={(action) => void handleResolveInterrupt(action)}
            onQuickAction={(prompt) => void handleQuickAction(prompt)}
            onCreateNovel={(title) => void handleCreateNovelQuickAction(title)}
            onStartProduction={(prompt) => void handleQuickAction(prompt)}
          />
        </div>
      </div>
    </div>
  );
}
