import type { BookContractDraft } from "@ai-novel/shared/types/novelWorkflow";
import { AIMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import { resolveLLMClientOptions } from "../../../llm/factory";
import { parseStructuredLlmRawContentDetailed } from "../../../llm/structuredInvoke";
import { extractStructuredOutputErrorCategory, resolveStructuredOutputProfile } from "../../../llm/structuredOutput";
import { preparePromptExecution, runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  buildDirectorBookContractContextBlocks,
  directorBookContractPrompt,
} from "../../../prompting/prompts/novel/directorPlanning.prompts";
import { BookContractService } from "../BookContractService";
import { StoryMacroPlanService } from "../storyMacro/StoryMacroPlanService";
import {
  buildStoryInput,
  normalizeBookContract,
  toBookSpec,
} from "./novelDirectorHelpers";
import { runDirectorTrackedStep } from "./directorProgressTracker";
import {
  DIRECTOR_PROGRESS,
} from "./novelDirectorProgress";
import type { DirectorMarkTaskRunningCallback } from "./novelDirectorPhaseTypes";

interface DirectorStoryMacroDependencies {
  storyMacroService: StoryMacroPlanService;
  bookContractService: BookContractService;
}

interface DirectorStoryMacroCallbacks {
  markDirectorTaskRunning: DirectorMarkTaskRunningCallback;
}

function stringifyMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }
      return "";
    }).join("\n");
  }
  return "";
}

function toOpenAIChatMessages(messages: BaseMessage[]): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  return messages
    .map((message) => {
      const content = stringifyMessageContent(message.content).trim();
      if (!content) {
        return null;
      }
      const role = message instanceof SystemMessage || message.type === "system"
        ? "system"
        : message instanceof AIMessage || message.type === "ai"
          ? "assistant"
          : "user";
      return { role, content };
    })
    .filter((entry): entry is { role: "system" | "user" | "assistant"; content: string } => Boolean(entry));
}

async function generateDirectorBookContractViaDirectOpenAICompatibleCall(input: {
  request: DirectorConfirmRequest;
  messages: BaseMessage[];
  promptMeta: ReturnType<typeof preparePromptExecution>["invocation"];
}): Promise<BookContractDraft> {
  const resolved = await resolveLLMClientOptions(input.request.provider, {
    model: input.request.model,
    temperature: Math.min(input.request.temperature ?? 0.4, 0.4),
    taskType: directorBookContractPrompt.taskType,
    promptMeta: input.promptMeta,
    executionMode: "plain",
    structuredStrategy: "prompt_json",
    requestProtocol: "openai_compatible",
  });
  const response = await fetch(`${resolved.baseURL.replace(/\/+$/u, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(resolved.apiKey ? { authorization: `Bearer ${resolved.apiKey}` } : {}),
      ...resolved.requestHeaders,
    },
    body: JSON.stringify({
      model: resolved.model,
      temperature: resolved.temperature,
      ...(typeof resolved.maxTokens === "number" ? { max_tokens: resolved.maxTokens } : {}),
      messages: toOpenAIChatMessages(input.messages),
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Book Contract fallback 请求失败 (${response.status}): ${detail || response.statusText}`);
  }
  const payload = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ text?: string; type?: string }>;
      };
    }>;
  };
  const rawContent = typeof payload.choices?.[0]?.message?.content === "string"
    ? payload.choices[0].message.content
    : Array.isArray(payload.choices?.[0]?.message?.content)
      ? payload.choices?.[0]?.message?.content
        ?.map((part) => (typeof part?.text === "string" ? part.text : ""))
        .join("\n") ?? ""
      : "";
  const parsed = await parseStructuredLlmRawContentDetailed({
    rawContent,
    schema: directorBookContractPrompt.outputSchema!,
    provider: resolved.provider,
    model: resolved.model,
    apiKey: resolved.apiKey,
    baseURL: resolved.baseURL,
    temperature: resolved.temperature,
    maxTokens: resolved.maxTokens,
    taskType: directorBookContractPrompt.taskType,
    label: `${directorBookContractPrompt.id}@${directorBookContractPrompt.version}.fallback`,
    promptMeta: input.promptMeta,
    strategy: "prompt_json",
    profile: resolveStructuredOutputProfile({
      provider: resolved.provider,
      model: resolved.model,
      baseURL: resolved.baseURL,
      requestProtocol: resolved.requestProtocol,
      executionMode: "structured",
    }),
    maxRepairAttempts: directorBookContractPrompt.repairPolicy?.maxAttempts ?? 1,
  });
  return normalizeBookContract(parsed.data);
}

async function ensureDirectorConstraintEngine(
  storyMacroService: StoryMacroPlanService,
  novelId: string,
  plan: StoryMacroPlan,
): Promise<StoryMacroPlan> {
  if (plan.constraintEngine) {
    return plan;
  }

  try {
    return await storyMacroService.buildConstraintEngine(novelId);
  } catch {
    return plan;
  }
}

