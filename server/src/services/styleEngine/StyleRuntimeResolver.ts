import type { AntiAiRule, ResolvedStyleContext, StyleProfile } from "@ai-novel/shared/types/styleEngine";
import { StyleBindingService } from "./StyleBindingService";
import { StyleCompiler } from "./StyleCompiler";
import { StyleProfileService } from "./StyleProfileService";

export class StyleRuntimeResolver {
  private readonly bindingService = new StyleBindingService();
  private readonly profileService = new StyleProfileService();
  private readonly compiler = new StyleCompiler();

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
      return {
        context: {
          matchedBindings: [],
          compiledBlocks: this.compiler.compile({
            styleProfile: profile,
            antiAiRules: profile.antiAiRules,
          }),
        },
        antiAiRules: profile.antiAiRules,
        primaryProfile: profile,
      };
    }

    if (!input.novelId) {
      return {
        context: {
          matchedBindings: [],
          compiledBlocks: null,
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
    const antiAiRules = context.matchedBindings.flatMap((binding) => binding.styleProfile?.antiAiRules ?? []);
    return {
      context,
      antiAiRules,
      primaryProfile,
    };
  }
}
