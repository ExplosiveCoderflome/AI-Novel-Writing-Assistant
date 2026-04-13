import { randomUUID } from "node:crypto";
import {
  DIRECTOR_CANDIDATE_SETUP_STEPS,
  type DirectorCandidate,
  type DirectorCandidateBatch,
  type DirectorCandidatePatchRequest,
  type DirectorCandidatePatchResponse,
  type DirectorCandidateTitleRefineRequest,
  type DirectorCandidateTitleRefineResponse,
  type DirectorCandidatesRequest,
  type DirectorCandidatesResponse,
  type DirectorCorrectionPreset,
  type DirectorProjectContextInput,
  type DirectorRefineResponse,
  type DirectorRefinementRequest,
} from "@ai-novel/shared/types/novelDirector";
import type { TitleFactorySuggestion } from "@ai-novel/shared/types/title";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  buildDirectorCandidateContextBlocks,
  directorCandidatePatchPrompt,
  directorCandidatePrompt,
} from "../../../prompting/prompts/novel/directorPlanning.prompts";
import { titleGenerationService } from "../../title/TitleGenerationService";
import { isNearDuplicateTitle } from "../../title/titleGeneration.shared";
import type { NovelWorkflowService } from "../workflow/NovelWorkflowService";
import {
  buildRefinementSummary,
  buildWorkflowSeedPayload,
  enhanceCandidateTitles,
  normalizeCandidate,
  type CandidateGenerationContext,
} from "./novelDirectorHelpers";
import { DIRECTOR_PROGRESS } from "./novelDirectorProgress";

type WorkflowDependency = Pick<NovelWorkflowService, "bootstrapTask" | "markTaskRunning" | "recordCandidateSelectionRequired">;

function clampTemperature(value: number | undefined, ceiling: number): number {
  return Math.min(value ?? ceiling, ceiling);
}

function buildFallbackTitleOption(candidate: DirectorCandidate): TitleFactorySuggestion {
  return {
    title: candidate.workingTitle,
    clickRate: 60,
    style: "high_concept",
    angle: "当前方案书名",
    reason: "沿用当前方案书名。",
  };
}

function mergeTitleOptions(
  generatedTitles: TitleFactorySuggestion[],
  candidate: DirectorCandidate,
): TitleFactorySuggestion[] {
  const merged: TitleFactorySuggestion[] = [];
  for (const option of generatedTitles) {
    if (!merged.some((existing) => isNearDuplicateTitle(existing.title, option.title))) {
      merged.push(option);
    }
  }

  const fallback = buildFallbackTitleOption(candidate);
  if (!merged.some((existing) => isNearDuplicateTitle(existing.title, fallback.title))) {
    merged.push(fallback);
  }

  return merged.slice(0, 4);
}

function buildTargetedTitleBrief(input: {
  candidate: DirectorCandidate;
  idea: string;
  context: DirectorProjectContextInput;
  feedback: string;
}): string {
  const currentTitleGroup = [
    input.candidate.workingTitle,
    ...(input.candidate.titleOptions ?? []).map((item) => item.title),
  ]
    .filter(Boolean)
    .join("、");

  return [
    `故事灵感：${input.idea.trim()}`,
    `当前方案：${input.candidate.workingTitle}`,
    `作品定位：${input.candidate.positioning}`,
    `核心卖点：${input.candidate.sellingPoint}`,
    `主线冲突：${input.candidate.coreConflict}`,
    `主角路径：${input.candidate.protagonistPath}`,
    `主钩子：${input.candidate.hookStrategy}`,
    `推进循环：${input.candidate.progressionLoop}`,
    input.candidate.toneKeywords.length > 0 ? `气质关键词：${input.candidate.toneKeywords.join("、")}` : "",
    input.context.targetAudience?.trim() ? `目标读者：${input.context.targetAudience.trim()}` : "",
    input.context.competingFeel?.trim() ? `对标气质：${input.context.competingFeel.trim()}` : "",
    currentTitleGroup ? `当前标题组：${currentTitleGroup}` : "",
    `标题修正意见：${input.feedback.trim()}`,
    "请围绕同一套故事方向重做一组更合适的中文网文书名。",
    "优先响应用户要求的气质修正，比如更都市、更悬疑、更轻巧、更高级感或没那么土。",
    "不要重复当前这组标题，也不要回退成概念短语、口号名或老套模板名。",
  ].filter(Boolean).join("\n");
}

