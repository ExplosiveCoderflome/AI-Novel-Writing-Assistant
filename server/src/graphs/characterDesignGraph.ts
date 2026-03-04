export interface CharacterDesignState {
  concept: string;
  profile?: string;
}

export const CharacterDesignAnnotation = {
  concept: "string",
  profile: "string",
} as const;

export async function designCharacterNode(
  state: CharacterDesignState,
): Promise<Partial<CharacterDesignState>> {
  return { concept: state.concept };
}

export async function finalizeCharacterNode(
  state: CharacterDesignState,
): Promise<Partial<CharacterDesignState>> {
  return { profile: state.profile ?? "" };
}

export function buildCharacterDesignGraph() {
  return compiledGraph;
}

export const compiledGraph = {
  async *streamEvents(input: CharacterDesignState, _options: { version: "v2" } = { version: "v2" }) {
    yield { event: "chunk", data: { concept: input.concept } };
    yield { event: "done", data: { profile: input.profile ?? "" } };
  },
};
