import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { CreativeHubResourceBinding, CreativeHubThread } from "@ai-novel/shared/types/creativeHub";
import type { LangChainMessage } from "@assistant-ui/react-langgraph";
import { useSearchParams } from "react-router-dom";
import { MessagesSquare, RefreshCw } from "lucide-react";
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
import {
  WorkspaceHeader,
  WorkspaceNextAction,
  WorkspaceStateNotice,
} from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useLLMStore } from "@/store/llmStore";
import { hasCreativeHubBindings } from "@/lib/creativeHubLinks";
import CreativeHubConversation from "./components/CreativeHubConversation";
import CreativeHubSidebar from "./components/CreativeHubSidebar";
import CreativeHubThreadList from "./components/CreativeHubThreadList";
import { useCreativeHubRuntime } from "./hooks/useCreativeHubRuntime";
import {
  applyCreativeHubBindingPatch,
  applyCreativeHubBindingsToSearch,
  buildCreativeHubAutoCreateKey,
  buildCreativeHubBindingsFromSearch,
  findCreativeHubInitialThread,
} from "./routing/creativeHubRouteBindings";
import { resolveCreativeHubWorkspacePresentation } from "./presentation/creativeHubWorkspaceViewModel";

const RUNTIME_DETAILS_COLLAPSED_STORAGE_KEY = "creative-hub.runtime-details-collapsed";
const DEFAULT_THREAD_TITLE = "\u65b0\u5bf9\u8bdd";
const pendingAutoCreateThreadKeys = new Set<string>();

