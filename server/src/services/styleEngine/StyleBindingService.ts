import type { ResolvedStyleContext, StyleBinding, StyleProfile, StyleRuleSet } from "@ai-novel/shared/types/styleEngine";
import { prisma } from "../../db/prisma";
import { AntiAiPolicyResolver } from "./AntiAiPolicyResolver";
import { StyleCompiler } from "./StyleCompiler";
import { ensureStyleEngineSeedData } from "./StyleEngineSeedService";
import {
  buildEmptyRuleSet,
  clamp,
  mapStyleProfileRow,
  mergeRuleObjects,
} from "./helpers";
import { sanitizeStyleContextForGeneration } from "./styleGenerationSanitizer";

const TARGET_PRIORITY: Record<StyleBinding["targetType"], number> = {
  novel: 1,
  chapter: 2,
  task: 3,
};

type StyleSectionKey = keyof StyleRuleSet;
type RuleWeightMap = Record<StyleSectionKey, Record<string, number>>;

function buildEmptyRuleWeightMap(): RuleWeightMap {
  return {
    narrativeRules: {},
    characterRules: {},
    languageRules: {},
    rhythmRules: {},
  };
}

function assignRuleWeights(
  target: RuleWeightMap,
  section: StyleSectionKey,
  rules: Record<string, unknown>,
  weight: number,
): void {
  for (const [key, value] of Object.entries(rules)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    target[section][key] = weight;
  }
}

function sortMatchedBindings(bindings: StyleBinding[]): StyleBinding[] {
  return bindings.slice().sort((left, right) => {
    const targetDiff = TARGET_PRIORITY[right.targetType] - TARGET_PRIORITY[left.targetType];
    if (targetDiff !== 0) {
      return targetDiff;
    }
    return right.priority - left.priority;
  });
}

export class StyleBindingService {
  private readonly compiler = new StyleCompiler();
  private readonly antiAiPolicyResolver = new AntiAiPolicyResolver();

