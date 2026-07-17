import type {
  CharacterSubjectProjection,
} from "@ai-novel/shared/types/characterConversation";

/**
 * An adapter is deliberately pure: callers own data access and pass the
 * already-authorized source record to the adapter. This keeps subject
 * projection from becoming a second persistence layer.
 */
export interface CharacterSubjectAdapter<TInput> {
  project(input: TInput): CharacterSubjectProjection;
  buildPromptContext(input: TInput): string;
}

export interface CharacterSubjectAdapterResult {
  projection: CharacterSubjectProjection;
  promptContext: string;
}

export function adaptCharacterSubject<TInput>(
  adapter: CharacterSubjectAdapter<TInput>,
  input: TInput,
): CharacterSubjectAdapterResult {
  return {
    projection: adapter.project(input),
    promptContext: adapter.buildPromptContext(input),
  };
}
