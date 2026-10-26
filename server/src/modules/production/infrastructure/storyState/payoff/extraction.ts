import { payoffLedgerSyncPrompt, type PayoffLedgerSyncPromptInput } from "../../../../../prompting/prompts/payoff/payoffLedgerSync.prompts";
import { payoffLedgerSyncOutputSchema } from "../../../../../prompting/prompts/payoff/payoffLedgerSync.promptSchemas";
import { canonicalProductionJson, checkContextBudget, cloneProductionData, type ProductionJson } from "../../../common";
import { hashProductionContent, ProductionSnapshotConflictError } from "../../../application";
import type { ArtifactContext, ArtifactExtractionPort } from "../consumerPorts";
import { ProductionContextBudgetError, type ArtifactPromptDescription } from "../extraction";

export interface PayoffExtractionDependencies {
  read(context: ArtifactContext): Promise<PayoffLedgerSyncPromptInput>;
  describePrompt(input: PayoffLedgerSyncPromptInput): Promise<ArtifactPromptDescription>;
  invokePrompt(input: { asset: typeof payoffLedgerSyncPrompt; promptInput: PayoffLedgerSyncPromptInput;
    options: { provider: string; model: string; maxTokens: number; novelId: string; chapterId: string; stage: string } }): Promise<{ output: unknown }>;
}
const wire = (value: unknown): ProductionJson => JSON.parse(JSON.stringify(value));
function fingerprint(input: PayoffLedgerSyncPromptInput, description: ArtifactPromptDescription): string {
  return hashProductionContent(canonicalProductionJson(wire({ input, assetId: payoffLedgerSyncPrompt.id,
    ...description, renderedInput: hashProductionContent(description.renderedInput) })));
}
export function createPayoffExtractionPort(deps: PayoffExtractionDependencies): ArtifactExtractionPort {
  return {
    async prepare(context) {
      const promptInput = await deps.read(context); const description = await deps.describePrompt(promptInput);
      if (!checkContextBudget({ input: description.renderedInput, contextWindow: description.contextWindow,
        outputTokens: description.outputTokens, safetyTokens: 1024 }).ok) throw new ProductionContextBudgetError();
      return { inputFingerprint: fingerprint(promptInput, description), outputTokens: description.outputTokens,
        input: wire({ promptInput, provider: description.provider, model: description.model, outputTokens: description.requestOutputTokens ?? description.outputTokens }) };
    },
    async invoke(context, prepared) {
      const stored = cloneProductionData(prepared.input) as unknown as { promptInput: PayoffLedgerSyncPromptInput; provider: string; model: string; outputTokens: number };
      if (fingerprint(stored.promptInput, await deps.describePrompt(stored.promptInput)) !== prepared.inputFingerprint) throw new ProductionSnapshotConflictError();
      const result = await deps.invokePrompt({ asset: payoffLedgerSyncPrompt, promptInput: stored.promptInput,
        options: { provider: stored.provider, model: stored.model, maxTokens: stored.outputTokens,
          novelId: context.run.progress.unit.novelId, chapterId: context.run.progress.unit.chapterId, stage: "payoff_ledger_reconcile" } });
      if (fingerprint(stored.promptInput, await deps.describePrompt(stored.promptInput)) !== prepared.inputFingerprint) throw new ProductionSnapshotConflictError();
      return wire(payoffLedgerSyncOutputSchema.parse(result.output));
    },
    validate: value => wire(payoffLedgerSyncOutputSchema.parse(value)),
  };
}