  async listBindings(filter?: Partial<Pick<StyleBinding, "targetType" | "targetId" | "styleProfileId">>): Promise<StyleBinding[]> {
    await ensureStyleEngineSeedData();
    const rows = await prisma.styleBinding.findMany({
      where: {
        targetType: filter?.targetType,
        targetId: filter?.targetId,
        styleProfileId: filter?.styleProfileId,
      },
      include: {
        styleProfile: {
          include: {
            antiAiBindings: {
              include: { antiAiRule: true },
            },
          },
        },
      },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    });

    return rows.map((row) => ({
      id: row.id,
      styleProfileId: row.styleProfileId,
      targetType: row.targetType,
      targetId: row.targetId,
      priority: row.priority,
      weight: row.weight,
      enabled: row.enabled,
      styleProfile: mapStyleProfileRow(row.styleProfile),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async createBinding(input: Pick<StyleBinding, "styleProfileId" | "targetType" | "targetId" | "priority" | "weight" | "enabled">): Promise<StyleBinding> {
    const row = await prisma.styleBinding.create({
      data: input,
      include: {
        styleProfile: {
          include: {
            antiAiBindings: {
              include: { antiAiRule: true },
            },
          },
        },
      },
    });

    return {
      id: row.id,
      styleProfileId: row.styleProfileId,
      targetType: row.targetType,
      targetId: row.targetId,
      priority: row.priority,
      weight: row.weight,
      enabled: row.enabled,
      styleProfile: mapStyleProfileRow(row.styleProfile),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async deleteBinding(id: string): Promise<void> {
    await prisma.styleBinding.delete({ where: { id } });
  }

  async resolveForGeneration(input: {
    novelId: string;
    chapterId?: string;
    taskStyleProfileId?: string;
  }): Promise<ResolvedStyleContext> {
    await ensureStyleEngineSeedData();

    const activePatches = await prisma.stylePatch.findMany({
      where: {
        novelId: input.novelId,
        enabled: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    const applyPatches = (blocks: any) => {
      if (!blocks || activePatches.length === 0) return;
      const patchLines = activePatches.map(
        (p) => `- Style Patch [${p.ruleKey}] (Violations: ${p.violationCount}): ${p.promptInstruction}`
      );
      const patchText = "\n\nRuntime Style Correction Patches:\n" + patchLines.join("\n");
      blocks.antiAi += patchText;
      if (blocks.contract?.antiAi) {
        blocks.contract.antiAi.lines.push(...patchLines);
        blocks.contract.antiAi.text += patchText;
      }
    };

    const bindings = await prisma.styleBinding.findMany({
      where: {
        enabled: true,
        OR: [
          { targetType: "novel", targetId: input.novelId },
          ...(input.chapterId ? [{ targetType: "chapter" as const, targetId: input.chapterId }] : []),
        ],
      },
      include: {
        styleProfile: {
          include: {
            antiAiBindings: {
              where: { enabled: true },
              include: { antiAiRule: true },
            },
          },
        },
      },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    });

    const matchedBindings: StyleBinding[] = bindings.map((row) => ({
      id: row.id,
      styleProfileId: row.styleProfileId,
      targetType: row.targetType,
      targetId: row.targetId,
      priority: row.priority,
      weight: row.weight,
      enabled: row.enabled,
      styleProfile: mapStyleProfileRow(row.styleProfile),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));

    if (input.taskStyleProfileId) {
      const profileRow = await prisma.styleProfile.findUnique({
        where: { id: input.taskStyleProfileId },
        include: {
          antiAiBindings: {
            where: { enabled: true },
            include: { antiAiRule: true },
          },
        },
      });

      if (profileRow) {
        matchedBindings.push({
          id: `task_${profileRow.id}`,
          styleProfileId: profileRow.id,
          targetType: "task",
          targetId: input.chapterId ?? input.novelId,
          priority: 999,
          weight: 1,
          enabled: true,
          styleProfile: mapStyleProfileRow(profileRow),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    const ordered = matchedBindings.slice().sort((left, right) => {
      const targetPriorityDiff = TARGET_PRIORITY[left.targetType] - TARGET_PRIORITY[right.targetType];
      if (targetPriorityDiff !== 0) {
        return targetPriorityDiff;
      }
      return left.priority - right.priority;
    });
    const effectiveBinding = sortMatchedBindings(matchedBindings)[0] ?? null;
    const sourceTargets = Array.from(new Set(ordered.map((binding) => binding.targetType)));
    const sourceLabels = sourceTargets.map((targetType) => targetType.toUpperCase());
    const antiAiPolicy = await this.antiAiPolicyResolver.resolveFromBindings({
      matchedBindings,
      effectiveStyleProfileId: effectiveBinding?.styleProfileId ?? null,
    });
    const baselineRules = antiAiPolicy.globalBaselineRules.map((item) => item.rule);

    if (matchedBindings.length === 0) {
      if (baselineRules.length === 0) {
        return sanitizeStyleContextForGeneration({
          matchedBindings: [],
          compiledBlocks: null,
          effectiveStyleProfileId: null,
          taskStyleProfileId: input.taskStyleProfileId?.trim() || null,
          activeSourceTargets: [],
          activeSourceLabels: [],
          maturity: "summary_only",
          usesGlobalAntiAiBaseline: false,
          globalAntiAiRuleIds: [],
          styleAntiAiRuleIds: [],
        });
      }

      const compiledBlocks = this.compiler.compile({
        styleProfile: buildEmptyRuleSet(),
        antiAiRules: baselineRules,
        weight: 1,
        appliedRuleIds: baselineRules.map((rule) => rule.id),
        taskStyleProfileId: input.taskStyleProfileId?.trim() || null,
        activeSourceTargets: [],
        activeSourceLabels: ["GLOBAL_BASELINE"],
        usesGlobalAntiAiBaseline: true,
        globalAntiAiRuleIds: baselineRules.map((rule) => rule.id),
        styleAntiAiRuleIds: [],
      });

      applyPatches(compiledBlocks);

      return sanitizeStyleContextForGeneration({
        matchedBindings: [],
        compiledBlocks,
        effectiveStyleProfileId: null,
        taskStyleProfileId: input.taskStyleProfileId?.trim() || null,
        activeSourceTargets: [],
        activeSourceLabels: ["GLOBAL_BASELINE"],
        maturity: compiledBlocks.contract.meta.maturity,
        usesGlobalAntiAiBaseline: true,
        globalAntiAiRuleIds: baselineRules.map((rule) => rule.id),
        styleAntiAiRuleIds: [],
      });
    }

    const mergedRules = ordered.reduce<StyleRuleSet>((acc, binding) => {
      const profile = binding.styleProfile as StyleProfile | undefined;
      if (!profile) {
        return acc;
      }
      return {
        narrativeRules: mergeRuleObjects(acc.narrativeRules, profile.narrativeRules),
        characterRules: mergeRuleObjects(acc.characterRules, profile.characterRules),
        languageRules: mergeRuleObjects(acc.languageRules, profile.languageRules),
        rhythmRules: mergeRuleObjects(acc.rhythmRules, profile.rhythmRules),
      };
    }, buildEmptyRuleSet());

    const sectionWeights = ordered.reduce<RuleWeightMap>((acc, binding) => {
      const profile = binding.styleProfile as StyleProfile | undefined;
      if (!profile) {
        return acc;
      }
      assignRuleWeights(acc, "narrativeRules", profile.narrativeRules, binding.weight);
      assignRuleWeights(acc, "characterRules", profile.characterRules, binding.weight);
      assignRuleWeights(acc, "languageRules", profile.languageRules, binding.weight);
      assignRuleWeights(acc, "rhythmRules", profile.rhythmRules, binding.weight);
      return acc;
    }, buildEmptyRuleWeightMap());

    const styleSpecificRules = antiAiPolicy.styleSpecificRules.map((item) => item.rule);
    const styleSpecificWeights = new Map(antiAiPolicy.styleSpecificRules.map((item) => [item.rule.id, item.weight]));
    const combinedAntiAiRules = antiAiPolicy.effectiveRules.map((item) => item.rule);
    const combinedRuleWeights = combinedAntiAiRules.reduce<Record<string, number>>((acc, rule) => {
      if (styleSpecificWeights.has(rule.id)) {
        acc[rule.id] = styleSpecificWeights.get(rule.id)!;
      } else {
        acc[rule.id] = 1;
      }
      return acc;
    }, {});

    const totalSpecificity = ordered.reduce((sum, item) => sum + TARGET_PRIORITY[item.targetType], 0);
    const weightedStrength = ordered.reduce(
      (sum, item) => sum + (item.weight * TARGET_PRIORITY[item.targetType]),
      0,
    );
    const mergedWeight = clamp(
      totalSpecificity > 0 ? weightedStrength / totalSpecificity : 1,
      0.3,
      1,
    );

    const compiledBlocks = this.compiler.compile({
      styleProfile: mergedRules,
      antiAiRules: combinedAntiAiRules,
      weight: mergedWeight,
      appliedRuleIds: combinedAntiAiRules.map((rule) => rule.id),
      bindingSummaries: ordered.map((binding) => ({
        styleProfileId: binding.styleProfileId,
        styleProfileName: binding.styleProfile?.name ?? null,
        targetType: binding.targetType,
        priority: binding.priority,
        weight: binding.weight,
      })),
      sectionWeights,
      antiAiRuleWeights: combinedRuleWeights,
      effectiveStyleProfileId: effectiveBinding?.styleProfileId ?? null,
      taskStyleProfileId: input.taskStyleProfileId?.trim() || null,
      activeSourceTargets: sourceTargets,
      activeSourceLabels: sourceLabels,
      usesGlobalAntiAiBaseline: baselineRules.length > 0,
      globalAntiAiRuleIds: baselineRules.map((rule) => rule.id),
      styleAntiAiRuleIds: styleSpecificRules.map((rule) => rule.id),
    });

    applyPatches(compiledBlocks);

    return sanitizeStyleContextForGeneration({
      matchedBindings: sortMatchedBindings(matchedBindings),
      compiledBlocks,
      effectiveStyleProfileId: effectiveBinding?.styleProfileId ?? null,
      taskStyleProfileId: input.taskStyleProfileId?.trim() || null,
      activeSourceTargets: sourceTargets,
      activeSourceLabels: sourceLabels,
      maturity: compiledBlocks.contract.meta.maturity,
      usesGlobalAntiAiBaseline: baselineRules.length > 0,
      globalAntiAiRuleIds: baselineRules.map((rule) => rule.id),
      styleAntiAiRuleIds: styleSpecificRules.map((rule) => rule.id),
    });
  }
}
