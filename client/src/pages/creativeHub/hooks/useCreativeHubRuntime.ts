import { useEffect, useMemo, useRef, useState } from "react";
import {
  getExternalStoreMessages,
  useExternalMessageConverter,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import {
  appendLangChainChunk,
  convertLangChainMessages,
  useLangGraphMessages,
  type LangChainMessage,
  type LangGraphInterruptState,
  type LangGraphStreamCallback,
} from "@assistant-ui/react-langgraph";
import type { FailureDiagnostic } from "@ai-novel/shared/types/agent";
import type {
  CreativeHubInterrupt,
  CreativeHubMessage,
  CreativeHubResourceBinding,
  CreativeHubTurnSummary,
} from "@ai-novel/shared/types/creativeHub";
import type { CreativeHubStreamFrame } from "@ai-novel/shared/types/api";
import { toast } from "@/components/ui/toast";
import { streamCreativeHubRun } from "@/api/creativeHub";
import {
  buildInlineStateMessages,
  buildRunArtifactMessages,
  createRunArtifactEvent,
  type CreativeHubRunArtifacts,
  mergeDisplayMessages,
} from "../lib/creativeHubSyntheticMessages";

type RunSettings = {
  provider: string;
  model: string;
  temperature: number;
  maxTokens?: number;
};

interface LoadThreadResult {
  messages: LangChainMessage[];
  interrupts?: CreativeHubInterrupt[];
  checkpointId?: string | null;
  latestTurnSummary?: import("@ai-novel/shared/types/creativeHub").CreativeHubTurnSummary | null;
}

interface UseCreativeHubRuntimeOptions {
  threadId: string;
  resourceBindings: CreativeHubResourceBinding;
  runSettings: RunSettings;
  loadThread: (threadId: string) => Promise<LoadThreadResult>;
  getCheckpointId?: (threadId: string, parentMessages: LangChainMessage[]) => Promise<string | null>;
  onEvent?: (event: CreativeHubStreamFrame) => void;
  onCheckpointChange?: (checkpointId: string | null) => void;
  onRefreshState?: () => void;
  diagnostics?: FailureDiagnostic;
  defaultRuntimeDetailsCollapsed: boolean;
}

function toLangGraphInterrupt(interrupt?: CreativeHubInterrupt | null): LangGraphInterruptState | undefined {
  if (!interrupt) return undefined;
  return {
    value: interrupt,
    resumable: interrupt.resumable ?? true,
    when: "during",
    ns: interrupt.id ? [interrupt.id] : undefined,
  };
}

function getMessageContent(msg: any): string | Array<Record<string, unknown>> {
  const parts = [
    ...msg.content,
    ...(msg.attachments?.flatMap((item: any) => item.content) ?? []),
  ];
  const normalized = parts.map((part) => {
    if (part.type === "text") {
      return { type: "text", text: part.text };
    }
    if (part.type === "image") {
      return { type: "image_url", image_url: { url: part.image } };
    }
    return {
      type: "file",
      data: part.data,
      mime_type: part.mimeType,
      metadata: {
        filename: part.filename ?? "file",
      },
      source_type: "base64",
    };
  });
  if (normalized.length === 1 && normalized[0]?.type === "text") {
    return normalized[0].text as string;
  }
  return normalized;
}

function truncateLangChainMessages(threadMessages: any[], parentId: string | null) {
  if (parentId === null) return [] as LangChainMessage[];
  const parentIndex = threadMessages.findIndex((message: any) => message.id === parentId);
  if (parentIndex === -1) return [] as LangChainMessage[];
  const truncated: LangChainMessage[] = [];
  for (let index = 0; index <= parentIndex && index < threadMessages.length; index += 1) {
    truncated.push(...(getExternalStoreMessages(threadMessages[index]) as LangChainMessage[]));
  }
  return truncated;
}

function toCreativeHubMessages(messages: LangChainMessage[]): CreativeHubMessage[] {
  return messages as unknown as CreativeHubMessage[];
}

function normalizeStreamFrame(frame: CreativeHubStreamFrame) {
  if (frame.event === "messages/partial" || frame.event === "messages/complete") {
    return {
      event: frame.event,
      data: frame.data as unknown as LangChainMessage[],
    };
  }
  if (frame.event === "creative_hub/error") {
    return {
      event: "error" as const,
      data: frame.data,
    };
  }
  return frame;
}

async function requireCheckpointIdForBranch(
  threadId: string,
  parentMessages: LangChainMessage[],
  getCheckpointId?: (threadId: string, parentMessages: LangChainMessage[]) => Promise<string | null>,
): Promise<string | null> {
  if (!getCheckpointId) {
    return null;
  }
  const checkpointId = await getCheckpointId(threadId, parentMessages);
  if (checkpointId || parentMessages.length === 0) {
    return checkpointId;
  }
  const message = "未能匹配到对应的历史检查点，当前消息无法生成新分支。";
  toast.error(message);
  throw new Error(message);
}

export function useCreativeHubRuntime({
  threadId,
  resourceBindings,
  runSettings,
  loadThread,
  getCheckpointId,
  onEvent,
  onCheckpointChange,
  onRefreshState,
  diagnostics,
  defaultRuntimeDetailsCollapsed,
}: UseCreativeHubRuntimeOptions) {
  const checkpointRef = useRef<string | null>(null);
  const streamSessionRef = useRef(0);
  const latestThreadIdRef = useRef(threadId);
  const currentRunIdRef = useRef<string | null>(null);
  const debugEntrySeqRef = useRef(0);
  const sendInFlightRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runArtifacts, setRunArtifacts] = useState<CreativeHubRunArtifacts[]>([]);
  const [threadStateLoaded, setThreadStateLoaded] = useState(false);
  const isThreadReady = threadId.trim().length > 0;

  useEffect(() => {
    latestThreadIdRef.current = threadId;
  }, [threadId]);

  const updateRunArtifacts = (
    runId: string,
    updater: (existing: CreativeHubRunArtifacts | undefined) => CreativeHubRunArtifacts,
  ) => {
    setRunArtifacts((previous) => {
      const index = previous.findIndex((item) => item.runId === runId);
      if (index === -1) {
        return [...previous, updater(undefined)];
      }
      const next = previous.slice();
      next[index] = updater(previous[index]);
      return next;
    });
  };

  const stream = useMemo<LangGraphStreamCallback<LangChainMessage>>(
    () =>
      async function* streamCallback(messages, config) {
        if (!isThreadReady) {
          throw new Error("创作中枢线程尚未初始化。");
        }
        const streamSessionId = streamSessionRef.current;
        const streamThreadId = threadId;
        const streamGenerator = streamCreativeHubRun(
          threadId,
          {
            messages: toCreativeHubMessages(messages),
            checkpointId: config.checkpointId ?? checkpointRef.current,
            resourceBindings,
            provider: runSettings.provider,
            model: runSettings.model,
            temperature: runSettings.temperature,
            maxTokens: runSettings.maxTokens,
          },
          config.abortSignal,
        );

        for await (const frame of streamGenerator) {
          if (frame.event === "creative_hub/run_status" && frame.data.runId) {
            currentRunIdRef.current = frame.data.runId;
          }
          if (frame.event === "creative_hub/turn_summary") {
            currentRunIdRef.current = frame.data.runId;
            updateRunArtifacts(frame.data.runId, (existing) => ({
              runId: frame.data.runId,
              debugEntries: existing?.debugEntries ?? [],
              turnSummary: frame.data,
            }));
          }
          const runArtifactEvent = createRunArtifactEvent(frame, currentRunIdRef.current, debugEntrySeqRef.current + 1);
          if (runArtifactEvent) {
            debugEntrySeqRef.current += 1;
            updateRunArtifacts(runArtifactEvent.runId, (existing) => ({
              runId: runArtifactEvent.runId,
              turnSummary: existing?.turnSummary,
              debugEntries: [...(existing?.debugEntries ?? []), runArtifactEvent.entry].slice(-16),
            }));
          }
          if (streamSessionId !== streamSessionRef.current || streamThreadId !== latestThreadIdRef.current) {
            break;
          }
          onEvent?.(frame);
          if (frame.event === "metadata" && typeof frame.data === "object" && frame.data && "checkpointId" in frame.data) {
            const nextCheckpointId = typeof frame.data.checkpointId === "string"
              ? frame.data.checkpointId
              : null;
            checkpointRef.current = nextCheckpointId;
            onCheckpointChange?.(nextCheckpointId);
          }
          yield normalizeStreamFrame(frame);
        }
      },
    [isThreadReady, onCheckpointChange, onEvent, resourceBindings, runSettings.maxTokens, runSettings.model, runSettings.provider, runSettings.temperature, threadId],
  );

  const {
    interrupt,
    messages,
    messageMetadata,
    sendMessage,
    cancel,
    setInterrupt,
    setMessages,
  } = useLangGraphMessages<LangChainMessage>({
    appendMessage: appendLangChainChunk,
    stream,
    eventHandlers: {
      onCustomEvent: async (type, data) => {
        if (type === "creative_hub/interrupt") {
          const nextInterrupt = data as CreativeHubInterrupt;
          setInterrupt(toLangGraphInterrupt(nextInterrupt));
        }
        if (type === "creative_hub/approval_resolved") {
          setInterrupt(undefined);
        }
      },
      onMetadata: async (metadata) => {
        if (typeof metadata === "object" && metadata && "checkpointId" in metadata) {
          const nextCheckpointId = typeof metadata.checkpointId === "string"
            ? metadata.checkpointId
            : null;
          checkpointRef.current = nextCheckpointId;
          onCheckpointChange?.(nextCheckpointId);
        }
      },
      onError: async () => {
        setInterrupt((prev) => prev);
      },
    },
  });

  const inlineStateMessages = useMemo(
    () => buildInlineStateMessages(interrupt?.value as CreativeHubInterrupt | undefined, diagnostics),
    [diagnostics, interrupt?.value],
  );
  const runArtifactMessages = useMemo(
    () => buildRunArtifactMessages(runArtifacts, defaultRuntimeDetailsCollapsed),
    [defaultRuntimeDetailsCollapsed, runArtifacts],
  );

  const displayMessages = useMemo(
    () => mergeDisplayMessages(messages, inlineStateMessages, runArtifactMessages),
    [inlineStateMessages, messages, runArtifactMessages],
  );

  const threadMessages = useExternalMessageConverter({
    callback: convertLangChainMessages,
    messages: displayMessages,
    isRunning,
  });
  const baseThreadMessages = useExternalMessageConverter({
    callback: convertLangChainMessages,
    messages,
    isRunning,
  });
  const threadMessagesRef = useRef(baseThreadMessages);
  threadMessagesRef.current = baseThreadMessages;

  const handleSend = async (nextMessages: LangChainMessage[], config: { checkpointId?: string | null; runConfig?: unknown }) => {
    if (sendInFlightRef.current) {
      return;
    }
    try {
      sendInFlightRef.current = true;
      setRunArtifacts([]);
      currentRunIdRef.current = null;
      debugEntrySeqRef.current = 0;
      setIsRunning(true);
      await sendMessage(nextMessages, {
        ...(config.checkpointId ? { checkpointId: config.checkpointId } : {}),
        ...(config.runConfig ? { runConfig: config.runConfig } : {}),
      });
    } finally {
      sendInFlightRef.current = false;
      setIsRunning(false);
      onRefreshState?.();
    }
  };

  const sendPrompt = async (prompt: string) => {
    const content = prompt.trim();
    if (!content) {
      return;
    }
    return handleSend([
      {
        type: "human",
        content: content as any,
      },
    ], {});
  };

  const runtime = useExternalStoreRuntime({
    isRunning,
    messages: threadMessages,
    onNew: async (msg) => {
      return handleSend([
        {
          type: "human",
              content: getMessageContent(msg) as any,
        },
      ], {
        runConfig: msg.runConfig,
      });
    },
    onEdit: getCheckpointId
      ? async (msg) => {
        const truncated = truncateLangChainMessages(threadMessagesRef.current, msg.parentId);
        const checkpointId = await requireCheckpointIdForBranch(threadId, truncated, getCheckpointId);
        setMessages(truncated);
        setInterrupt(undefined);
        setRunArtifacts([]);
        currentRunIdRef.current = null;
        return handleSend([
          {
            type: "human",
            content: getMessageContent(msg) as any,
          },
        ], {
          checkpointId,
          runConfig: msg.runConfig,
        });
      }
      : undefined,
    onReload: getCheckpointId
      ? async (parentId, config) => {
        const truncated = truncateLangChainMessages(threadMessagesRef.current, parentId);
        const checkpointId = await requireCheckpointIdForBranch(threadId, truncated, getCheckpointId);
        setMessages(truncated);
        setInterrupt(undefined);
        setRunArtifacts([]);
        currentRunIdRef.current = null;
        return handleSend([], {
          checkpointId,
          runConfig: config.runConfig,
        });
      }
      : undefined,
    onCancel: async () => {
      cancel();
      sendInFlightRef.current = false;
      setIsRunning(false);
    },
    extras: {
      creativeHub: true,
      interrupt,
      messageMetadata,
    },
  });

  useEffect(() => {
    return () => {
      streamSessionRef.current += 1;
      cancel();
      sendInFlightRef.current = false;
      setIsRunning(false);
    };
  }, [threadId, cancel]);

  useEffect(() => {
    let disposed = false;
    if (!isThreadReady) {
      checkpointRef.current = null;
      setMessages([]);
      setInterrupt(undefined);
      setIsRunning(false);
      setRunArtifacts([]);
      setThreadStateLoaded(false);
      currentRunIdRef.current = null;
      debugEntrySeqRef.current = 0;
      return () => {
        disposed = true;
      };
    }
    setInterrupt(undefined);
    setRunArtifacts([]);
    setThreadStateLoaded(false);
    currentRunIdRef.current = null;
    debugEntrySeqRef.current = 0;
    void loadThread(threadId).then((state) => {
      if (disposed) return;
      checkpointRef.current = state.checkpointId ?? null;
      onCheckpointChange?.(state.checkpointId ?? null);
      setMessages(state.messages);
      setInterrupt(toLangGraphInterrupt(state.interrupts?.[0] ?? null));
      setRunArtifacts(state.latestTurnSummary ? [{
        runId: state.latestTurnSummary.runId,
        turnSummary: state.latestTurnSummary,
        debugEntries: [],
      }] : []);
      setThreadStateLoaded(true);
      currentRunIdRef.current = state.latestTurnSummary?.runId ?? null;
    });
    return () => {
      disposed = true;
    };
  }, [isThreadReady, loadThread, onCheckpointChange, setInterrupt, setMessages, threadId]);

  return {
    runtime,
    interrupt: interrupt?.value as CreativeHubInterrupt | undefined,
    checkpointId: checkpointRef.current,
    messageMetadata,
    isRunning,
    setInterrupt,
    messages,
    sendPrompt,
    latestTurnSummary: threadStateLoaded
      ? (runArtifacts[runArtifacts.length - 1]?.turnSummary ?? null) as CreativeHubTurnSummary | null
      : undefined,
  };
}
