import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import { getDirectorInputFromSeedPayload } from "../novelDirectorHelpers";
import { getWorkflowStepCatalogEntry } from "@ai-novel/shared/types/directorWorkflowStepCatalog";
import {
  createWorkflowStepDescriptorFromCatalogEntry,
  createWorkflowStepModule,
  getWorkflowStepDirectorTaskId,
  type WorkflowStepExecutionContext,
  type WorkflowStepModule,
  type WorkflowStepModuleDescriptor,
} from "./WorkflowStepModule";
import {
  blockedState,
  buildSimpleProgress,
  completedFact,
  getDirectorCoreStateCommitter,
  getDirectorCoreStepRuntime,
  loadDirectorModuleState,
  loadFactBaseSummary,
  pendingFact,
  readyState,
  requireDirectorRequest,
} from "./directorWorkflowStepShared";
import { DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS } from "./directorWorkflowStepIds";

export type StructuredOutlineFactStep = "beat_sheet" | "chapter_list" | "chapter_detail_bundle";

export function buildStructuredOutlineStepDescriptor(input: {
  id: string;
  nodeKey: string;
  label: string;
  defaultWaitingState: WorkflowStepModuleDescriptor["defaultWaitingState"];
}): WorkflowStepModuleDescriptor {
  return createWorkflowStepDescriptorFromCatalogEntry({
    entry: getWorkflowStepCatalogEntry(input.id),
    defaultWaitingState: input.defaultWaitingState,
  });
}

async function inspectStructuredOutlineFactState(
  context: WorkflowStepExecutionContext,
  step: StructuredOutlineFactStep,
) {
  const summary = await loadFactBaseSummary(context);
  const hasStrategy = summary.outline.hasVolumeStrategy;
  const beatsReady = summary.outline.beatSheetReady;
  const chapterListReady = summary.outline.chapterListReady;
  const detailReady = summary.outline.chapterDetailReady;
  const selectedChapterCount = summary.outline.selectedChapterCount;
  const completedDetailSteps = summary.outline.completedDetailSteps;
  const totalDetailSteps = summary.outline.totalDetailSteps;
  const detailRatio = selectedChapterCount > 0 && totalDetailSteps > 0
    ? completedDetailSteps / totalDetailSteps
    : chapterListReady ? 0.6 : 0;
  const evidence = {
    hasVolumeStrategy: hasStrategy,
    characterCount: summary.book.characterCount,
    cursorStep: summary.outline.cursorStep,
    preparedVolumeIds: [],
    selectedChapterCount,
    completedDetailSteps,
    totalDetailSteps,
    remainingDetailSteps: Math.max(0, totalDetailSteps - completedDetailSteps),
  };
  if (!hasStrategy || summary.book.characterCount === 0) {
    return {
      readiness: blockedState("Volume strategy and character setup must exist before structured outline.", {
        code: "missing_structured_outline_inputs",
        evidence,
        nextAction: "prepare_upstream_assets",
      }),
      completion: pendingFact(step === "beat_sheet"
        ? DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.beat_sheet
        : step === "chapter_list"
          ? DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.chapter_list
          : DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.chapter_detail_bundle, { evidence }),
      progress: buildSimpleProgress({
        status: "blocked",
        ratio: 0,
        label: "等待卷战略与角色准备完成",
        evidence,
        nextAction: "prepare_upstream_assets",
      }),
    };
  }

  if (step === "beat_sheet") {
    return {
      readiness: readyState({ evidence, resumeFrom: summary.outline.cursorStep ?? "beat_sheet" }),
      completion: beatsReady
        ? completedFact(DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.beat_sheet, { evidence })
        : pendingFact(DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.beat_sheet, { evidence }),
      progress: buildSimpleProgress({
        status: beatsReady ? "completed" : "partially_done",
        ratio: beatsReady ? 1 : 0.25,
        label: beatsReady ? "卷节奏板已就绪" : "正在准备卷节奏板",
        evidence,
        nextAction: beatsReady ? "run_chapter_list_generation" : "run_beat_sheet_generation",
      }),
    };
  }

  if (step === "chapter_list") {
    const ready = beatsReady;
    return {
      readiness: ready
        ? readyState({ evidence, resumeFrom: summary.outline.cursorStep ?? "chapter_list" })
        : blockedState("Beat sheet must exist before chapter list generation.", {
          code: "missing_beat_sheet",
          evidence,
          nextAction: "run_beat_sheet_generation",
        }),
      completion: chapterListReady
        ? completedFact(DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.chapter_list, { evidence })
        : pendingFact(DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.chapter_list, {
          ratio: beatsReady ? 0.5 : 0,
          evidence,
        }),
      progress: buildSimpleProgress({
        status: chapterListReady ? "completed" : beatsReady ? "partially_done" : "blocked",
        ratio: chapterListReady ? 1 : beatsReady ? 0.5 : 0,
        label: chapterListReady ? "卷拆章列表已就绪" : beatsReady ? "正在生成章节列表" : "等待卷节奏板完成",
        evidence,
        nextAction: chapterListReady ? "run_chapter_detail_generation" : beatsReady ? "run_chapter_list_generation" : "run_beat_sheet_generation",
      }),
    };
  }

  const ready = chapterListReady;
  return {
    readiness: ready
      ? readyState({ evidence, resumeFrom: summary.outline.cursorStep ?? "chapter_detail_bundle" })
      : blockedState("Chapter list must exist before chapter detail generation.", {
        code: "missing_chapter_list",
        evidence,
        nextAction: "run_chapter_list_generation",
      }),
    completion: detailReady
      ? completedFact(DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.chapter_detail_bundle, { evidence })
      : pendingFact(DIRECTOR_STRUCTURED_OUTLINE_STEP_IDS.chapter_detail_bundle, {
        ratio: detailRatio,
        evidence,
      }),
    progress: buildSimpleProgress({
      status: detailReady ? "completed" : chapterListReady ? "partially_done" : "blocked",
      ratio: detailReady ? 1 : detailRatio,
      label: detailReady
        ? "章节任务单与执行细化已就绪"
        : chapterListReady && totalDetailSteps > 0 && completedDetailSteps > 0
          ? `已细化 ${completedDetailSteps}/${totalDetailSteps} 章，继续补齐剩余章节任务单`
          : chapterListReady
            ? "正在细化章节执行资源"
            : "等待章节列表完成",
      evidence,
      nextAction: detailReady ? "sync_execution_contracts" : chapterListReady ? "run_chapter_detail_generation" : "run_chapter_list_generation",
    }),
  };
}

