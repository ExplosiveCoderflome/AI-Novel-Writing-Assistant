export function buildOutlineOpeningLaunchInput(input: {
  storyInput: string;
  estimatedChapterCount: number;
  worldMode: "reuse" | "skip";
  provider: string;
  model: string;
  temperature?: number;
  chapterOrder: number;
}) {
  return {
    storyInput: input.storyInput,
    estimatedChapterCount: input.estimatedChapterCount,
    worldMode: input.worldMode,
    provider: input.provider,
    model: input.model,
    temperature: input.temperature,
    targetMode: "opening" as const,
    executionRange: { from: input.chapterOrder, to: input.chapterOrder },
  };
}
