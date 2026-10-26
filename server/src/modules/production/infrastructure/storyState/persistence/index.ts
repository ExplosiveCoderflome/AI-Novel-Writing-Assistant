import { chapterArtifactDeltaOutputSchema } from "../../../../../prompting/prompts/novel/chapterArtifactDelta.prompts";
import { ARTIFACT_CONSUMERS, type ArtifactConsumer, type ArtifactConsumerPort } from "../consumerPorts";
import type { PrismaArtifactCheckpointStore } from "../checkpointStore";
import { createFactsWriter } from "./facts";
import { writeSnapshot } from "./snapshot";
import { writePayoff } from "./payoff";
import { writeDynamics } from "./dynamics";
import { writeKnowledge, writeMind } from "./knowledgeMind";
import { writeDialogue } from "./dialogue";
import { writeLocations, writeAppearances } from "./projections";
import { createResourceWriter, type ResourcePersistenceDependencies } from "./resources";
import type { ConsumerWriter } from "./types";
import { requireConsumerClaim } from "./ownership";

export interface ArtifactConsumerDependencies {
  checkpoints: Pick<PrismaArtifactCheckpointStore, "applyConsumer">;
  resources?: ResourcePersistenceDependencies;
  rag?: { tenantId: string; maxAttempts: number };
}
export function createArtifactConsumers(deps: ArtifactConsumerDependencies): Record<ArtifactConsumer, ArtifactConsumerPort> {
  const writers: Record<ArtifactConsumer, ConsumerWriter> = { summary_facts: createFactsWriter(deps.rag), state_snapshot: writeSnapshot,
    character_resources: createResourceWriter(deps.resources), payoff: writePayoff, character_dynamics: writeDynamics,
    knowledge: writeKnowledge, mind: writeMind, dialogue_influence: writeDialogue,
    character_locations: writeLocations, character_appearances: writeAppearances };
  return Object.fromEntries(ARTIFACT_CONSUMERS.map(name => [name, { async apply(input) {
    const claim = requireConsumerClaim(name, input);
    return deps.checkpoints.applyConsumer(claim, tx => writers[name]({ tx, context: input.context,
      output: chapterArtifactDeltaOutputSchema.parse(input.output), previous: input.previous as Record<string, import("../../../common").ProductionJson> }));
  } } as ArtifactConsumerPort])) as Record<ArtifactConsumer, ArtifactConsumerPort>;
}
export type { ResourcePersistenceDependencies } from "./resources";
export { createTimelineConsumer } from "./timeline";
export type { TimelineConsumerDependencies } from "./timeline";
export { createFullPayoffConsumer } from "./payoff";
