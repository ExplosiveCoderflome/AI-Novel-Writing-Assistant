import type { StepContext, StepHandler } from "../../application";

export interface BookContractStepDependencies<Input extends {novelId: string; taskId?: string; entrypoint?: string}, Draft, Saved extends {id: string; novelId: string}> {
  inputProvider: (context: StepContext) => Promise<Input>;
  generationService: { generate(input: Input): Promise<Draft> };
  bookContractService: { upsert(novelId: string, draft: Draft): Promise<Saved> };
  contentHash: (content: unknown) => string;
}

export function createBookContractStepHandler<Input extends {novelId: string; taskId?: string; entrypoint?: string}, Draft, Saved extends {id: string; novelId: string}>(dependencies: BookContractStepDependencies<Input, Draft, Saved>): StepHandler {
  return async context => {
    const input = await dependencies.inputProvider(context);
    const novelId = context.contract.novelId;
    const draft = await dependencies.generationService.generate({
      ...input,
      novelId,
      taskId: context.runId,
      entrypoint: "director_next",
    });
    const saved = await dependencies.bookContractService.upsert(novelId, draft);
    if (!saved.id || saved.novelId !== novelId) {
      throw new Error("书级创作约定未正确保存到当前小说。");
    }
    return {
      artifact: {
        scope: context.contract.scope,
        status: "draft",
        protectedUserContent: false,
        contentRef: `book_contract:${novelId}`,
        contentHash: dependencies.contentHash(saved),
      },
    };
  };
}