function findTargetBatch(previousBatches: DirectorCandidateBatch[], batchId: string): DirectorCandidateBatch {
  const batch = previousBatches.find((item) => item.id === batchId);
  if (!batch) {
    throw new Error("目标方案轮次不存在。");
  }
  return batch;
}

function findTargetCandidate(batch: DirectorCandidateBatch, candidateId: string): DirectorCandidate {
  const candidate = batch.candidates.find((item) => item.id === candidateId);
  if (!candidate) {
    throw new Error("目标方案不存在。");
  }
  return candidate;
}

function replaceCandidateInBatch(
  batch: DirectorCandidateBatch,
  nextCandidate: DirectorCandidate,
  summary: string,
): DirectorCandidateBatch {
  return {
    ...batch,
    refinementSummary: summary,
    candidates: batch.candidates.map((candidate) => (
      candidate.id === nextCandidate.id ? nextCandidate : candidate
    )),
  };
}

function replaceBatchInList(
  batches: DirectorCandidateBatch[],
  nextBatch: DirectorCandidateBatch,
): DirectorCandidateBatch[] {
  return batches.map((batch) => (batch.id === nextBatch.id ? nextBatch : batch));
}

export class NovelDirectorCandidateStageService {
  constructor(private readonly workflowService: WorkflowDependency) {}

  private async markCandidateProgress(
    workflowTaskId: string | undefined,
    itemKey: typeof DIRECTOR_CANDIDATE_SETUP_STEPS[number]["key"],
    itemLabel: string,
    progress: number,
  ): Promise<void> {
    if (!workflowTaskId?.trim()) {
      return;
    }
    await this.workflowService.markTaskRunning(workflowTaskId, {
      stage: "auto_director",
      itemKey,
      itemLabel,
      progress,
    });
  }

  private async generateBatch(context: CandidateGenerationContext & { workflowTaskId?: string }): Promise<{ batch: DirectorCandidateBatch }> {
    await this.markCandidateProgress(
      context.workflowTaskId,
      "candidate_direction_batch",
      context.batches.length === 0 ? "正在生成第一批书级方案" : "正在按修正意见生成新方案",
      DIRECTOR_PROGRESS.candidateDirectionBatch,
    );

    const parsed = await runStructuredPrompt({
      asset: directorCandidatePrompt,
      promptInput: {
        idea: context.idea,
        context: context.request,
        count: context.count,
        batches: context.batches,
        presets: context.presets,
        feedback: context.feedback,
      },
      contextBlocks: buildDirectorCandidateContextBlocks({
        idea: context.idea,
        context: context.request,
        latestBatch: context.batches.at(-1),
        presets: context.presets,
        feedback: context.feedback,
      }),
      options: {
        provider: context.options.provider,
        model: context.options.model,
        temperature: clampTemperature(context.options.temperature, 0.45),
      },
    });

    const normalizedCandidates = parsed.output.candidates.map((candidate, index) => normalizeCandidate(candidate, index));

    await this.markCandidateProgress(
      context.workflowTaskId,
      "candidate_title_pack",
      "正在为每套方案补强书名组",
      DIRECTOR_PROGRESS.candidateTitlePack,
    );
    const enrichedCandidates = await Promise.all(
      normalizedCandidates.map((candidate) => enhanceCandidateTitles(candidate, context)),
    );

    const round = (context.batches.at(-1)?.round ?? 0) + 1;
    return {
      batch: {
        id: randomUUID(),
        round,
        roundLabel: `第 ${round} 轮`,
        idea: context.idea.trim(),
        refinementSummary: buildRefinementSummary(context.presets, context.feedback, round),
        presets: context.presets,
        candidates: enrichedCandidates,
        createdAt: new Date().toISOString(),
      },
    };
  }

