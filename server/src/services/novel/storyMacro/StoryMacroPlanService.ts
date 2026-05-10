import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { AIMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type {
  StoryDecomposition,
  StoryExpansion,
  StoryMacroField,
  StoryMacroFieldValue,
  StoryMacroIssue,
  StoryMacroLocks,
  StoryMacroPlan,
  StoryMacroState,
} from "@ai-novel/shared/types/storyMacro";
import { prisma } from "../../../db/prisma";
import { resolveLLMClientOptions } from "../../../llm/factory";
import { invokeStructuredLlmDetailed, parseStructuredLlmRawContentDetailed } from "../../../llm/structuredInvoke";
import { extractStructuredOutputErrorCategory, resolveStructuredOutputProfile } from "../../../llm/structuredOutput";
import { preparePromptExecution, runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  storyMacroDecompositionPrompt,
  storyMacroFieldRegenerationPrompt,
} from "../../../prompting/prompts/novel/storyMacro.prompts";
import {
  buildStoryMacroDecompositionContextBlocks,
  buildStoryMacroFieldRegenerationContextBlocks,
} from "../../../prompting/prompts/novel/planningContextBlocks";
import { normalizeStoryModeOutput } from "../../storyMode/storyModeProfile";
import {
  EMPTY_DECOMPOSITION,
  EMPTY_EXPANSION,
  EMPTY_STATE,
  type StoryMacroEditablePlan,
  buildConstraintEngine as buildStoryConstraintEngine,
  hasMeaningfulDecomposition,
  hasMeaningfulExpansion,
  isDecompositionComplete,
  mergeLockedFields,
  normalizeConstraints,
  normalizeDecomposition,
  normalizeExpansion,
  normalizeIssues,
  setEditablePlanFieldValue,
} from "./storyMacroPlanUtils";
import {
  type PersistedPlanRow,
  mapRowToPlan,
  serializeConstraintPayload,
} from "./storyMacroPlanPersistence";
import {
  formatProjectContext,
  normalizeRegeneratedFieldValue,
  type StoryMacroNovelContext,
  toEditablePlan,
} from "./storyMacroPlanService.shared";
import { NovelWorldSliceService } from "../storyWorldSlice/NovelWorldSliceService";
import { formatStoryWorldSlicePromptBlock } from "../storyWorldSlice/storyWorldSliceFormatting";

interface LLMOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
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

export class StoryMacroPlanService {
  private readonly worldSliceService = new NovelWorldSliceService();

  private async getNovelContext(novelId: string): Promise<StoryMacroNovelContext> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        id: true,
        title: true,
        targetAudience: true,
        bookSellingPoint: true,
        competingFeel: true,
        first30ChapterPromise: true,
        commercialTagsJson: true,
        styleTone: true,
        narrativePov: true,
        pacePreference: true,
        emotionIntensity: true,
        estimatedChapterCount: true,
        genre: {
          select: {
            name: true,
          },
        },
        primaryStoryMode: {
          select: {
            id: true,
            name: true,
            description: true,
            template: true,
            parentId: true,
            profileJson: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        secondaryStoryMode: {
          select: {
            id: true,
            name: true,
            description: true,
            template: true,
            parentId: true,
            profileJson: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!novel) {
      throw new Error("小说不存在。");
    }
    return {
      ...novel,
      primaryStoryMode: novel.primaryStoryMode ? normalizeStoryModeOutput(novel.primaryStoryMode) : null,
      secondaryStoryMode: novel.secondaryStoryMode ? normalizeStoryModeOutput(novel.secondaryStoryMode) : null,
    };
  }

  private async getRow(novelId: string): Promise<PersistedPlanRow | null> {
    const row = await prisma.storyMacroPlan.findUnique({
      where: { novelId },
    });
    return row;
  }

  private async savePlan(
    novelId: string,
    input: {
      storyInput?: string | null;
      expansion?: StoryExpansion | null;
      decomposition?: StoryDecomposition | null;
      constraints?: string[];
      issues?: StoryMacroIssue[];
      lockedFields?: StoryMacroLocks;
      constraintEngine?: ReturnType<typeof buildStoryConstraintEngine> | null;
      state?: StoryMacroState;
    },
  ): Promise<StoryMacroPlan> {
    const previousRow = await this.getRow(novelId);
    const previousPlan = previousRow ? mapRowToPlan(previousRow) : null;
    const nextConstraints = input.constraints !== undefined
      ? normalizeConstraints(input.constraints)
      : (previousPlan?.constraints ?? []);
    const nextConstraintEngine = input.constraintEngine !== undefined
      ? input.constraintEngine
      : (previousPlan?.constraintEngine ?? null);
    const row = await prisma.storyMacroPlan.upsert({
      where: { novelId },
      create: {
        novelId,
        storyInput: input.storyInput ?? null,
        expansionJson: input.expansion ? JSON.stringify(input.expansion) : null,
        decompositionJson: input.decomposition ? JSON.stringify(input.decomposition) : null,
        issuesJson: JSON.stringify(input.issues ?? []),
        lockedFieldsJson: JSON.stringify(input.lockedFields ?? {}),
        constraintEngineJson: serializeConstraintPayload({
          constraints: nextConstraints,
          constraintEngine: nextConstraintEngine,
        }),
        stateJson: JSON.stringify(input.state ?? EMPTY_STATE),
      },
      update: {
        ...(input.storyInput !== undefined ? { storyInput: input.storyInput } : {}),
        ...(input.expansion !== undefined ? { expansionJson: input.expansion ? JSON.stringify(input.expansion) : null } : {}),
        ...(input.decomposition !== undefined ? { decompositionJson: input.decomposition ? JSON.stringify(input.decomposition) : null } : {}),
        ...(input.issues !== undefined ? { issuesJson: JSON.stringify(input.issues) } : {}),
        ...(input.lockedFields !== undefined ? { lockedFieldsJson: JSON.stringify(input.lockedFields) } : {}),
        ...(input.constraints !== undefined || input.constraintEngine !== undefined
          ? {
              constraintEngineJson: serializeConstraintPayload({
                constraints: nextConstraints,
                constraintEngine: nextConstraintEngine,
              }),
            }
          : {}),
        ...(input.state !== undefined ? { stateJson: JSON.stringify(input.state) } : {}),
      },
    });
    return mapRowToPlan(row);
  }

  private async invokeDecompositionModel(
    storyInput: string,
    projectContext: string,
    options: LLMOptions,
  ): Promise<{ plan: StoryMacroEditablePlan; issues: StoryMacroIssue[] }> {
    const promptInput = {
      storyInput,
      projectContext,
    };
    const contextBlocks = buildStoryMacroDecompositionContextBlocks({
      storyInput,
      projectContext,
    });
    const parsed = await runStructuredPrompt({
      asset: storyMacroDecompositionPrompt,
      promptInput,
      contextBlocks,
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.3,
      },
    }).catch(async (error) => {
      const category = extractStructuredOutputErrorCategory(error instanceof Error ? error.message : String(error));
      if (category !== "transport_error") {
        throw error;
      }
      const prepared = preparePromptExecution({
        asset: storyMacroDecompositionPrompt,
        promptInput,
        contextBlocks,
        options: {
          provider: options.provider,
          model: options.model,
          temperature: options.temperature ?? 0.3,
        },
      });

      try {
        const fallback = await invokeStructuredLlmDetailed({
          messages: prepared.messages,
          schema: storyMacroDecompositionPrompt.outputSchema!,
          provider: options.provider,
          model: options.model,
          temperature: options.temperature ?? 0.3,
          taskType: storyMacroDecompositionPrompt.taskType,
          label: `${storyMacroDecompositionPrompt.id}@${storyMacroDecompositionPrompt.version}`,
          promptMeta: prepared.invocation,
          structuredStrategy: "prompt_json",
          maxRepairAttempts: storyMacroDecompositionPrompt.repairPolicy?.maxAttempts ?? 1,
        });
        return {
          output: fallback.data,
          meta: {
            provider: options.provider,
            model: options.model,
            latencyMs: 0,
            invocation: prepared.invocation,
          },
          context: prepared.context,
        };
      } catch (fallbackError) {
        const fallbackCategory = extractStructuredOutputErrorCategory(
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        );
        if (fallbackCategory !== "transport_error") {
          throw fallbackError;
        }
      }

      const resolved = await resolveLLMClientOptions(options.provider, {
        model: options.model,
        temperature: options.temperature ?? 0.3,
        taskType: storyMacroDecompositionPrompt.taskType,
        promptMeta: prepared.invocation,
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
          messages: toOpenAIChatMessages(prepared.messages),
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Story Macro fallback 请求失败 (${response.status}): ${detail || response.statusText}`);
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
      const repaired = await parseStructuredLlmRawContentDetailed({
        rawContent,
        schema: storyMacroDecompositionPrompt.outputSchema!,
        provider: resolved.provider,
        model: resolved.model,
        apiKey: resolved.apiKey,
        baseURL: resolved.baseURL,
        temperature: resolved.temperature,
        maxTokens: resolved.maxTokens,
        taskType: storyMacroDecompositionPrompt.taskType,
        label: `${storyMacroDecompositionPrompt.id}@${storyMacroDecompositionPrompt.version}.fallback`,
        promptMeta: prepared.invocation,
        strategy: "prompt_json",
        profile: resolveStructuredOutputProfile({
          provider: resolved.provider,
          model: resolved.model,
          baseURL: resolved.baseURL,
          requestProtocol: resolved.requestProtocol,
          executionMode: "structured",
        }),
        maxRepairAttempts: storyMacroDecompositionPrompt.repairPolicy?.maxAttempts ?? 1,
      });
      return {
        output: repaired.data,
        meta: {
          provider: options.provider,
          model: options.model,
          latencyMs: 0,
          invocation: prepared.invocation,
        },
        context: prepared.context,
      };
    });
    return {
      plan: {
        expansion: normalizeExpansion(parsed.output.expansion),
        decomposition: normalizeDecomposition(parsed.output.decomposition),
        constraints: normalizeConstraints(parsed.output.constraints),
      },
      issues: normalizeIssues(parsed.output.issues),
    };
  }

  private async invokeSingleFieldRegeneration(
    field: StoryMacroField,
    storyInput: string,
    plan: StoryMacroEditablePlan,
    lockedFields: StoryMacroLocks,
    options: LLMOptions,
    projectContext: string,
  ): Promise<StoryMacroFieldValue> {
    const parsed = await runStructuredPrompt({
      asset: storyMacroFieldRegenerationPrompt,
      promptInput: {
        field,
        storyInput,
        expansion: plan.expansion,
        decomposition: plan.decomposition,
        constraints: plan.constraints,
        lockedFields,
        projectContext,
      },
      contextBlocks: buildStoryMacroFieldRegenerationContextBlocks({
        field,
        storyInput,
        projectContext,
        expansionSummary: JSON.stringify(plan.expansion ?? {}, null, 2),
        decompositionSummary: JSON.stringify(plan.decomposition, null, 2),
        constraints: plan.constraints,
        lockedFields: Object.entries(lockedFields)
          .filter(([, locked]) => locked)
          .map(([key]) => key),
      }),
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.3,
      },
    });

    return normalizeRegeneratedFieldValue(field, parsed.output.value);
  }

  async getPlan(novelId: string): Promise<StoryMacroPlan | null> {
    await this.getNovelContext(novelId);
    const row = await this.getRow(novelId);
    return row ? mapRowToPlan(row) : null;
  }

  async getState(novelId: string): Promise<StoryMacroState> {
    const plan = await this.getPlan(novelId);
    return plan?.state ?? EMPTY_STATE;
  }

  async decompose(novelId: string, storyInput: string, options: LLMOptions = {}): Promise<StoryMacroPlan> {
    const novel = await this.getNovelContext(novelId);
    const row = await this.getRow(novelId);
    const previousPlan = row ? mapRowToPlan(row) : null;
    const normalizedInput = storyInput.trim();
    if (!normalizedInput) {
      throw new Error("故事想法不能为空。");
    }
    const worldSlice = await this.worldSliceService.ensureStoryWorldSlice(novelId, {
      storyInput: normalizedInput,
      builderMode: "story_macro",
    });
    const projectContext = formatProjectContext(
      novel,
      worldSlice ? formatStoryWorldSlicePromptBlock(worldSlice) : "",
    );
    const generated = await this.invokeDecompositionModel(
      normalizedInput,
      projectContext,
      options,
    );
    const locks = previousPlan?.lockedFields ?? {};
    const merged = mergeLockedFields(generated.plan, previousPlan ? toEditablePlan(previousPlan) : null, locks);
    const constraintEngine = isDecompositionComplete(merged.decomposition)
      ? buildStoryConstraintEngine(merged)
      : null;
    return this.savePlan(novelId, {
      storyInput: normalizedInput,
      expansion: merged.expansion,
      decomposition: merged.decomposition,
      constraints: merged.constraints,
      issues: generated.issues,
      lockedFields: locks,
      constraintEngine,
      state: previousPlan?.state ?? EMPTY_STATE,
    });
  }

  async regenerateField(novelId: string, field: StoryMacroField, options: LLMOptions = {}): Promise<StoryMacroPlan> {
    const novel = await this.getNovelContext(novelId);
    const plan = await this.getPlan(novelId);
    if (!plan?.storyInput || !plan.decomposition) {
      throw new Error("请先完成故事引擎拆解。");
    }
    if (plan.lockedFields[field]) {
      throw new Error("该字段已锁定，请先解锁后再重生成。");
    }
    const worldSlice = await this.worldSliceService.ensureStoryWorldSlice(novelId, {
      storyInput: plan.storyInput ?? undefined,
      builderMode: "story_macro",
    });
    const editablePlan = toEditablePlan(plan);
    const nextFieldValue = await this.invokeSingleFieldRegeneration(
      field,
      plan.storyInput,
      editablePlan,
      plan.lockedFields,
      options,
      formatProjectContext(novel, worldSlice ? formatStoryWorldSlicePromptBlock(worldSlice) : ""),
    );
    const nextPlan = setEditablePlanFieldValue(editablePlan, field, nextFieldValue);
    const constraintEngine = isDecompositionComplete(nextPlan.decomposition)
      ? buildStoryConstraintEngine(nextPlan)
      : null;
    return this.savePlan(novelId, {
      storyInput: plan.storyInput,
      expansion: nextPlan.expansion,
      decomposition: nextPlan.decomposition,
      constraints: nextPlan.constraints,
      issues: plan.issues,
      lockedFields: plan.lockedFields,
      constraintEngine,
      state: plan.state,
    });
  }

  async buildConstraintEngine(novelId: string): Promise<StoryMacroPlan> {
    await this.getNovelContext(novelId);
    const plan = await this.getPlan(novelId);
    if (!plan?.decomposition || !isDecompositionComplete(plan.decomposition)) {
      throw new Error("请先完成故事引擎拆解，再构建约束引擎。");
    }
    const editablePlan = toEditablePlan(plan);
    return this.savePlan(novelId, {
      storyInput: plan.storyInput ?? null,
      expansion: hasMeaningfulExpansion(editablePlan.expansion) ? editablePlan.expansion : null,
      decomposition: editablePlan.decomposition,
      constraints: editablePlan.constraints,
      issues: plan.issues,
      lockedFields: plan.lockedFields,
      constraintEngine: buildStoryConstraintEngine(editablePlan),
      state: plan.state,
    });
  }

  async updatePlan(
    novelId: string,
    input: {
      storyInput?: string | null;
      expansion?: Partial<Omit<StoryExpansion, "conflict_layers">> & {
        conflict_layers?: Partial<StoryExpansion["conflict_layers"]>;
      };
      decomposition?: Partial<StoryDecomposition>;
      constraints?: string[];
      lockedFields?: StoryMacroLocks;
    },
  ): Promise<StoryMacroPlan> {
    await this.getNovelContext(novelId);
    const row = await this.getRow(novelId);
    const previousPlan = row ? mapRowToPlan(row) : null;
    const nextStoryInput = input.storyInput !== undefined
      ? (input.storyInput?.trim() || null)
      : (previousPlan?.storyInput ?? null);
    const nextLockedFields = {
      ...(previousPlan?.lockedFields ?? {}),
      ...(input.lockedFields ?? {}),
    };
    const previousEditablePlan = previousPlan ? toEditablePlan(previousPlan) : null;
    const nextEditablePlan: StoryMacroEditablePlan = {
      expansion: normalizeExpansion({
        ...(previousEditablePlan?.expansion ?? EMPTY_EXPANSION),
        ...(input.expansion ?? {}),
      }),
      decomposition: normalizeDecomposition({
        ...(previousEditablePlan?.decomposition ?? EMPTY_DECOMPOSITION),
        ...(input.decomposition ?? {}),
      }),
      constraints: input.constraints !== undefined
        ? normalizeConstraints(input.constraints)
        : (previousEditablePlan?.constraints ?? []),
    };
    const nextExpansion = hasMeaningfulExpansion(nextEditablePlan.expansion) ? nextEditablePlan.expansion : null;
    const nextDecomposition = hasMeaningfulDecomposition(nextEditablePlan.decomposition) ? nextEditablePlan.decomposition : null;
    const nextConstraintEngine = nextDecomposition && isDecompositionComplete(nextDecomposition) && nextExpansion
      ? buildStoryConstraintEngine(nextEditablePlan)
      : (previousPlan?.constraintEngine ?? null);

    return this.savePlan(novelId, {
      storyInput: nextStoryInput,
      expansion: nextExpansion,
      decomposition: nextDecomposition,
      constraints: nextEditablePlan.constraints,
      issues: previousPlan?.issues ?? [],
      lockedFields: nextLockedFields,
      constraintEngine: nextConstraintEngine,
      state: previousPlan?.state ?? EMPTY_STATE,
    });
  }

  async updateState(
    novelId: string,
    state: Partial<StoryMacroState>,
  ): Promise<StoryMacroState> {
    await this.getNovelContext(novelId);
    const plan = await this.getPlan(novelId);
    const constraintEngine = plan?.constraintEngine ?? null;
    const phaseCount = constraintEngine?.phase_model.length ?? 5;
    const nextState: StoryMacroState = {
      currentPhase: Math.max(0, Math.min(phaseCount - 1, Math.floor(state.currentPhase ?? plan?.state.currentPhase ?? 0))),
      progress: Math.max(0, Math.min(100, Math.floor(state.progress ?? plan?.state.progress ?? 0))),
      protagonistState: (state.protagonistState ?? plan?.state.protagonistState ?? "").trim(),
    };
    await this.savePlan(novelId, {
      storyInput: plan?.storyInput ?? null,
      expansion: plan?.expansion ?? null,
      decomposition: plan?.decomposition ?? null,
      constraints: plan?.constraints ?? [],
      issues: plan?.issues ?? [],
      lockedFields: plan?.lockedFields ?? {},
      constraintEngine,
      state: nextState,
    });
    return nextState;
  }
}