export function createStructuredOutlineFactModule(input: {
  step: StructuredOutlineFactStep;
  descriptor: WorkflowStepModuleDescriptor;
}): WorkflowStepModule<{ taskId: string; novelId: string; request: DirectorConfirmRequest }, void> {
  return createWorkflowStepModule(
    input.descriptor,
    async (moduleInput) => getDirectorCoreStepRuntime().executeStructuredOutlineFactStep(moduleInput),
    {
      inspectReadiness: async (context) => (await inspectStructuredOutlineFactState(context, input.step)).readiness,
      inspectCompletion: async (context) => (await inspectStructuredOutlineFactState(context, input.step)).completion,
      buildInput: async (context) => {
        const { novelId, request } = await loadDirectorModuleState(context);
        return {
          taskId: getWorkflowStepDirectorTaskId(context) ?? "",
          novelId,
          request: requireDirectorRequest(request),
        };
      },
      validateOutput: async (_output, context) => {
        const result = await inspectStructuredOutlineFactState(context, input.step);
        return {
          valid: result.completion.completed,
          reason: result.completion.completed ? undefined : `${input.descriptor.id} did not produce the expected structured outline facts.`,
          evidence: result.completion.evidence,
        };
      },
      commit: async (_output, context) => {
        const { state, novelId } = await loadDirectorModuleState(context);
        const producedArtifacts = await getDirectorCoreStepRuntime().collectWrittenArtifacts(
          novelId,
          state.task.id,
          input.descriptor.writes,
        );
        await getDirectorCoreStateCommitter().recordArtifactsIndexed({
          taskId: state.task.id,
          novelId,
          runtimeId: state.runtime?.id ?? null,
          nodeKey: input.descriptor.nodeKey,
          artifacts: producedArtifacts,
        });
        return { producedArtifacts };
        },
        inspectProgress: async (context) => (await inspectStructuredOutlineFactState(context, input.step)).progress,
        recover: async (context) => {
          const { novelId, state } = await loadDirectorModuleState(context);
          const cursor = await getDirectorCoreStepRuntime().getStructuredOutlineRecoveryCursor(novelId, state.seedPayload ? getDirectorInputFromSeedPayload(state.seedPayload) : null);
          const resumeFrom = cursor?.step ?? input.step;
          return {
            recoverable: true,
            resumeFrom,
            reason: "Structured outline can resume from the latest observable outline facts.",
          };
      },
      completeCriteria: async (_output, context) => (await inspectStructuredOutlineFactState(context, input.step)).completion.completed,
    },
  );
}
