import { createHash } from "node:crypto";
import { aiChapterTaskSheetQualityAssessmentSchema, mapSemanticAssessmentToQualityGate,
  type AiChapterTaskSheetQualityAssessment, type ChapterExecutionContractQualityCandidate } from "@ai-novel/shared/types/chapterTaskSheetQuality";
import { prisma } from "../../../../../db/prisma";
import { resolveLLMClientOptions } from "../../../../../llm/factory";
import { chapterTaskSheetQualityPrompt } from "../../../../../prompting/prompts/novel/volume/chapterTaskSheetQuality.prompts";
import { preparePromptExecution } from "../../../../../prompting/core/promptRunner";
import { resolveAdvancedPromptMessages } from "../../../../../prompting/templates/templateRuntime";
import { ChapterTaskSheetQualityGateService, type ChapterTaskSheetQualityGateOptions, type ChapterTaskSheetSemanticAssessor } from "../../ChapterTaskSheetQualityGateService";

/** Shape-compatible plans still need one semantic check against the actual preceding prose. */
export async function reviewChapterExecutionContinuity(
  candidate: ChapterExecutionContractQualityCandidate,
  options: ChapterTaskSheetQualityGateOptions,
  ports?: { semanticAssessor: ChapterTaskSheetSemanticAssessor },
) {
  const previous = candidate.previousChapterResult;
  if (!previous?.content?.trim()) return null;
  options.signal?.throwIfAborted();
  const mode = options.mode ?? "ai_copilot";
  if (ports) {
    // The owning caller persists its request/result; never write the legacy global cache.
    let assessment: AiChapterTaskSheetQualityAssessment | undefined;
    const result = await new ChapterTaskSheetQualityGateService(ports.semanticAssessor).evaluate(candidate, {
      ...options, mode, onEvaluated: async event => {
        assessment = event.assessment;
        await options.onEvaluated?.(event);
      },
    });
    if (!assessment) throw new Error("本章规划未完成与前文的核对，请保留规划后重试。");
    options.signal?.throwIfAborted();
    return { assessment, result };
  }
  // Default routing may change independently; without an explicit model identity, evaluate without reuse.
  const canCache = Boolean(options.provider && options.model);
  const resolved = canCache ? await resolveLLMClientOptions(options.provider, { model: options.model,
    temperature: 0.1, taskType: "review", executionMode: "structured" }) : null;
  const promptInput = { candidate, mode };
  const prepared = preparePromptExecution({ asset: chapterTaskSheetQualityPrompt, promptInput });
  const messages = await resolveAdvancedPromptMessages({ asset: chapterTaskSheetQualityPrompt, promptInput,
    context: prepared.context, officialMessages: prepared.messages, novelId: candidate.novelId });
  const identity = createHash("sha256").update(JSON.stringify({ mode,
    messages: messages.map(message => ({ role: message.getType(), content: message.content })),
    promptVersion: chapterTaskSheetQualityPrompt.version,
    model: resolved ? { provider: resolved.provider, model: resolved.model, baseURL: resolved.baseURL, temperature: resolved.temperature,
      maxTokens: resolved.maxTokens, requestProtocol: resolved.requestProtocol, structuredStrategy: resolved.structuredStrategy } : null,
  })).digest("hex");
  const key = { novelId: candidate.novelId, chapterId: candidate.chapterId, contentHash: identity,
    artifactType: "chapter_execution_continuity:v1", syncMode: "planning" };
  const where = { novelId_chapterId_contentHash_artifactType_syncMode: key };
  const row = canCache ? await prisma.chapterArtifactSyncCheckpoint.findUnique({ where, select: { status: true, metadataJson: true } }) : null;
  let assessment: AiChapterTaskSheetQualityAssessment | undefined;
  if (row?.status === "succeeded") {
    try { assessment = aiChapterTaskSheetQualityAssessmentSchema.parse(JSON.parse(row.metadataJson ?? "null")); }
    catch { /* A malformed cache is never authority for plan reuse. */ }
  }
  if (!assessment) {
    await new ChapterTaskSheetQualityGateService().evaluate(candidate, { ...options, mode,
      onEvaluated: event => { assessment = event.assessment; } });
    if (!assessment) throw new Error("本章规划未完成与前文的核对，请保留规划后重试。");
    options.signal?.throwIfAborted();
    if (canCache) await prisma.chapterArtifactSyncCheckpoint.upsert({ where, create: { ...key, status: "succeeded", metadataJson: JSON.stringify(assessment) },
      update: { status: "succeeded", metadataJson: JSON.stringify(assessment) } });
  }
  options.signal?.throwIfAborted();
  return { assessment, result: mapSemanticAssessmentToQualityGate(assessment, mode) };
}
