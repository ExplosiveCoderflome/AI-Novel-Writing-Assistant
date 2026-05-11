import type {
  AntiAiEffectiveRuleItem,
  AntiAiEffectiveRulesResult,
  AntiAiRule,
  StyleBinding,
  StyleProfile,
} from "@ai-novel/shared/types/styleEngine";
import { prisma } from "../../db/prisma";
import { ensureStyleEngineSeedData } from "./StyleEngineSeedService";
import { mapAntiAiRuleRow, mapStyleProfileRow } from "./helpers";

const TARGET_PRIORITY: Record<StyleBinding["targetType"], number> = {
  novel: 1,
  chapter: 2,
  task: 3,
};

function sortEffectiveBindings(bindings: StyleBinding[]): StyleBinding[] {
  return bindings.slice().sort((left, right) => {
    const targetDiff = TARGET_PRIORITY[right.targetType] - TARGET_PRIORITY[left.targetType];
    if (targetDiff !== 0) {
      return targetDiff;
    }
    return right.priority - left.priority;
  });
}

function dedupeEffectiveRules(items: AntiAiEffectiveRuleItem[]): AntiAiEffectiveRuleItem[] {
  const seen = new Set<string>();
  const result: AntiAiEffectiveRuleItem[] = [];
  for (const item of items) {
    if (seen.has(item.rule.id)) {
      continue;
    }
    seen.add(item.rule.id);
    result.push(item);
  }
  return result;
}

function selectEnabledRules(rules: AntiAiRule[]): AntiAiRule[] {
  return rules.filter((rule) => rule.enabled);
}

export class AntiAiPolicyResolver {
  async listGlobalBaselineRules(): Promise<AntiAiRule[]> {
    await ensureStyleEngineSeedData();
    const rows = await prisma.antiAiRule.findMany({
      where: {
        enabled: true,
        globalBaselineEnabled: true,
      },
      orderBy: [{ type: "asc" }, { severity: "desc" }, { name: "asc" }],
    });
    return rows.map((row) => mapAntiAiRuleRow(row));
  }

  async resolveFromBindings(input: {
    matchedBindings: StyleBinding[];
    effectiveStyleProfileId?: string | null;
  }): Promise<AntiAiEffectiveRulesResult> {
    const baselineRules = await this.listGlobalBaselineRules();
    const globalBaselineRules = baselineRules.map((rule): AntiAiEffectiveRuleItem => ({
      rule,
      source: "global_baseline",
      sourceLabel: "全局默认",
      styleProfileId: null,
      styleProfileName: null,
      bindingTargetType: null,
      bindingTargetId: null,
      weight: 1,
    }));

    const styleRulesById = new Map<string, AntiAiEffectiveRuleItem>();
    for (const binding of sortEffectiveBindings(input.matchedBindings)) {
      const profile = binding.styleProfile;
      if (!profile) {
        continue;
      }
      for (const rule of selectEnabledRules(profile.antiAiRules)) {
        const existing = styleRulesById.get(rule.id);
        if (existing && existing.weight >= binding.weight) {
          continue;
        }
        styleRulesById.set(rule.id, {
          rule,
          source: "style_profile",
          sourceLabel: profile.name,
          styleProfileId: profile.id,
          styleProfileName: profile.name,
          bindingTargetType: binding.targetType,
          bindingTargetId: binding.targetId,
          weight: binding.weight,
        });
      }
    }

    const styleSpecificRules = Array.from(styleRulesById.values());
    const effectiveRules = dedupeEffectiveRules([
      ...globalBaselineRules,
      ...styleSpecificRules,
    ]);

    return {
      globalBaselineRules,
      styleSpecificRules,
      effectiveRules,
      effectiveStyleProfileId: input.effectiveStyleProfileId ?? null,
      usesGlobalAntiAiBaseline: globalBaselineRules.length > 0,
    };
  }

  async resolveEffectiveRules(input: {
    novelId?: string;
    chapterId?: string;
    styleProfileId?: string;
    taskStyleProfileId?: string;
  }): Promise<AntiAiEffectiveRulesResult> {
    await ensureStyleEngineSeedData();

    if (input.styleProfileId?.trim()) {
      const profile = await this.getStyleProfile(input.styleProfileId.trim());
      return this.resolveFromBindings({
        matchedBindings: profile ? [this.buildTaskBinding(profile, input.styleProfileId.trim())] : [],
        effectiveStyleProfileId: profile?.id ?? null,
      });
    }

    const matchedBindings = input.novelId?.trim()
      ? await this.listContextBindings({
        novelId: input.novelId.trim(),
        chapterId: input.chapterId?.trim() || undefined,
      })
      : [];

    if (input.taskStyleProfileId?.trim()) {
      const profile = await this.getStyleProfile(input.taskStyleProfileId.trim());
      if (profile) {
        matchedBindings.push(this.buildTaskBinding(profile, input.chapterId?.trim() || input.novelId?.trim() || profile.id));
      }
    }

    const effectiveBinding = sortEffectiveBindings(matchedBindings)[0] ?? null;
    return this.resolveFromBindings({
      matchedBindings,
      effectiveStyleProfileId: effectiveBinding?.styleProfileId ?? null,
    });
  }

  private async listContextBindings(input: { novelId: string; chapterId?: string }): Promise<StyleBinding[]> {
    const rows = await prisma.styleBinding.findMany({
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

  private async getStyleProfile(styleProfileId: string) {
    const row = await prisma.styleProfile.findUnique({
      where: { id: styleProfileId },
      include: {
        antiAiBindings: {
          where: { enabled: true },
          include: { antiAiRule: true },
        },
      },
    });
    return row ? mapStyleProfileRow(row) : null;
  }

  private buildTaskBinding(
    profile: StyleProfile,
    targetId: string,
  ): StyleBinding {
    const timestamp = new Date().toISOString();
    return {
      id: `task_${profile.id}`,
      styleProfileId: profile.id,
      targetType: "task",
      targetId,
      priority: 999,
      weight: 1,
      enabled: true,
      styleProfile: profile,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }
}
