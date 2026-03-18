import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  StoryConstraintEngine,
  StoryDecomposition,
  StoryExpansion,
  StoryMacroField,
  StoryMacroIssue,
  StoryMacroLocks,
  StoryMacroPlan,
  StoryMacroState,
} from "@ai-novel/shared/types/storyMacro";
import { prisma } from "../../../db/prisma";
import { getLLM } from "../../../llm/factory";
import {
  EMPTY_STATE,
  STORY_MACRO_RESPONSE_SCHEMA,
  buildConstraintEngine,
  buildExpansionAndDecompositionPrompt,
  buildFieldRegenerationPrompt,
  extractJSONObject,
  isDecompositionComplete,
  mergeLockedFields,
  normalizeDecomposition,
  normalizeExpansion,
  normalizeIssues,
  safeParseJSON,
  toText,
} from "./storyMacroPlanUtils";

interface LLMOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

interface PersistedPlanRow {
  id: string;
  novelId: string;
  storyInput: string | null;
  expansionJson: string | null;
  decompositionJson: string | null;
  issuesJson: string | null;
  lockedFieldsJson: string | null;
  constraintEngineJson: string | null;
  stateJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapRowToPlan(row: PersistedPlanRow): StoryMacroPlan {
  return {
    id: row.id,
    novelId: row.novelId,
    storyInput: row.storyInput,
    expansion: safeParseJSON<StoryExpansion | null>(row.expansionJson, null),
    decomposition: safeParseJSON<StoryDecomposition | null>(row.decompositionJson, null),
    issues: safeParseJSON<StoryMacroIssue[]>(row.issuesJson, []),
    lockedFields: safeParseJSON<StoryMacroLocks>(row.lockedFieldsJson, {}),
    constraintEngine: safeParseJSON<StoryConstraintEngine | null>(row.constraintEngineJson, null),
    state: safeParseJSON<StoryMacroState>(row.stateJson, EMPTY_STATE),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class StoryMacroPlanService {
  private async ensureNovelExists(novelId: string): Promise<void> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true },
    });
    if (!novel) {
      throw new Error("小说不存在。");
    }
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
      issues?: StoryMacroIssue[];
      lockedFields?: StoryMacroLocks;
      constraintEngine?: StoryConstraintEngine | null;
      state?: StoryMacroState;
    },
  ): Promise<StoryMacroPlan> {
    const row = await prisma.storyMacroPlan.upsert({
      where: { novelId },
      create: {
        novelId,
        storyInput: input.storyInput ?? null,
        expansionJson: input.expansion ? JSON.stringify(input.expansion) : null,
        decompositionJson: input.decomposition ? JSON.stringify(input.decomposition) : null,
        issuesJson: input.issues ? JSON.stringify(input.issues) : JSON.stringify([]),
        lockedFieldsJson: JSON.stringify(input.lockedFields ?? {}),
        constraintEngineJson: input.constraintEngine ? JSON.stringify(input.constraintEngine) : null,
        stateJson: JSON.stringify(input.state ?? EMPTY_STATE),
      },
      update: {
        ...(input.storyInput !== undefined ? { storyInput: input.storyInput } : {}),
        ...(input.expansion !== undefined ? { expansionJson: input.expansion ? JSON.stringify(input.expansion) : null } : {}),
        ...(input.decomposition !== undefined ? { decompositionJson: input.decomposition ? JSON.stringify(input.decomposition) : null } : {}),
        ...(input.issues !== undefined ? { issuesJson: JSON.stringify(input.issues) } : {}),
        ...(input.lockedFields !== undefined ? { lockedFieldsJson: JSON.stringify(input.lockedFields) } : {}),
        ...(input.constraintEngine !== undefined ? { constraintEngineJson: input.constraintEngine ? JSON.stringify(input.constraintEngine) : null } : {}),
        ...(input.state !== undefined ? { stateJson: JSON.stringify(input.state) } : {}),
      },
    });
    return mapRowToPlan(row);
  }

  private async invokeDecompositionModel(
    storyInput: string,
    options: LLMOptions,
  ): Promise<{ expansion: StoryExpansion; decomposition: StoryDecomposition; issues: StoryMacroIssue[] }> {
    const llm = await getLLM(options.provider, {
      fallbackProvider: "deepseek",
      model: options.model,
      temperature: options.temperature ?? 0.3,
      maxTokens: 1800,
      taskType: "planner",
    });
    const prompt = buildExpansionAndDecompositionPrompt(storyInput);
    const result = await llm.invoke([
      new SystemMessage(prompt.system),
      new HumanMessage(prompt.user),
    ]);
    const parsed = STORY_MACRO_RESPONSE_SCHEMA.parse(JSON.parse(extractJSONObject(toText(result.content))));
    return {
      expansion: normalizeExpansion({
        expanded_premise: parsed.expansion.expanded_premise,
        protagonist_core: parsed.expansion.protagonist_core,
        conflict_layers: parsed.expansion.conflict_layers,
        emotional_line: parsed.expansion.emotional_line,
        setpiece_seeds: parsed.expansion.setpiece_seeds,
        tone_reference: parsed.expansion.tone_reference,
      }),
      decomposition: normalizeDecomposition({
        selling_point: parsed.decomposition.selling_point,
        core_conflict: parsed.decomposition.core_conflict,
        main_hook: parsed.decomposition.main_hook,
        growth_path: parsed.decomposition.growth_path,
        major_payoffs: parsed.decomposition.major_payoffs,
        ending_flavor: parsed.decomposition.ending_flavor,
      }),
      issues: normalizeIssues(parsed.issues),
    };
  }

  private async invokeSingleFieldRegeneration(
    field: StoryMacroField,
    storyInput: string,
    expansion: StoryExpansion | null,
    decomposition: StoryDecomposition,
    lockedFields: StoryMacroLocks,
    options: LLMOptions,
  ): Promise<StoryDecomposition[StoryMacroField]> {
    const llm = await getLLM(options.provider, {
      fallbackProvider: "deepseek",
      model: options.model,
      temperature: options.temperature ?? 0.3,
      maxTokens: 800,
      taskType: "planner",
    });
    const prompt = buildFieldRegenerationPrompt({
      field,
      storyInput,
      expansion,
      decomposition,
      lockedFields,
    });
    const result = await llm.invoke([
      new SystemMessage(prompt.system),
      new HumanMessage(prompt.user),
    ]);

    const parsed = JSON.parse(extractJSONObject(toText(result.content))) as { value?: unknown };
    if (field === "major_payoffs") {
      const arrayValue = Array.isArray(parsed.value)
        ? parsed.value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).slice(0, 5)
        : [];
      if (arrayValue.length === 0) {
        throw new Error("AI 未返回有效的关键爆点列表。");
      }
      return arrayValue;
    }
    if (typeof parsed.value !== "string" || !parsed.value.trim()) {
      throw new Error(`AI 未返回有效的 ${field}。`);
    }
    return parsed.value.trim();
  }

  async getPlan(novelId: string): Promise<StoryMacroPlan | null> {
    await this.ensureNovelExists(novelId);
    const row = await this.getRow(novelId);
    return row ? mapRowToPlan(row) : null;
  }

  async getState(novelId: string): Promise<StoryMacroState> {
    const plan = await this.getPlan(novelId);
    return plan?.state ?? EMPTY_STATE;
  }

  async decompose(novelId: string, storyInput: string, options: LLMOptions = {}): Promise<StoryMacroPlan> {
    await this.ensureNovelExists(novelId);
    const row = await this.getRow(novelId);
    const previousPlan = row ? mapRowToPlan(row) : null;
    const normalizedInput = storyInput.trim();
    if (!normalizedInput) {
      throw new Error("故事想法不能为空。");
    }
    const generated = await this.invokeDecompositionModel(normalizedInput, options);
    const locks = previousPlan?.lockedFields ?? {};
    const merged = mergeLockedFields(generated.decomposition, previousPlan?.decomposition ?? null, locks);
    const constraintEngine = buildConstraintEngine(merged);
    return this.savePlan(novelId, {
      storyInput: normalizedInput,
      expansion: generated.expansion,
      decomposition: merged,
      issues: generated.issues,
      lockedFields: locks,
      constraintEngine,
      state: previousPlan?.state ?? EMPTY_STATE,
    });
  }

  async regenerateField(novelId: string, field: StoryMacroField, options: LLMOptions = {}): Promise<StoryMacroPlan> {
    await this.ensureNovelExists(novelId);
    const plan = await this.getPlan(novelId);
    if (!plan?.storyInput || !plan.decomposition) {
      throw new Error("请先完成故事拆解。");
    }
    if (plan.lockedFields[field]) {
      throw new Error("该字段已锁定，请先解锁后再重生成。");
    }
    const nextFieldValue = await this.invokeSingleFieldRegeneration(
      field,
      plan.storyInput,
      plan.expansion ?? null,
      plan.decomposition,
      plan.lockedFields,
      options,
    );
    const nextDecomposition = normalizeDecomposition({
      ...plan.decomposition,
      [field]: nextFieldValue,
    });
    return this.savePlan(novelId, {
      storyInput: plan.storyInput,
      expansion: plan.expansion ?? null,
      decomposition: nextDecomposition,
      issues: plan.issues,
      lockedFields: plan.lockedFields,
      constraintEngine: buildConstraintEngine(nextDecomposition),
      state: plan.state,
    });
  }

  async buildConstraintEngine(novelId: string): Promise<StoryMacroPlan> {
    await this.ensureNovelExists(novelId);
    const plan = await this.getPlan(novelId);
    if (!plan?.decomposition || !isDecompositionComplete(plan.decomposition)) {
      throw new Error("请先完成故事拆解，再构建约束引擎。");
    }
    return this.savePlan(novelId, {
      storyInput: plan.storyInput ?? null,
      expansion: plan.expansion ?? null,
      decomposition: plan.decomposition,
      issues: plan.issues,
      lockedFields: plan.lockedFields,
      constraintEngine: buildConstraintEngine(plan.decomposition),
      state: plan.state,
    });
  }

  async updatePlan(
    novelId: string,
    input: {
      storyInput?: string | null;
      decomposition?: Partial<StoryDecomposition>;
      lockedFields?: StoryMacroLocks;
    },
  ): Promise<StoryMacroPlan> {
    await this.ensureNovelExists(novelId);
    const row = await this.getRow(novelId);
    const previousPlan = row ? mapRowToPlan(row) : null;
    const nextStoryInput = input.storyInput !== undefined
      ? (input.storyInput?.trim() || null)
      : (previousPlan?.storyInput ?? null);
    const nextLockedFields = {
      ...(previousPlan?.lockedFields ?? {}),
      ...(input.lockedFields ?? {}),
    };
    const nextDecomposition = previousPlan?.decomposition
      ? normalizeDecomposition({
          ...previousPlan.decomposition,
          ...(input.decomposition ?? {}),
          major_payoffs: input.decomposition?.major_payoffs ?? previousPlan.decomposition.major_payoffs,
        })
      : (
        input.decomposition && isDecompositionComplete(input.decomposition)
          ? normalizeDecomposition(input.decomposition)
          : null
      );
    const nextConstraintEngine = nextDecomposition && isDecompositionComplete(nextDecomposition)
      ? buildConstraintEngine(nextDecomposition)
      : (previousPlan?.constraintEngine ?? null);

    return this.savePlan(novelId, {
      storyInput: nextStoryInput,
      expansion: previousPlan?.expansion ?? null,
      decomposition: nextDecomposition,
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
    await this.ensureNovelExists(novelId);
    const plan = await this.getPlan(novelId);
    const constraintEngine = plan?.constraintEngine ?? null;
    const phaseCount = constraintEngine?.phase_model.length ?? 4;
    const nextState: StoryMacroState = {
      currentPhase: Math.max(0, Math.min(phaseCount - 1, Math.floor(state.currentPhase ?? plan?.state.currentPhase ?? 0))),
      progress: Math.max(0, Math.min(100, Math.floor(state.progress ?? plan?.state.progress ?? 0))),
      protagonistState: (state.protagonistState ?? plan?.state.protagonistState ?? "").trim(),
    };
    await this.savePlan(novelId, {
      storyInput: plan?.storyInput ?? null,
      expansion: plan?.expansion ?? null,
      decomposition: plan?.decomposition ?? null,
      issues: plan?.issues ?? [],
      lockedFields: plan?.lockedFields ?? {},
      constraintEngine,
      state: nextState,
    });
    return nextState;
  }
}
