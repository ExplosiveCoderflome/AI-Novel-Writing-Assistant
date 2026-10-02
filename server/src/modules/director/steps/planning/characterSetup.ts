import type { StepContext, StepHandler } from "../../application";

interface CastMember {id: string; novelId: string; name: string}
interface CastSnapshot {characters: readonly CastMember[]; relations: readonly unknown[]}
export interface CharacterSetupDependencies<Input extends {storyInput: string}> {
  inputProvider(context: StepContext): Promise<Input>;
  characterService: {
    readCast(novelId: string): Promise<CastSnapshot>;
    /** Must create only in an empty cast and must preserve existing candidates and relations. */
    prepareEmptyCast(novelId: string, input: Input): Promise<{characterIds: readonly string[]}>;
  };
  contentHash(content: unknown): string;
}

export function createCharacterSetupStepHandler<Input extends {storyInput: string}>(dependencies: CharacterSetupDependencies<Input>): StepHandler {
  return async context => {
    const novelId = context.contract.novelId;
    const before = await dependencies.characterService.readCast(novelId);
    if (before.characters.some(member => member.novelId !== novelId)) throw new Error("角色阵容不属于当前小说。");
    const existing = before.characters.length > 0;
    let saved = before;
    if (!existing) {
      const input = await dependencies.inputProvider(context);
      if (!input.storyInput.trim()) throw new Error("角色准备缺少故事想法。");
      const created = await dependencies.characterService.prepareEmptyCast(novelId, input);
      saved = await dependencies.characterService.readCast(novelId);
      if (created.characterIds.length === 0 || new Set(created.characterIds).size !== created.characterIds.length
        || saved.characters.some(member => member.novelId !== novelId)
        || created.characterIds.some(id => !saved.characters.some(member => member.id === id))) {
        return {stopSignal: {kind: "data_integrity", reason: "生成的角色阵容未完整保存，请检查角色资料。"}};
      }
    }
    return {artifact: {scope: context.contract.scope, status: existing ? "confirmed" : "draft", protectedUserContent: existing,
      contentRef: `character_cast:${novelId}`, contentHash: dependencies.contentHash(saved)}};
  };
}