  async generateCandidates(input: DirectorCandidatesRequest): Promise<DirectorCandidatesResponse> {
    if (input.workflowTaskId?.trim()) {
      await this.workflowService.bootstrapTask({
        workflowTaskId: input.workflowTaskId,
        lane: "auto_director",
        title: input.title ?? null,
        seedPayload: buildWorkflowSeedPayload(input),
      });
    }

    await this.markCandidateProgress(
      input.workflowTaskId,
      "candidate_seed_alignment",
      "正在整理你的项目设定与起始灵感",
      DIRECTOR_PROGRESS.candidateSeedAlignment,
    );
    await this.markCandidateProgress(
      input.workflowTaskId,
      "candidate_project_framing",
      "正在对齐书级 framing 与前期承诺",
      DIRECTOR_PROGRESS.candidateProjectFraming,
    );

    const result = await this.generateBatch({
      idea: input.idea,
      count: 2,
      batches: [],
      presets: [],
      request: input,
      options: input,
      workflowTaskId: input.workflowTaskId,
    });
    if (!input.workflowTaskId?.trim()) {
      return result;
    }

    const workflowTask = await this.workflowService.bootstrapTask({
      workflowTaskId: input.workflowTaskId,
      lane: "auto_director",
      title: input.title ?? null,
      seedPayload: buildWorkflowSeedPayload(input, {
        batches: [result.batch],
      }),
    });
    await this.workflowService.recordCandidateSelectionRequired(workflowTask.id, {
      summary: `${result.batch.roundLabel} 已生成 ${result.batch.candidates.length} 套书级方向，并完成每套书名组。`,
      seedPayload: buildWorkflowSeedPayload(input, {
        batches: [result.batch],
      }),
    });
    return {
      ...result,
      workflowTaskId: workflowTask.id,
    };
  }

  async refineCandidates(input: DirectorRefinementRequest): Promise<DirectorRefineResponse> {
    if (input.workflowTaskId?.trim()) {
      await this.workflowService.bootstrapTask({
        workflowTaskId: input.workflowTaskId,
        lane: "auto_director",
        title: input.title ?? null,
        seedPayload: buildWorkflowSeedPayload(input, {
          batches: input.previousBatches,
        }),
      });
    }

    await this.markCandidateProgress(
      input.workflowTaskId,
      "candidate_seed_alignment",
      "正在读取上一轮方案与你的修正意见",
      DIRECTOR_PROGRESS.candidateSeedAlignment,
    );
    await this.markCandidateProgress(
      input.workflowTaskId,
      "candidate_project_framing",
      "正在对齐新的口味偏好与书级 framing",
      DIRECTOR_PROGRESS.candidateProjectFraming,
    );

    const result = await this.generateBatch({
      idea: input.idea,
      count: 2,
      batches: input.previousBatches,
      presets: input.presets ?? [],
      feedback: input.feedback,
      request: input,
      options: input,
      workflowTaskId: input.workflowTaskId,
    });
    if (!input.workflowTaskId?.trim()) {
      return result;
    }

    const nextBatches = [...input.previousBatches, result.batch];
    const workflowTask = await this.workflowService.bootstrapTask({
      workflowTaskId: input.workflowTaskId,
      lane: "auto_director",
      title: input.title ?? null,
      seedPayload: buildWorkflowSeedPayload(input, {
        batches: nextBatches,
      }),
    });
    await this.workflowService.recordCandidateSelectionRequired(workflowTask.id, {
      summary: `${result.batch.roundLabel} 已根据修正意见生成 ${result.batch.candidates.length} 套新方向，并完成标题组增强。`,
      seedPayload: buildWorkflowSeedPayload(input, {
        batches: nextBatches,
      }),
    });
    return {
      ...result,
      workflowTaskId: workflowTask.id,
    };
  }

