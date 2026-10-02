import type { StepContext, StepHandler } from "../../application";

export interface StoryMacroStepService {
  decompose(novelId: string, storyInput: string): Promise<unknown>;
}

export interface StoryMacroStepDependencies {
  storyMacroService: StoryMacroStepService;
  storyInputProvider: (novelId: string) => Promise<string>;
  contentHash: (content: unknown) => string;
}

export function createStoryMacroStepHandler(dependencies: StoryMacroStepDependencies): StepHandler {
  return async (context: StepContext) => {
    const storyInput = (await dependencies.storyInputProvider(context.contract.novelId)).trim();
    if (!storyInput) {
      throw new Error("故事想法不能为空。");
    }

    const plan = await dependencies.storyMacroService.decompose(context.contract.novelId, storyInput);
    return {
      artifact: {
        scope: context.contract.scope,
        status: "draft",
        protectedUserContent: false,
        contentRef: `story_macro:${context.contract.novelId}`,
        contentHash: dependencies.contentHash(plan),
      },
    };
  };
}
