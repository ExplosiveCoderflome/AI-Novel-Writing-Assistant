import { chapterArtifactDeltaPrompt, chapterArtifactDeltaOutputSchema,
  type ChapterArtifactDeltaPromptInput } from "../../../../prompting/prompts/novel/chapterArtifactDelta.prompts";
import { canonicalProductionJson, checkContextBudget, cloneProductionData, type ProductionJson } from "../../common";
import { hashProductionContent, ProductionSnapshotConflictError } from "../../application";
import type { ArtifactContext, ArtifactExtractionPort, PreparedArtifactExtraction } from "./consumerPorts";

export class ProductionContextBudgetError extends Error {
  constructor() { super("完整正文与审校上下文超出有效输入预算，请选择上下文更大的模型。"); this.name = "ProductionContextBudgetError"; }
}
export interface ArtifactPromptDescription {
  identity: string;
  promptVersion: string;
  provider: string;
  model: string;
  outputTokens: number;
  /** Native primary output cap; outputTokens may include a larger fallback allowance. */
  requestOutputTokens?: number;
  contextWindow: number | null;
  renderedInput: string;
}
export interface ArtifactExtractionDependencies {
  /** Read-only source facades; failures propagate instead of silently becoming empty facts. */
  read(context: ArtifactContext): Promise<Omit<ChapterArtifactDeltaPromptInput, "chapterOrder" | "chapterContent" | "locationTrackingEnabled" | "characterCandidateResolutionEnabled">>;
  /** Resolve registry overlays, route/config identity and the COMPLETE rendered messages, including tools. */
  describePrompt(input: ChapterArtifactDeltaPromptInput): Promise<ArtifactPromptDescription>;
  invokePrompt(input: { asset: typeof chapterArtifactDeltaPrompt; promptInput: ChapterArtifactDeltaPromptInput;
    options: { provider: string; model: string; maxTokens: number; novelId: string; chapterId: string; stage: string } }): Promise<{ output: unknown }>;
}
function asJson(value: unknown): ProductionJson {
  // The registered schema normalizes optional fields; serializing its output is the wire representation.
  return JSON.parse(JSON.stringify(chapterArtifactDeltaOutputSchema.parse(value))) as ProductionJson;
}
function descriptionIdentity(input: ChapterArtifactDeltaPromptInput, description: ArtifactPromptDescription): string {
  return hashProductionContent(canonicalProductionJson({ input, identity: description.identity,
    assetId: chapterArtifactDeltaPrompt.id, assetVersion: description.promptVersion,
    provider: description.provider, model: description.model, outputTokens: description.outputTokens,
    requestOutputTokens: description.requestOutputTokens ?? description.outputTokens,
    contextWindow: description.contextWindow, renderedHash: hashProductionContent(description.renderedInput) }));
}

/** Registered PromptAsset reuse; no old director-version dispatch or silent manuscript slicing. */
export function createArtifactExtractionPort(deps: ArtifactExtractionDependencies): ArtifactExtractionPort {
  return {
    async prepare(context): Promise<PreparedArtifactExtraction> {
      const source = await deps.read(context);
      const characterState = context.run.snapshots.profile.capabilities.includes("character_state");
      const input: ChapterArtifactDeltaPromptInput = { ...source, chapterOrder: context.run.progress.unit.order,
        chapterContent: context.content, locationTrackingEnabled: characterState, characterCandidateResolutionEnabled: characterState };
      const description = await deps.describePrompt(input);
      const budget = checkContextBudget({ input: description.renderedInput, contextWindow: description.contextWindow,
        outputTokens: description.outputTokens, safetyTokens: 1024 });
      if (!budget.ok) throw new ProductionContextBudgetError();
      const inputFingerprint = descriptionIdentity(input, description);
      return { inputFingerprint, outputTokens: description.outputTokens,
        input: { promptInput: cloneProductionData(input) as unknown as ProductionJson,
          provider: description.provider, model: description.model, outputTokens: description.requestOutputTokens ?? description.outputTokens } };
    },
    async invoke(context, prepared) {
      const stored = prepared.input as { promptInput: unknown; provider: string; model: string; outputTokens: number };
      const input = cloneProductionData(stored.promptInput) as ChapterArtifactDeltaPromptInput;
      const description = await deps.describePrompt(input);
      if (descriptionIdentity(input, description) !== prepared.inputFingerprint) throw new ProductionSnapshotConflictError();
      const result = await deps.invokePrompt({ asset: chapterArtifactDeltaPrompt, promptInput: input,
        options: { provider: stored.provider, model: stored.model, maxTokens: stored.outputTokens,
          novelId: context.run.progress.unit.novelId, chapterId: context.run.progress.unit.chapterId, stage: "chapter_artifact_delta" } });
      // A changed effective configuration cannot authorize persisting this response under an old identity.
      if (descriptionIdentity(input, await deps.describePrompt(input)) !== prepared.inputFingerprint) throw new ProductionSnapshotConflictError();
      return asJson(result.output);
    },
    validate: asJson,
  };
}
