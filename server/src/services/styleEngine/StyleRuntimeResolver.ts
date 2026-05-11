import type { AntiAiRule, ResolvedStyleContext, StyleBinding, StyleProfile } from "@ai-novel/shared/types/styleEngine";
import { AntiAiPolicyResolver } from "./AntiAiPolicyResolver";
import { StyleBindingService } from "./StyleBindingService";
import { StyleCompiler } from "./StyleCompiler";
import { StyleProfileService } from "./StyleProfileService";

function buildDirectTaskBinding(profile: StyleProfile): StyleBinding {
  const timestamp = new Date().toISOString();
  return {
    id: `task_${profile.id}`,
    styleProfileId: profile.id,
    targetType: "task",
    targetId: profile.id,
    priority: 999,
    weight: 1,
    enabled: true,
    styleProfile: profile,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export class StyleRuntimeResolver {
  private readonly bindingService = new StyleBindingService();
  private readonly profileService = new StyleProfileService();
  private readonly compiler = new StyleCompiler();
  private readonly antiAiPolicyResolver = new AntiAiPolicyResolver();

  async resolve(input: {
    styleProfileId?: string;
    novelId?: string;
    chapterId?: string;
    taskStyleProfileId?: string;
  }): Promise<{ context: ResolvedStyleContext; antiAiRules: AntiAiRule[]; primaryProfile: StyleProfile | null }> {
    if (input.styleProfileId) {
      const profile = await this.profileService.getProfileById(input.styleProfileId);
      if (!profile) {
        throw new Error("写法资产不存在。");
      }

      const matchedBindings = [buildDirectTaskBinding(profile)];
      const antiAiPolicy = await this.antiAiPolicyResolver.resolveFromBindings({
        matchedBindings,
        effectiveStyleProfileId: profile.id,
      });
      const baselineRules = antiAiPolicy.globalBaselineRules.map((item) => item.rule);
      const styleSpecificRules = antiAiPolicy.styleSpecificRules.map((item) => item.rule);
      const antiAiRules = antiAiPolicy.effectiveRules.map((item) => item.rule);
      const compiledBlocks = this.compiler.compile({
        styleProfile: profile,
        antiAiRules,
        weight: 1,
        appliedRuleIds: antiAiRules.map((rule) => rule.id),
        bindingSummaries: [{
          styleProfileId: profile.id,
          styleProfileName: profile.name,
          targetType: "task",
          priority: 999,
          weight: 1,
        }],
        effectiveStyleProfileId: profile.id,
        taskStyleProfileId: input.taskStyleProfileId?.trim() || input.styleProfileId.trim(),
        activeSourceTargets: ["task"],
        activeSourceLabels: baselineRules.length > 0 ? ["TASK", "GLOBAL_BASELINE"] : ["TASK"],
        usesGlobalAntiAiBaseline: baselineRules.length > 0,
        globalAntiAiRuleIds: baselineRules.map((rule) => rule.id),
        styleAntiAiRuleIds: styleSpecificRules.map((rule) => rule.id),
      });

      return {
        context: {
          matchedBindings,
          compiledBlocks,
          effectiveStyleProfileId: profile.id,
          taskStyleProfileId: input.taskStyleProfileId?.trim() || input.styleProfileId.trim(),
          activeSourceTargets: ["task"],
          activeSourceLabels: baselineRules.length > 0 ? ["TASK", "GLOBAL_BASELINE"] : ["TASK"],
          maturity: compiledBlocks.contract.meta.maturity,
          usesGlobalAntiAiBaseline: baselineRules.length > 0,
          globalAntiAiRuleIds: baselineRules.map((rule) => rule.id),
          styleAntiAiRuleIds: styleSpecificRules.map((rule) => rule.id),
        },
        antiAiRules,
        primaryProfile: profile,
      };
    }

    if (!input.novelId) {
      return {
        context: {
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
        },
        antiAiRules: [],
        primaryProfile: null,
      };
    }

    const context = await this.bindingService.resolveForGeneration({
      novelId: input.novelId,
      chapterId: input.chapterId,
      taskStyleProfileId: input.taskStyleProfileId,
    });
    const primaryProfile = context.matchedBindings[0]?.styleProfile ?? null;
    const antiAiPolicy = await this.antiAiPolicyResolver.resolveFromBindings({
      matchedBindings: context.matchedBindings,
      effectiveStyleProfileId: context.effectiveStyleProfileId,
    });

    return {
      context,
      antiAiRules: antiAiPolicy.effectiveRules.map((item) => item.rule),
      primaryProfile,
    };
  }
}