async function generateDirectorBookContract(input: {
  request: DirectorConfirmRequest;
  novelId: string;
  storyMacroService: StoryMacroPlanService;
  storyMacroPlan: StoryMacroPlan | null;
}): Promise<BookContractDraft> {
  const { request, storyMacroPlan } = input;
  const bookSpec = toBookSpec(request.candidate, request.idea, request.estimatedChapterCount);
  const storyInput = buildStoryInput(request, bookSpec);
  const requestedTemperature = request.temperature ?? 0.4;
  const temperature = Math.min(requestedTemperature, 0.4);
  const promptInput = {
    idea: storyInput,
    context: request,
    candidate: request.candidate,
    storyMacroPlan,
    targetChapterCount: request.estimatedChapterCount ?? bookSpec.targetChapterCount,
  };
  const contextBlocks = buildDirectorBookContractContextBlocks({
    idea: storyInput,
    context: request,
    candidate: request.candidate,
    storyMacroPlan,
    targetChapterCount: request.estimatedChapterCount ?? bookSpec.targetChapterCount,
  });
  const parsed = await runStructuredPrompt({
    asset: directorBookContractPrompt,
    promptInput,
    contextBlocks,
    options: {
      provider: request.provider,
      model: request.model,
      temperature,
    },
    }).catch(async (error) => {
      const category = extractStructuredOutputErrorCategory(error instanceof Error ? error.message : String(error));
      if (category !== "transport_error") {
        throw error;
      }
    const prepared = preparePromptExecution({
      asset: directorBookContractPrompt,
      promptInput,
      contextBlocks,
      options: {
        provider: request.provider,
        model: request.model,
        temperature,
      },
    });
      return {
        output: await generateDirectorBookContractViaDirectOpenAICompatibleCall({
          request,
          messages: prepared.messages,
          promptMeta: prepared.invocation,
        }),
        meta: {
          provider: request.provider,
          model: request.model,
          latencyMs: 0,
          invocation: prepared.invocation,
        },
        context: prepared.context,
      };
    });
  return parsed.output;
}

export async function runDirectorStoryMacroAssetPhase(input: {
  taskId: string;
  novelId: string;
  request: DirectorConfirmRequest;
  dependencies: Pick<DirectorStoryMacroDependencies, "storyMacroService">;
  callbacks: DirectorStoryMacroCallbacks;
}): Promise<StoryMacroPlan> {
  const { taskId, novelId, request, dependencies, callbacks } = input;
  const bookSpec = toBookSpec(request.candidate, request.idea, request.estimatedChapterCount);
  const storyInput = buildStoryInput(request, bookSpec);
  const storyMacroPlan = await runDirectorTrackedStep({
    taskId,
    stage: "story_macro",
    itemKey: "story_macro",
    itemLabel: "正在生成故事宏观规划",
    progress: DIRECTOR_PROGRESS.storyMacro,
    callbacks,
    run: async () => dependencies.storyMacroService.decompose(novelId, storyInput, request),
  });
  const hydratedStoryMacroPlan = await runDirectorTrackedStep({
    taskId,
    stage: "story_macro",
    itemKey: "constraint_engine",
    itemLabel: "正在构建约束引擎",
    progress: DIRECTOR_PROGRESS.constraintEngine,
    callbacks,
    run: async () => ensureDirectorConstraintEngine(
      dependencies.storyMacroService,
      novelId,
      storyMacroPlan,
    ),
  });
  return hydratedStoryMacroPlan;
}

export async function runDirectorBookContractPhase(input: {
  taskId: string;
  novelId: string;
  request: DirectorConfirmRequest;
  storyMacroPlan?: StoryMacroPlan | null;
  dependencies: DirectorStoryMacroDependencies;
  callbacks: DirectorStoryMacroCallbacks;
}): Promise<void> {
  const { taskId, novelId, request, dependencies, callbacks } = input;
  const hydratedStoryMacroPlan = input.storyMacroPlan
    ?? await dependencies.storyMacroService.getPlan(novelId);
  const bookContractDraft = await runDirectorTrackedStep({
    taskId,
    stage: "story_macro",
    itemKey: "book_contract",
    itemLabel: "正在生成 Book Contract",
    progress: DIRECTOR_PROGRESS.bookContract,
    callbacks,
    run: async () => generateDirectorBookContract({
      request,
      novelId,
      storyMacroService: dependencies.storyMacroService,
      storyMacroPlan: hydratedStoryMacroPlan,
    }),
  });
  await dependencies.bookContractService.upsert(novelId, bookContractDraft);
}

export async function runDirectorStoryMacroPhase(input: {
  taskId: string;
  novelId: string;
  request: DirectorConfirmRequest;
  dependencies: DirectorStoryMacroDependencies;
  callbacks: DirectorStoryMacroCallbacks;
}): Promise<void> {
  const storyMacroPlan = await runDirectorStoryMacroAssetPhase(input);
  await runDirectorBookContractPhase({
    ...input,
    storyMacroPlan,
  });
}
