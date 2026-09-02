import type {
  AiChapterTaskSheetQualityAssessment,
  ChapterExecutionContractQualityCandidate,
  ChapterTaskSheetQualityGateResult,
  ChapterTaskSheetQualityMode,
} from "@ai-novel/shared/types/chapterTaskSheetQuality";
import {
  assessChapterExecutionContractShape,
  formatChapterTaskSheetQualityFailure,
  mapSemanticAssessmentToQualityGate,
} from "@ai-novel/shared/types/chapterTaskSheetQuality";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  chapterTaskSheetQualityPrompt,
} from "../../../prompting/prompts/novel/volume/chapterTaskSheetQuality.prompts";

export interface ChapterTaskSheetQualityGateOptions {
  mode?: ChapterTaskSheetQualityMode;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  taskId?: string;
  entrypoint?: string;
  signal?: AbortSignal;
}

export type ChapterTaskSheetSemanticAssessor = (input: {
  candidate: ChapterExecutionContractQualityCandidate;
  mode: ChapterTaskSheetQualityMode;
  options: ChapterTaskSheetQualityGateOptions;
}) => Promise<AiChapterTaskSheetQualityAssessment>;

function normalizeQualityMode(mode?: ChapterTaskSheetQualityMode): ChapterTaskSheetQualityMode {
  return mode ?? "ai_copilot";
}

function ensureFailureResult(result: ChapterTaskSheetQualityGateResult): ChapterTaskSheetQualityGateResult {
  if (!result.canEnterExecution || result.status !== "passed") {
    return result;
  }
  return {
    ...result,
    status: "passed",
  };
}

export class ChapterTaskSheetQualityGateError extends Error {
  constructor(readonly result: ChapterTaskSheetQualityGateResult) {
    super(formatChapterTaskSheetQualityFailure(result));
    this.name = "ChapterTaskSheetQualityGateError";
  }
}

export class ChapterTaskSheetQualityGateService {
  constructor(private readonly semanticAssessor?: ChapterTaskSheetSemanticAssessor) {}

  async evaluate(
    candidate: ChapterExecutionContractQualityCandidate,
    options: ChapterTaskSheetQualityGateOptions = {},
  ): Promise<ChapterTaskSheetQualityGateResult> {
    const mode = normalizeQualityMode(options.mode);
    const shapeResult = assessChapterExecutionContractShape(candidate);
    if (!shapeResult.canEnterExecution) {
      return shapeResult;
    }

    const assessment = this.semanticAssessor
      ? await this.semanticAssessor({ candidate, mode, options })
      : await this.runSemanticAssessment(candidate, mode, options);
    return ensureFailureResult(mapSemanticAssessmentToQualityGate(assessment, mode));
  }

  async assertCanEnterExecution(
    candidate: ChapterExecutionContractQualityCandidate,
    options: ChapterTaskSheetQualityGateOptions = {},
  ): Promise<ChapterTaskSheetQualityGateResult> {
    const result = await this.evaluate(candidate, options);
    if (!result.canEnterExecution) {
      throw new ChapterTaskSheetQualityGateError(result);
    }
    return result;
  }

  private async runSemanticAssessment(
    candidate: ChapterExecutionContractQualityCandidate,
    mode: ChapterTaskSheetQualityMode,
    options: ChapterTaskSheetQualityGateOptions,
  ): Promise<AiChapterTaskSheetQualityAssessment> {
    const generated = await runStructuredPrompt({
      asset: chapterTaskSheetQualityPrompt,
      promptInput: {
        candidate,
        mode,
      },
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.1,
        taskId: options.taskId,
        entrypoint: options.entrypoint,
        novelId: candidate.novelId,
        volumeId: candidate.volumeId ?? undefined,
        chapterId: candidate.chapterId,
        stage: "chapter_task_sheet_quality",
        itemKey: "chapter_detail_bundle",
        scope: "chapter_detail",
        triggerReason: "chapter_task_sheet_quality_gate",
        signal: options.signal,
      },
    });
    return generated.output;
  }
}
