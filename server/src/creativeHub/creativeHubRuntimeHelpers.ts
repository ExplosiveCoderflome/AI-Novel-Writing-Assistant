import crypto from "node:crypto";
import type {
  CreativeHubInterrupt,
  CreativeHubMessage,
  CreativeHubResourceBinding,
  CreativeHubThread,
} from "@ai-novel/shared/types/creativeHub";
import type { AgentRunStatus } from "@ai-novel/shared/types/agent";

export function toBindings(bindings?: CreativeHubResourceBinding): CreativeHubResourceBinding {
  return {
    novelId: bindings?.novelId ?? null,
    chapterId: bindings?.chapterId ?? null,
    worldId: bindings?.worldId ?? null,
    taskId: bindings?.taskId ?? null,
    bookAnalysisId: bindings?.bookAnalysisId ?? null,
    formulaId: bindings?.formulaId ?? null,
    styleProfileId: bindings?.styleProfileId ?? null,
    baseCharacterId: bindings?.baseCharacterId ?? null,
    knowledgeDocumentIds: bindings?.knowledgeDocumentIds ?? [],
  };
}

export function describeBindings(bindings: CreativeHubResourceBinding): string | null {
  const parts = [
    bindings.novelId ? `小说ID=${bindings.novelId}` : null,
    bindings.chapterId ? `章节ID=${bindings.chapterId}` : null,
    bindings.worldId ? `世界观ID=${bindings.worldId}` : null,
    bindings.taskId ? `任务ID=${bindings.taskId}` : null,
    bindings.bookAnalysisId ? `拆书分析ID=${bindings.bookAnalysisId}` : null,
    bindings.formulaId ? `写作公式ID=${bindings.formulaId}` : null,
    bindings.styleProfileId ? `写法资产ID=${bindings.styleProfileId}` : null,
    bindings.baseCharacterId ? `基础角色ID=${bindings.baseCharacterId}` : null,
    bindings.knowledgeDocumentIds?.length ? `知识文档ID=${bindings.knowledgeDocumentIds.join(",")}` : null,
  ].filter((item): item is string => Boolean(item));

  return parts.length > 0 ? parts.join("，") : null;
}

export function prependBindingMessage(
  messages: CreativeHubMessage[],
  bindings: CreativeHubResourceBinding,
): CreativeHubMessage[] {
  const summary = describeBindings(bindings);
  if (!summary) {
    return messages;
  }

  return [
    {
      id: "creative_hub_binding_context",
      type: "system",
      content: `当前创作中枢绑定的工作区资源如下：${summary}。如需查询、诊断或控制，请优先围绕这些资源理解用户意图。`,
      additional_kwargs: {
        source: "creative_hub_binding",
        bindings,
      },
    },
    ...messages,
  ];
}

export function toChatMessages(
  messages: CreativeHubMessage[],
): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  return messages
    .map((message) => {
      if (message.type === "human") {
        return {
          role: "user" as const,
          content: typeof message.content === "string" ? message.content : JSON.stringify(message.content),
        };
      }
      if (message.type === "ai") {
        return {
          role: "assistant" as const,
          content: typeof message.content === "string" ? message.content : JSON.stringify(message.content),
        };
      }
      if (message.type === "system") {
        return {
          role: "system" as const,
          content: typeof message.content === "string" ? message.content : JSON.stringify(message.content),
        };
      }
      return null;
    })
    .filter((item): item is { role: "user" | "assistant" | "system"; content: string } => Boolean(item?.content?.trim()));
}

export function appendAssistantMessage(
  messages: CreativeHubMessage[],
  assistantOutput: string,
  runId?: string | null,
): CreativeHubMessage[] {
  if (!assistantOutput.trim()) {
    return messages;
  }

  return [
    ...messages,
    {
      id: `ai_${runId ?? crypto.randomUUID()}`,
      type: "ai",
      content: assistantOutput,
      additional_kwargs: { source: "creative_hub" },
    },
  ];
}

export function parseStepRecord(value: string | null | undefined): Record<string, unknown> {
  if (!value?.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function deriveNextBindingsFromRunSteps(
  bindings: CreativeHubResourceBinding,
  steps: Array<{
    stepType: string;
    status: string;
    inputJson?: string | null;
    outputJson?: string | null;
  }>,
): CreativeHubResourceBinding {
  const nextBindings = toBindings(bindings);

  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step.stepType !== "tool_result" || step.status !== "succeeded") {
      continue;
    }

    const input = parseStepRecord(step.inputJson);
    const output = parseStepRecord(step.outputJson);
    const tool = typeof input.tool === "string" ? input.tool : "";

    if (
      (tool === "create_novel" || tool === "select_novel_workspace")
      && typeof output.novelId === "string"
      && output.novelId.trim()
    ) {
      const nextNovelId = output.novelId.trim();
      if (nextBindings.novelId !== nextNovelId) {
        nextBindings.chapterId = null;
      }
      nextBindings.novelId = nextNovelId;
    }

    if (
      (tool === "generate_world_for_novel" || tool === "bind_world_to_novel")
      && typeof output.worldId === "string"
      && output.worldId.trim()
    ) {
      nextBindings.worldId = output.worldId.trim();
      if (typeof output.novelId === "string" && output.novelId.trim()) {
        nextBindings.novelId = output.novelId.trim();
      }
    }

    if (tool === "unbind_world_from_novel") {
      nextBindings.worldId = null;
      if (typeof output.novelId === "string" && output.novelId.trim()) {
        nextBindings.novelId = output.novelId.trim();
      }
    }
  }

  return nextBindings;
}

export function deriveThreadStatusFromRunStatus(status: AgentRunStatus): CreativeHubThread["status"] {
  if (status === "failed") {
    return "error";
  }
  if (status === "waiting_approval") {
    return "interrupted";
  }
  if (status === "running" || status === "queued") {
    return "busy";
  }
  return "idle";
}

export function buildInterrupt(payload: {
  approvalId: string;
  runId: string;
  summary: string;
  targetType: string;
  targetId: string;
}): CreativeHubInterrupt {
  return {
    id: payload.approvalId,
    approvalId: payload.approvalId,
    runId: payload.runId,
    title: "审批确认",
    summary: payload.summary,
    targetType: payload.targetType,
    targetId: payload.targetId,
    resumable: true,
    createdAt: new Date().toISOString(),
    metadata: payload,
  };
}
