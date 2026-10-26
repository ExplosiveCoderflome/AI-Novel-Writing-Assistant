import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { PromptContextBlock } from "../../../../prompting/core/promptTypes";
import { chapterWriterPrompt, type ChapterWriterPromptInput } from "../../../../prompting/prompts/novel/chapterWriter.prompts";
import { resolveTargetWordRange } from "../../../../prompting/prompts/novel/chapterLayeredContext";
import { canonicalProductionJson, checkContextBudget, cloneProductionData, type ProductionJson } from "../../common";
import { hashProductionContent, InvalidProductionRequestError, ProductionSnapshotConflictError, type UnitRun } from "../../application";
import type { PreparedChapter, PreparedStageCall } from "../stages";
import type { ArtifactPromptDescription } from "../storyState/extraction";

interface WriterRequest {
  promptInput: ChapterWriterPromptInput;
  contextBlocks: PromptContextBlock[];
  options: { provider: LLMProvider; model: string; maxTokens: number; temperature: number; reasoningEnabled: false;
    novelId: string; chapterId: string; stage: string; triggerReason: string };
}
export interface RegisteredChapterWriterDependencies {
  /** Existing sanitized writer blocks, writing-platform contract and resolved context, assembled read-only. */
  resolveContext(run: UnitRun, prepared: PreparedChapter): Promise<PromptContextBlock[]>;
  /** Includes effective overlays, full rendered messages, route/output cap and config identity. */
  describePrompt(request: WriterRequest & { asset: typeof chapterWriterPrompt }): Promise<ArtifactPromptDescription>;
  invokePrompt(request: WriterRequest & { asset: typeof chapterWriterPrompt }): Promise<{ output: string }>;
}
function identity(request: WriterRequest, description: ArtifactPromptDescription): string {
  return hashProductionContent(canonicalProductionJson(JSON.parse(JSON.stringify({ request, asset: chapterWriterPrompt.id,
    version: description.promptVersion, config: description.identity, provider: description.provider, model: description.model,
    outputTokens: description.outputTokens, contextWindow: description.contextWindow,
    renderedHash: hashProductionContent(description.renderedInput) }))));
}

/** Reuses only the registered draft prompt; continuation, acceptance, repair and save belong to separate stages. */
export function createRegisteredChapterWriter(deps: RegisteredChapterWriterDependencies) {
  return {
    async describe(run: UnitRun, prepared: PreparedChapter): Promise<PreparedStageCall> {
      const target = prepared.contextPackage.chapterWriteContext?.chapterMission.targetWordCount ?? null;
      const range = resolveTargetWordRange(target);
      const request: WriterRequest = JSON.parse(JSON.stringify({
        promptInput: { novelTitle: prepared.novelTitle, chapterOrder: run.progress.unit.order, chapterTitle: prepared.chapterTitle,
          mode: "draft", targetWordCount: target, minWordCount: range.minWordCount, maxWordCount: range.maxWordCount },
        contextBlocks: await deps.resolveContext(run, prepared),
        options: { provider: run.snapshots.model.provider, model: run.snapshots.model.model,
          maxTokens: run.snapshots.profile.outputBudgets.draft, temperature: 0.8, reasoningEnabled: false,
          novelId: run.progress.unit.novelId, chapterId: run.progress.unit.chapterId, stage: "writer_draft", triggerReason: "chapter_initial_draft" },
      }));
      const description = await deps.describePrompt({ ...request, asset: chapterWriterPrompt });
      if (description.provider !== run.snapshots.model.provider || description.model !== run.snapshots.model.model) throw new ProductionSnapshotConflictError();
      const budget = checkContextBudget({ input: description.renderedInput, contextWindow: description.contextWindow,
        outputTokens: description.outputTokens, safetyTokens: 1024 });
      if (!budget.ok || description.outputTokens > (run.snapshots.profile.outputBudgets.draft ?? 0)) {
        throw new InvalidProductionRequestError("完整章节上下文超出有效模型预算，请选择上下文更大的模型。");
      }
      return { callsModel: true, outputTokens: description.outputTokens, inputFingerprint: identity(request, description),
        promptVersion: description.promptVersion, configVersion: run.snapshots.model.configVersion,
        input: { writerRequest: request as unknown as ProductionJson } };
    },
    async invoke(run: UnitRun, _prepared: PreparedChapter, call: PreparedStageCall): Promise<string> {
      const stored = call.input as { writerRequest?: ProductionJson };
      const request = cloneProductionData(stored.writerRequest) as unknown as WriterRequest;
      if (!request?.promptInput || !request.contextBlocks || request.promptInput.mode !== "draft"
        || request.options?.novelId !== run.progress.unit.novelId || request.options.chapterId !== run.progress.unit.chapterId
        || request.options.provider !== run.snapshots.model.provider || request.options.model !== run.snapshots.model.model) {
        throw new InvalidProductionRequestError("Writer request does not match the frozen unit");
      }
      const current = () => deps.describePrompt({ ...request, asset: chapterWriterPrompt });
      if (identity(request, await current()) !== call.inputFingerprint) throw new ProductionSnapshotConflictError();
      const result = await deps.invokePrompt({ ...request, asset: chapterWriterPrompt });
      if (identity(request, await current()) !== call.inputFingerprint) throw new ProductionSnapshotConflictError();
      return result.output;
    },
  };
}
