import type { StepContext, StepHandler } from "../../application";

export interface StoryMacroStepInput<Provider extends string = string> {
  storyInput: string;
  provider?: Provider;
  model?: string;
  temperature?: number;
}

export interface StoryMacroStepDependencies<Provider extends string> {
  storyMacroService: {
    decompose(novelId: string, storyInput: string, options: Omit<StoryMacroStepInput<Provider>, "storyInput">): Promise<unknown>;
  };
  inputProvider: (context: StepContext) => Promise<StoryMacroStepInput<Provider>>;
  contentHash: (content: unknown) => string;
}

export function createStoryMacroStepHandler<Provider extends string>(dependencies: StoryMacroStepDependencies<Provider>): StepHandler {
  return async (context: StepContext) => {
    const input = await dependencies.inputProvider(context);
    const storyInput = input.storyInput.trim();
    if (!storyInput) {
      throw new Error("故事想法不能为空。");
    }

    const plan = await dependencies.storyMacroService.decompose(context.contract.novelId, storyInput, {
      provider: input.provider, model: input.model, temperature: input.temperature,
    });
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