export default function CreativeHubPage() {
  const llm = useLLMStore();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedThreadId = searchParams.get("threadId")?.trim() ?? "";
  const activeThreadId = requestedThreadId;
  const activeThreadIdRef = useRef(activeThreadId);
  const previousActiveThreadIdRef = useRef(activeThreadId);
  const activeThreadSessionRef = useRef(0);
  const createOriginThreadIdRef = useRef(activeThreadId);
  const createOriginSessionRef = useRef(0);
  const currentLocationKeyRef = useRef(searchParams.toString());
  const createOriginLocationKeyRef = useRef(searchParams.toString());
  const activeInterruptIdRef = useRef<string | null>(null);
  const createThreadInFlightRef = useRef(false);
  const threadActionInFlightRef = useRef(false);
  const bindingInFlightRef = useRef(false);
  const approvalInFlightRef = useRef(false);
  if (previousActiveThreadIdRef.current !== activeThreadId) {
    previousActiveThreadIdRef.current = activeThreadId;
    activeThreadSessionRef.current += 1;
  }
  activeThreadIdRef.current = activeThreadId;
  currentLocationKeyRef.current = searchParams.toString();
  const [approvalNote, setApprovalNote] = useState("");
  const [threadActionPendingId, setThreadActionPendingId] = useState("");
  const [bindingPending, setBindingPending] = useState(false);
  const [approvalPending, setApprovalPending] = useState(false);
  const [defaultRuntimeDetailsCollapsed, setDefaultRuntimeDetailsCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return window.localStorage.getItem(RUNTIME_DETAILS_COLLAPSED_STORAGE_KEY) !== "expanded";
  });

  const initialBindings = useMemo(
    () => buildCreativeHubBindingsFromSearch(searchParams),
    [searchParams],
  );
  const shouldCreateBoundThread = useMemo(
    () => !searchParams.get("threadId") && hasCreativeHubBindings(initialBindings),
    [initialBindings, searchParams],
  );
  const autoCreateThreadKey = useMemo(
    () => buildCreativeHubAutoCreateKey(initialBindings, shouldCreateBoundThread),
    [initialBindings, shouldCreateBoundThread],
  );

  const threadsQuery = useQuery({
    queryKey: queryKeys.creativeHub.threads,
    queryFn: listCreativeHubThreads,
    staleTime: 30_000,
  });
  const threads = threadsQuery.data?.data ?? [];
  const initialThread = useMemo(
    () => findCreativeHubInitialThread(threads, initialBindings, shouldCreateBoundThread),
    [initialBindings, shouldCreateBoundThread, threads],
  );
  const novelsQuery = useQuery({
    queryKey: queryKeys.novels.list(1, 100),
    queryFn: () => getNovelList({ page: 1, limit: 100 }),
    staleTime: 60_000,
  });
  const novels = (novelsQuery.data?.data?.items ?? []).map((item) => ({
    id: item.id,
    title: item.title,
  }));

  useEffect(() => {
    setApprovalNote("");
  }, [activeThreadId]);

  const createThreadMutation = useMutation({
    mutationFn: createCreativeHubThread,
    onSuccess: async (response, variables) => {
      const threadId = response.data?.id;
      queryClient.setQueryData<ApiResponse<CreativeHubThread[]>>(queryKeys.creativeHub.threads, (previous) => {
        const createdThread = response.data;
        if (!createdThread) {
          return previous;
        }
        const existingThreads = previous?.data ?? [];
        if (existingThreads.some((thread) => thread.id === createdThread.id)) {
          return previous;
        }
        return previous
          ? { ...previous, data: [createdThread, ...existingThreads] }
          : {
            success: true,
            data: [createdThread],
            message: "Creative Hub thread list updated.",
          };
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.threads });
      if (
        threadId
        && activeThreadIdRef.current === createOriginThreadIdRef.current
        && activeThreadSessionRef.current === createOriginSessionRef.current
        && currentLocationKeyRef.current === createOriginLocationKeyRef.current
      ) {
        setSearchParams((prev) => {
          const next = applyCreativeHubBindingsToSearch(prev, variables?.resourceBindings ?? {});
          next.set("threadId", threadId);
          return next;
        }, { replace: true });
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "创作线程创建失败，请重试。");
    },
  });

  const requestThreadCreation = useCallback(async (
    input: Parameters<typeof createCreativeHubThread>[0],
  ) => {
    if (createThreadInFlightRef.current) {
      return;
    }
    createThreadInFlightRef.current = true;
    createOriginThreadIdRef.current = activeThreadIdRef.current;
    createOriginSessionRef.current = activeThreadSessionRef.current;
    createOriginLocationKeyRef.current = currentLocationKeyRef.current;
    try {
      await createThreadMutation.mutateAsync(input);
    } catch {
      // 失败提示由 mutation 的 onError 统一处理。
    } finally {
      createThreadInFlightRef.current = false;
    }
  }, [createThreadMutation]);

  const autoCreateThread = useCallback(() => {
    if (!threadsQuery.isSuccess) {
      return;
    }
    if (createThreadMutation.isPending || createThreadMutation.isError) {
      return;
    }
    if (pendingAutoCreateThreadKeys.has(autoCreateThreadKey)) {
      return;
    }
    pendingAutoCreateThreadKeys.add(autoCreateThreadKey);
    void requestThreadCreation({
      title: DEFAULT_THREAD_TITLE,
      resourceBindings: shouldCreateBoundThread ? initialBindings : {},
    }).finally(() => {
      pendingAutoCreateThreadKeys.delete(autoCreateThreadKey);
    });
  }, [
    autoCreateThreadKey,
    createThreadMutation,
    initialBindings,
    requestThreadCreation,
    shouldCreateBoundThread,
    threadsQuery.isSuccess,
  ]);

  useEffect(() => {
    if (activeThreadId) return;
    if (!threadsQuery.isSuccess) return;
    if (initialThread) {
      setSearchParams((prev) => {
        const next = applyCreativeHubBindingsToSearch(prev, initialThread.resourceBindings);
        next.set("threadId", initialThread.id);
        return next;
      }, { replace: true });
    }
  }, [activeThreadId, initialThread, setSearchParams, threadsQuery.isSuccess]);

  useEffect(() => {
    if (activeThreadId) return;
    if (!threadsQuery.isSuccess) return;
    if (initialThread) return;
    autoCreateThread();
  }, [activeThreadId, autoCreateThread, initialThread, threadsQuery.isSuccess]);

  const stateQuery = useQuery({
    queryKey: queryKeys.creativeHub.state(activeThreadId || "none"),
    queryFn: () => getCreativeHubThreadState(activeThreadId),
    enabled: Boolean(activeThreadId),
  });

  const rawThreadBindings = stateQuery.data?.data?.thread.resourceBindings ?? initialBindings;
  const currentThread = stateQuery.data?.data?.thread ?? threads.find((item) => item.id === activeThreadId);
  const productionStatus = stateQuery.data?.data?.metadata?.productionStatus ?? null;
  const novelSetup = stateQuery.data?.data?.metadata?.novelSetup ?? null;
  const persistedLatestTurnSummary = stateQuery.data?.data?.metadata?.latestTurnSummary ?? null;
  const currentBindings = useMemo<CreativeHubResourceBinding>(() => ({
    ...rawThreadBindings,
    worldId: rawThreadBindings.worldId ?? productionStatus?.worldId ?? null,
  }), [productionStatus?.worldId, rawThreadBindings]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      RUNTIME_DETAILS_COLLAPSED_STORAGE_KEY,
      defaultRuntimeDetailsCollapsed ? "collapsed" : "expanded",
    );
  }, [defaultRuntimeDetailsCollapsed]);

  const loadThread = useCallback(async (threadId: string) => {
    const response = await queryClient.fetchQuery({
      queryKey: queryKeys.creativeHub.state(threadId),
      queryFn: () => getCreativeHubThreadState(threadId),
    });
    const state = response.data;
    return {
      messages: (state?.messages ?? []) as unknown as LangChainMessage[],
      interrupts: state?.interrupts ?? [],
      checkpointId: state?.currentCheckpointId ?? null,
      latestTurnSummary: state?.metadata?.latestTurnSummary ?? null,
    };
  }, [queryClient]);

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
    defaultRuntimeDetailsCollapsed,
  });
  activeInterruptIdRef.current = runtimeState.interrupt?.id ?? null;

  const latestTurnSummary = runtimeState.latestTurnSummary === undefined
    ? persistedLatestTurnSummary
    : runtimeState.latestTurnSummary;
  const currentCheckpointId = runtimeState.checkpointId ?? stateQuery.data?.data?.currentCheckpointId ?? null;
  const currentNovelTitle = novels.find((novel) => novel.id === currentBindings.novelId)?.title
    ?? productionStatus?.title
    ?? novelSetup?.title
    ?? null;
  const workspacePresentation = useMemo(
    () => resolveCreativeHubWorkspacePresentation({
      thread: currentThread,
      currentNovelTitle,
      interrupt: runtimeState.interrupt,
      isRunning: runtimeState.isRunning,
      diagnostics: stateQuery.data?.data?.diagnostics,
      productionStatus,
      novelSetup,
      latestTurnSummary,
      threadsError: threadsQuery.error,
      stateError: stateQuery.error,
      threadLoadError: runtimeState.threadLoadError,
      novelsError: novelsQuery.error,
      createThreadError: activeThreadId ? null : createThreadMutation.error,
    }),
    [
      currentNovelTitle,
      currentThread,
      activeThreadId,
      createThreadMutation.error,
      latestTurnSummary,
      novelSetup,
      novelsQuery.error,
      productionStatus,
      runtimeState.interrupt,
      runtimeState.isRunning,
      runtimeState.threadLoadError,
      stateQuery.data?.data?.diagnostics,
      stateQuery.error,
      threadsQuery.error,
    ],
  );

  const archiveThread = async (threadId: string, archived: boolean) => {
    if (threadActionInFlightRef.current) {
      return;
    }
    threadActionInFlightRef.current = true;
    setThreadActionPendingId(threadId);
    try {
      await updateCreativeHubThread(threadId, { archived });
      await queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.threads });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "线程归档操作失败，请重试。");
    } finally {
      threadActionInFlightRef.current = false;
      setThreadActionPendingId("");
    }
  };

  const handleBindingsChange = useCallback(async (patch: Partial<CreativeHubResourceBinding>) => {
    if (!activeThreadId || bindingInFlightRef.current) {
      return;
    }
    bindingInFlightRef.current = true;
    const bindingThreadId = activeThreadId;
    const bindingThreadSession = activeThreadSessionRef.current;
    const nextBindings = applyCreativeHubBindingPatch(currentBindings, patch);
    setBindingPending(true);
    try {
      await updateCreativeHubThread(bindingThreadId, { resourceBindings: nextBindings });
      await queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.threads });
      await queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.state(bindingThreadId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.history(bindingThreadId) });
      if (
        activeThreadIdRef.current === bindingThreadId
        && activeThreadSessionRef.current === bindingThreadSession
      ) {
        setSearchParams((prev) => {
          const next = applyCreativeHubBindingsToSearch(prev, nextBindings);
          next.set("threadId", bindingThreadId);
          return next;
        }, { replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "小说工作区切换失败，请重试。");
    } finally {
      bindingInFlightRef.current = false;
      setBindingPending(false);
    }
  }, [activeThreadId, currentBindings, queryClient, setSearchParams]);

  const removeThread = async (threadId: string) => {
    if (threadActionInFlightRef.current) {
      return;
    }
    threadActionInFlightRef.current = true;
    setThreadActionPendingId(threadId);
    try {
      await deleteCreativeHubThread(threadId);
      queryClient.setQueryData<ApiResponse<CreativeHubThread[]>>(queryKeys.creativeHub.threads, (previous) => (
        previous?.data
          ? { ...previous, data: previous.data.filter((thread) => thread.id !== threadId) }
          : previous
      ));
      if (activeThreadIdRef.current === threadId) {
        setSearchParams((prev) => {
          const next = applyCreativeHubBindingsToSearch(prev, {});
          next.delete("threadId");
          return next;
        }, { replace: true });
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.threads });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创作线程删除失败，请重试。");
    } finally {
      threadActionInFlightRef.current = false;
      setThreadActionPendingId("");
    }
  };

  const handleResolveInterrupt = async (action: "approve" | "reject") => {
    const interrupt = runtimeState.interrupt;
    if (!activeThreadId || !interrupt?.id || approvalInFlightRef.current) return;
    approvalInFlightRef.current = true;
    const interruptThreadId = activeThreadId;
    setApprovalPending(true);
    try {
      await resolveCreativeHubInterrupt(interruptThreadId, interrupt.id, {
        action,
        note: approvalNote.trim() || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.state(interruptThreadId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.history(interruptThreadId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.creativeHub.threads });
      if (
        activeThreadIdRef.current === interruptThreadId
        && activeInterruptIdRef.current === interrupt.id
      ) {
        setApprovalNote("");
        runtimeState.setInterrupt(undefined);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "待确认操作提交失败，请重试。");
    } finally {
      approvalInFlightRef.current = false;
      setApprovalPending(false);
    }
  };

  const handleQuickAction = useCallback(async (prompt: string) => {
    if (
      !activeThreadId
      || runtimeState.isRunning
      || runtimeState.isThreadLoading
      || Boolean(runtimeState.threadLoadError)
    ) {
      return;
    }
    await runtimeState.sendPrompt(prompt);
  }, [activeThreadId, runtimeState]);

  const handleCreateNovelQuickAction = useCallback(async (title: string) => {
    const normalized = title.trim();
    if (!normalized) {
      return;
    }
    await handleQuickAction(`创建一本小说《${normalized}》。`);
  }, [handleQuickAction]);

  const focusWorkspaceArea = (id: "creative-hub-activity" | "creative-hub-context") => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const workspaceActionDisabled = !activeThreadId
    || runtimeState.isRunning
    || runtimeState.isThreadLoading
    || Boolean(runtimeState.threadLoadError)
    || threadsQuery.isLoading
    || Boolean(threadsQuery.error)
    || stateQuery.isLoading
    || Boolean(stateQuery.error)
    || bindingPending
    || approvalPending
    || createThreadMutation.isPending
    || Boolean(threadActionPendingId);
  const threadNavigationDisabled = runtimeState.isRunning
    || runtimeState.isThreadLoading
    || threadsQuery.isLoading
    || Boolean(threadsQuery.error)
    || bindingPending
    || approvalPending
    || createThreadMutation.isPending
    || Boolean(threadActionPendingId);

  const handleWorkspaceRecommendation = () => {
    const recommendation = workspacePresentation.recommendation;
    if (recommendation.action === "retry_threads") {
      void threadsQuery.refetch();
      return;
    }
    if (recommendation.action === "retry_state") {
      void stateQuery.refetch();
      return;
    }
    if (recommendation.action === "retry_thread") {
      runtimeState.retryThreadLoad();
      return;
    }
    if (recommendation.action === "retry_novels") {
      void novelsQuery.refetch();
      return;
    }
    if (recommendation.action === "retry_create_thread") {
      void requestThreadCreation({ title: DEFAULT_THREAD_TITLE, resourceBindings: initialBindings });
      return;
    }
    if (recommendation.action === "send_prompt" && recommendation.prompt) {
      void handleQuickAction(recommendation.prompt);
      return;
    }
    if (recommendation.action === "select_novel" || recommendation.action === "open_production") {
      focusWorkspaceArea("creative-hub-context");
      return;
    }
    focusWorkspaceArea("creative-hub-activity");
  };

  const recommendationPending = (
    workspacePresentation.recommendation.action === "retry_threads" && threadsQuery.isFetching
  ) || (
    workspacePresentation.recommendation.action === "retry_state" && stateQuery.isFetching
  ) || (
    workspacePresentation.recommendation.action === "retry_thread" && runtimeState.isThreadLoading
  ) || (
    workspacePresentation.recommendation.action === "retry_novels" && novelsQuery.isFetching
  ) || (
    workspacePresentation.recommendation.action === "retry_create_thread" && createThreadMutation.isPending
  );

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
    }).catch((error: unknown) => {
      if (activeThreadIdRef.current === activeThreadId) {
        toast.error(error instanceof Error ? error.message : "世界观绑定同步失败，请重新加载当前线程后重试。");
      }
    });
  }, [activeThreadId, productionStatus?.worldId, queryClient, rawThreadBindings]);

  return (
    <div className="space-y-4">
      <WorkspaceHeader
        icon={MessagesSquare}
        context="当前小说与创作线程"
        title="创作中枢"
        description="围绕当前小说整理创作目标、查看 AI 执行记录，并从真实任务状态继续推进整本作品。"
        meta={(
          <>
            <span>小说：{workspacePresentation.objectTitle}</span>
            <span>阶段：{workspacePresentation.stageLabel}</span>
            <span>线程：{currentThread?.title ?? "正在准备"}</span>
            <span>状态：{workspacePresentation.threadStatusLabel}</span>
            {currentBindings.knowledgeDocumentIds?.length ? (
              <span>已绑定知识资料：{currentBindings.knowledgeDocumentIds.length} 份</span>
            ) : null}
          </>
        )}
        actions={(
          <Button
            type="button"
            variant="outline"
            disabled={threadNavigationDisabled}
            onClick={() => void requestThreadCreation({ title: DEFAULT_THREAD_TITLE, resourceBindings: {} })}
          >
            {createThreadMutation.isPending ? "正在创建..." : "新建创作线程"}
          </Button>
        )}
      />

      {threadsQuery.isLoading
        || createThreadMutation.isPending && !activeThreadId
        || Boolean(activeThreadId && (stateQuery.isLoading || runtimeState.isThreadLoading)) ? (
        <WorkspaceStateNotice
          loading
          tone="info"
          title="正在准备当前创作现场"
          description="系统正在读取线程、小说绑定和最近执行记录，完成后会给出唯一推荐下一步。"
        />
      ) : (
        <WorkspaceNextAction
          tone={workspacePresentation.recommendation.tone}
          title={workspacePresentation.recommendation.title}
          description={workspacePresentation.recommendation.description}
          action={(
            <Button
              type="button"
              size="sm"
              onClick={handleWorkspaceRecommendation}
              disabled={recommendationPending || (
                workspaceActionDisabled && workspacePresentation.recommendation.action === "send_prompt"
              )}
            >
              {workspacePresentation.recommendation.action.startsWith("retry_") ? (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              ) : null}
              {recommendationPending ? "正在重试..." : workspacePresentation.recommendation.actionLabel}
            </Button>
          )}
        />
      )}

      <div className="grid min-h-[72vh] gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:h-[calc(100vh-13rem)] xl:grid-cols-[240px_minmax(0,1fr)_320px]">
        <div id="creative-hub-activity" className="min-h-0 scroll-mt-4 lg:col-start-1 lg:row-start-1 xl:col-start-2">
          <CreativeHubConversation
            runtime={runtimeState.runtime}
            onQuickAction={(prompt) => void handleQuickAction(prompt)}
            interrupt={runtimeState.interrupt}
            approvalNote={approvalNote}
            onApprovalNoteChange={setApprovalNote}
            onResolveInterrupt={(action) => void handleResolveInterrupt(action)}
            approvalPending={approvalPending}
            diagnostics={stateQuery.data?.data?.diagnostics}
            loading={runtimeState.isThreadLoading}
            errorMessage={runtimeState.threadLoadError ?? ""}
            onRetry={runtimeState.retryThreadLoad}
            actionDisabled={workspaceActionDisabled}
          />
        </div>

        <div id="creative-hub-context" className="min-h-0 scroll-mt-4 lg:col-start-2 lg:row-start-1 xl:col-start-3">
          <CreativeHubSidebar
            thread={currentThread}
            bindings={currentBindings}
            novels={novels}
            interrupt={runtimeState.interrupt}
            diagnostics={stateQuery.data?.data?.diagnostics}
            productionStatus={productionStatus}
            novelSetup={novelSetup}
            latestTurnSummary={latestTurnSummary}
            currentCheckpointId={currentCheckpointId}
            modelSummary={{
              provider: llm.provider,
              model: llm.model,
              temperature: llm.temperature,
              maxTokens: llm.maxTokens,
            }}
            defaultRuntimeDetailsCollapsed={defaultRuntimeDetailsCollapsed}
            actionDisabled={workspaceActionDisabled}
            novelsLoading={novelsQuery.isLoading}
            novelsErrorMessage={novelsQuery.error instanceof Error ? novelsQuery.error.message : novelsQuery.error ? "小说列表加载失败。" : ""}
            novelsRetrying={novelsQuery.isFetching}
            onToggleRuntimeDetailsDefault={() => {
              setDefaultRuntimeDetailsCollapsed((value) => !value);
            }}
            onRetryNovels={() => void novelsQuery.refetch()}
            onNovelChange={(novelId) => handleBindingsChange({ novelId: novelId || null })}
            onQuickAction={(prompt) => void handleQuickAction(prompt)}
            onCreateNovel={handleCreateNovelQuickAction}
            onStartProduction={handleQuickAction}
          />
        </div>

        <div className="min-h-0 lg:col-span-2 lg:row-start-2 xl:col-span-1 xl:col-start-1 xl:row-start-1">
          <CreativeHubThreadList
            threads={threads}
            activeThreadId={activeThreadId}
            loading={threadsQuery.isLoading}
            errorMessage={threadsQuery.error instanceof Error ? threadsQuery.error.message : threadsQuery.error ? "创作线程加载失败。" : ""}
            retryPending={threadsQuery.isFetching}
            actionPending={createThreadMutation.isPending}
            actionDisabled={threadNavigationDisabled}
            pendingThreadId={threadActionPendingId}
            onRetry={() => void threadsQuery.refetch()}
            onSelect={(threadId) => {
              const selectedThread = threads.find((thread) => thread.id === threadId);
              setSearchParams((prev) => {
                const next = selectedThread
                  ? applyCreativeHubBindingsToSearch(prev, selectedThread.resourceBindings)
                  : new URLSearchParams(prev);
                next.set("threadId", threadId);
                return next;
              }, { replace: true });
            }}
            onCreate={() => void requestThreadCreation({ title: DEFAULT_THREAD_TITLE, resourceBindings: {} })}
            onArchive={(threadId, archived) => void archiveThread(threadId, archived)}
            onDelete={(threadId) => void removeThread(threadId)}
          />
        </div>
      </div>
    </div>
  );
}
