import type { ResolvedStyleContext, StyleBinding, StyleProfile, StyleRuleSet } from "@ai-novel/shared/types/styleEngine";
import { prisma } from "../../db/prisma";
import { StyleCompiler } from "./StyleCompiler";
import { ensureStyleEngineSeedData } from "./StyleEngineSeedService";
import {
  buildEmptyRuleSet,
  clamp,
  mapAntiAiRuleRow,
  mapStyleProfileRow,
  mergeRuleObjects,
} from "./helpers";

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

export class StyleBindingService {
  private readonly compiler = new StyleCompiler();

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

    if (matchedBindings.length === 0) {
      return {
        matchedBindings: [],
        compiledBlocks: null,
      };
    }

    const ordered = [...matchedBindings].sort((left, right) => {
      const targetPriorityDiff = TARGET_PRIORITY[left.targetType] - TARGET_PRIORITY[right.targetType];
      if (targetPriorityDiff !== 0) {
        return targetPriorityDiff;
      }
      return left.priority - right.priority;
    });

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

    const antiRulesById = new Map<string, { rule: ReturnType<typeof mapAntiAiRuleRow>; weight: number }>();
    for (const binding of ordered) {
      for (const rule of binding.styleProfile?.antiAiRules ?? []) {
        const existing = antiRulesById.get(rule.id);
        if (!existing || binding.weight >= existing.weight) {
          antiRulesById.set(rule.id, { rule, weight: binding.weight });
        }
      }
    }

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
      antiAiRules: Array.from(antiRulesById.values()).map((item) => item.rule),
      weight: mergedWeight,
      appliedRuleIds: Array.from(antiRulesById.keys()),
      bindingSummaries: ordered.map((binding) => ({
        styleProfileId: binding.styleProfileId,
        styleProfileName: binding.styleProfile?.name ?? null,
        targetType: binding.targetType,
        priority: binding.priority,
        weight: binding.weight,
      })),
      sectionWeights,
      antiAiRuleWeights: Array.from(antiRulesById.entries()).reduce<Record<string, number>>((acc, [ruleId, item]) => {
        acc[ruleId] = item.weight;
        return acc;
      }, {}),
    });

    return {
      matchedBindings: matchedBindings.sort((left, right) => {
        const targetDiff = TARGET_PRIORITY[right.targetType] - TARGET_PRIORITY[left.targetType];
        if (targetDiff !== 0) {
          return targetDiff;
        }
        return right.priority - left.priority;
      }),
      compiledBlocks,
    };
  }
}
