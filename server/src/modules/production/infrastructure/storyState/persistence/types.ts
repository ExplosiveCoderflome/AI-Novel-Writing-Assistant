import type { Prisma } from "@prisma/client";
import type { ChapterArtifactDeltaOutput } from "../../../../../prompting/prompts/novel/chapterArtifactDelta.prompts";
import type { ProductionJson } from "../../../common";
import type { ArtifactContext } from "../consumerPorts";

export interface ConsumerWriteInput {
  tx: Prisma.TransactionClient;
  context: ArtifactContext;
  output: ChapterArtifactDeltaOutput;
  previous: Record<string, ProductionJson>;
}
export type ConsumerWriter = (input: ConsumerWriteInput) => Promise<ProductionJson>;
export const wire = (value: unknown): ProductionJson => JSON.parse(JSON.stringify(value));
export const compact = (value: string | null | undefined): string => String(value ?? "").replace(/\s+/g, " ").trim();
export const nullable = (value: string | null | undefined): string | null => compact(value) || null;