  async patchCandidate(input: DirectorCandidatePatchRequest): Promise<DirectorCandidatePatchResponse> {
    const targetBatch = findTargetBatch(input.previousBatches, input.batchId);
    const targetCandidate = findTargetCandidate(targetBatch, input.candidateId);

    await this.markCandidateProgress(
      input.workflowTaskId,
      "candidate_seed_alignment",
      `正在读取《${targetCandidate.workingTitle}》的当前方案`,
      DIRECTOR_PROGRESS.candidateSeedAlignment,
    );
    await this.markCandidateProgress(
      input.workflowTaskId,
      "candidate_direction_batch",
      `正在按你的意见定向修正《${targetCandidate.workingTitle}》`,
      DIRECTOR_PROGRESS.candidateDirectionBatch,
    );

    const parsed = await runStructuredPrompt({
      asset: directorCandidatePatchPrompt,
      promptInput: {
        idea: input.idea,
        context: input,
        candidate: targetCandidate,
        batches: input.previousBatches,
        presets: input.presets ?? [],
        feedback: input.feedback,
      },
      contextBlocks: buildDirectorCandidateContextBlocks({
        idea: input.idea,
        context: input,
        latestBatch: input.previousBatches.at(-1),
        presets: input.presets ?? [],
        feedback: input.feedback,
      }),
      options: {
        provider: input.provider,
        model: input.model,
        temperature: clampTemperature(input.temperature, 0.4),
      },
    });

    await this.markCandidateProgress(
      input.workflowTaskId,
      "candidate_title_pack",
      `正在为《${targetCandidate.workingTitle}》重配书名组`,
      DIRECTOR_PROGRESS.candidateTitlePack,
    );
    const enrichedCandidate = await enhanceCandidateTitles({
      ...normalizeCandidate(parsed.output, 0),
      id: targetCandidate.id,
    }, {
      idea: input.idea,
      count: 1,
      batches: input.previousBatches,
      presets: input.presets ?? [],
      feedback: input.feedback,
      request: input,
      options: input,
    });

    const nextBatch = replaceCandidateInBatch(
      targetBatch,
      enrichedCandidate,
      `定向修正：${input.feedback.trim()}`,
    );
    const nextBatches = replaceBatchInList(input.previousBatches, nextBatch);

    if (!input.workflowTaskId?.trim()) {
      return {
        batch: nextBatch,
        candidate: enrichedCandidate,
      };
    }

    const workflowTask = await this.workflowService.bootstrapTask({
      workflowTaskId: input.workflowTaskId,
      lane: "auto_director",
      title: input.title ?? null,
      seedPayload: buildWorkflowSeedPayload(input, {
        batches: nextBatches,
      }),
    });
    await this.workflowService.recordCandidateSelectionRequired(workflowTask.id, {
      summary: `已按你的意见定向修正《${targetCandidate.workingTitle}》。`,
      seedPayload: buildWorkflowSeedPayload(input, {
        batches: nextBatches,
      }),
    });
    return {
      batch: nextBatch,
      candidate: enrichedCandidate,
      workflowTaskId: workflowTask.id,
    };
  }

  async refineCandidateTitleOptions(input: DirectorCandidateTitleRefineRequest): Promise<DirectorCandidateTitleRefineResponse> {
    const targetBatch = findTargetBatch(input.previousBatches, input.batchId);
    const targetCandidate = findTargetCandidate(targetBatch, input.candidateId);

    await this.markCandidateProgress(
      input.workflowTaskId,
      "candidate_title_pack",
      `正在重做《${targetCandidate.workingTitle}》的标题组`,
      DIRECTOR_PROGRESS.candidateTitlePack,
    );

    const response = await titleGenerationService.generateTitleIdeas({
      mode: "brief",
      brief: buildTargetedTitleBrief({
        candidate: targetCandidate,
        idea: input.idea,
        context: input,
        feedback: input.feedback,
      }),
      genreId: input.genreId ?? null,
      count: 4,
      provider: input.provider,
      model: input.model,
      temperature: clampTemperature(input.temperature, 0.85),
    });

    const titleOptions = mergeTitleOptions(response.titles, targetCandidate);
    const nextCandidate: DirectorCandidate = {
      ...targetCandidate,
      workingTitle: titleOptions[0]?.title?.trim() || targetCandidate.workingTitle,
      titleOptions,
    };
    const nextBatch = replaceCandidateInBatch(
      targetBatch,
      nextCandidate,
      `标题组修正：${input.feedback.trim()}`,
    );
    const nextBatches = replaceBatchInList(input.previousBatches, nextBatch);

    if (!input.workflowTaskId?.trim()) {
      return {
        batch: nextBatch,
        candidate: nextCandidate,
      };
    }

    const workflowTask = await this.workflowService.bootstrapTask({
      workflowTaskId: input.workflowTaskId,
      lane: "auto_director",
      title: input.title ?? null,
      seedPayload: buildWorkflowSeedPayload(input, {
        batches: nextBatches,
      }),
    });
    await this.workflowService.recordCandidateSelectionRequired(workflowTask.id, {
      summary: `已按你的意见重做《${targetCandidate.workingTitle}》的标题组。`,
      seedPayload: buildWorkflowSeedPayload(input, {
        batches: nextBatches,
      }),
    });
    return {
      batch: nextBatch,
      candidate: nextCandidate,
      workflowTaskId: workflowTask.id,
    };
  }
}
