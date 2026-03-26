import type { LLMProvider } from "@ai-novel/shared/types/llm";
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
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  storyMacroDecompositionPrompt,
  storyMacroFieldRegenerationPrompt,
} from "../../../prompting/prompts/novel/storyMacro.prompts";
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
    const parsed = await runStructuredPrompt({
      asset: storyMacroDecompositionPrompt,
      promptInput: {
        storyInput,
        projectContext,
      },
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.3,
      },
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
