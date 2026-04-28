import { novelProductionStatusService } from "../../services/novel/NovelProductionStatusService";
import { novelSetupStatusService } from "../../services/novel/NovelSetupStatusService";
import type { PromptContextBlock } from "../core/promptTypes";
import { estimateContextTokens } from "./ContextBroker";
import type { PromptContextResolver, PromptExecutionContext } from "./types";

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function compactText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function getStringRecordValue(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function resolveNovelId(context: PromptExecutionContext): string | undefined {
  return context.novelId ?? getStringRecordValue(context.resourceBindings, "novelId");
}

function createContextBlock(input: {
  id: string;
  group: string;
  priority: number;
  required: boolean;
  content: string;
  freshness?: number;
}): PromptContextBlock {
  return {
    ...input,
    estimatedTokens: estimateContextTokens(input.content),
  };
}

const creativeHubBindingsResolver: PromptContextResolver = {
  group: "creative_hub.bindings",
  description: "Creative Hub resource bindings and active workspace identifiers.",
  resolve: ({ executionContext, requirement }) => {
    const content = safeJsonStringify({
      entrypoint: executionContext.entrypoint,
      graphNode: executionContext.graphNode,
      threadId: executionContext.threadId,
      runId: executionContext.runId,
      workflowRunId: executionContext.workflowRunId,
      stepRunId: executionContext.stepRunId,
      checkpointId: executionContext.checkpointId,
      novelId: executionContext.novelId,
      chapterId: executionContext.chapterId,
      worldId: executionContext.worldId,
      taskId: executionContext.taskId,
      styleProfileId: executionContext.styleProfileId,
      userGoal: executionContext.userGoal,
      resourceBindings: executionContext.resourceBindings ?? {},
    });
    return createContextBlock({
      id: "creative_hub.bindings",
      group: "creative_hub.bindings",
      priority: requirement.priority,
      required: Boolean(requirement.required),
      content,
    });
  },
};

const creativeHubRecentMessagesResolver: PromptContextResolver = {
  group: "creative_hub.recent_messages",
  description: "Recent Creative Hub conversation turns supplied by the runtime caller.",
  resolve: ({ executionContext, requirement }) => {
    const messages = (executionContext.recentMessages ?? [])
      .map((message) => ({
        role: message.role,
        content: compactText(message.content, 800),
        createdAt: message.createdAt,
      }))
      .filter((message) => message.content.length > 0)
      .slice(-12);
    if (messages.length === 0) {
      return null;
    }
    return createContextBlock({
      id: "creative_hub.recent_messages",
      group: "creative_hub.recent_messages",
      priority: requirement.priority,
      required: Boolean(requirement.required),
      content: safeJsonStringify(messages),
    });
  },
};

const creativeHubNovelSetupStatusResolver: PromptContextResolver = {
  group: "creative_hub.novel_setup_status",
  description: "Current novel setup checklist used by Creative Hub guidance.",
  resolve: async ({ executionContext, requirement }) => {
    const novelId = resolveNovelId(executionContext);
    if (!novelId) {
      return null;
    }
    const setup = await novelSetupStatusService.getNovelSetupStatus(novelId);
    if (!setup) {
      return null;
    }
    return createContextBlock({
      id: `creative_hub.novel_setup_status:${novelId}`,
      group: "creative_hub.novel_setup_status",
      priority: requirement.priority,
      required: Boolean(requirement.required),
      content: safeJsonStringify(setup),
      freshness: Date.now(),
    });
  },
};

const creativeHubProductionStatusResolver: PromptContextResolver = {
  group: "creative_hub.production_status",
  description: "Current full-novel production readiness and pipeline status.",
  resolve: async ({ executionContext, requirement }) => {
    const novelId = resolveNovelId(executionContext);
    if (!novelId) {
      return null;
    }
    const status = await novelProductionStatusService.getNovelProductionStatus({ novelId });
    return createContextBlock({
      id: `creative_hub.production_status:${novelId}`,
      group: "creative_hub.production_status",
      priority: requirement.priority,
      required: Boolean(requirement.required),
      content: safeJsonStringify(status),
      freshness: Date.now(),
    });
  },
};

export function createCreativeHubContextResolvers(): PromptContextResolver[] {
  return [
    creativeHubBindingsResolver,
    creativeHubRecentMessagesResolver,
    creativeHubNovelSetupStatusResolver,
    creativeHubProductionStatusResolver,
  ];
}
