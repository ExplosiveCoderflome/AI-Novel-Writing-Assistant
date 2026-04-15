export interface CharacterImagePromptCharacterContext {
  name: string;
  role: string;
  personality: string;
  appearance?: string | null;
  background: string;
}

export interface BuildCharacterImagePromptInput {
  prompt: string;
  stylePreset?: string | null;
  character: CharacterImagePromptCharacterContext;
}

export function buildDefaultCharacterImageSourceDescription(character: {
  name: string;
  role?: string | null;
  appearance?: string | null;
  personality?: string | null;
}): string {
  const blocks = [
    `${character.name} 的角色形象图`,
    character.role ? `角色定位：${character.role}` : "",
    character.appearance ? `外貌体态：${character.appearance}` : "",
    character.personality ? `性格特征：${character.personality}` : "",
  ];
  return blocks.filter(Boolean).join("\n");
}

export function buildCharacterImagePrompt(input: BuildCharacterImagePromptInput): string {
  const blocks = [
    input.prompt.trim(),
    input.stylePreset?.trim() ? `Style preset: ${input.stylePreset.trim()}` : "",
    `Character name: ${input.character.name}`,
    `Character role: ${input.character.role}`,
    `Personality: ${input.character.personality}`,
    `Appearance: ${input.character.appearance ?? "Not specified"}`,
    `Background: ${input.character.background}`,
  ];
  return blocks.filter(Boolean).join("\n");
}
