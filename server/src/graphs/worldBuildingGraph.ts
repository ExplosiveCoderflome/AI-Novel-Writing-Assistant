export interface WorldBuildingState {
  seed: string;
  worldSummary?: string;
}

export const WorldBuildingAnnotation = {
  seed: "string",
  worldSummary: "string",
} as const;

export async function enrichWorldNode(state: WorldBuildingState): Promise<Partial<WorldBuildingState>> {
  return { seed: state.seed };
}

export async function summarizeWorldNode(
  state: WorldBuildingState,
): Promise<Partial<WorldBuildingState>> {
  return { worldSummary: state.worldSummary ?? "" };
}

export function buildWorldBuildingGraph() {
  return compiledGraph;
}

export const compiledGraph = {
  async *streamEvents(input: WorldBuildingState, _options: { version: "v2" } = { version: "v2" }) {
    yield { event: "chunk", data: { seed: input.seed } };
    yield { event: "done", data: { worldSummary: input.worldSummary ?? "" } };
  },
};
