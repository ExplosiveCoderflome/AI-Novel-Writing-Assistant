import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import {
  getDirectorStageNodeAdapter,
  type DirectorPlanningStage,
} from "../novelDirectorStageNodeAdapters";
import {
  createWorkflowStepDescriptorFromDirectorAdapter,
  createWorkflowStepModule,
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
import { DIRECTOR_PLANNING_STEP_IDS } from "./directorWorkflowStepIds";
import {
  buildStructuredOutlineStepDescriptor,
  createStructuredOutlineFactModule,
} from "./directorStructuredOutlineStepFactory";

function createStoryMacroExecutableModule(
  descriptor: WorkflowStepModuleDescriptor,
): WorkflowStepModule<{ taskId: string; novelId: string; request: DirectorConfirmRequest }, StoryMacroPlan> {
  return createWorkflowStepModule(
    descriptor,
    async (input) => getDirectorCoreStepRuntime().executeStoryMacroStep(input),
    {
      inspectReadiness: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        return readyState({
          evidence: {
            artifactType: "story_macro",
            hasStoryMacro: Boolean(await getDirectorCoreStepRuntime().getStoryMacroPlan(novelId)),
          },
        });
      },
      inspectCompletion: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const plan = await getDirectorCoreStepRuntime().getStoryMacroPlan(novelId);
        return plan?.decomposition && typeof plan.storyInput === "string" && plan.storyInput.trim()
          ? completedFact(descriptor.id, { evidence: { artifactType: "story_macro" } })
          : pendingFact(descriptor.id, { evidence: { artifactType: "story_macro" } });
      },
      buildInput: async (context) => {
        const { novelId, request } = await loadDirectorModuleState(context);
        return {
          taskId: context.taskId?.trim() ?? "",
          novelId,
          request: requireDirectorRequest(request),
        };
      },
      validateOutput: async (output, context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const plan = await getDirectorCoreStepRuntime().getStoryMacroPlan(novelId);
        return {
          valid: Boolean(output && plan?.decomposition),
          reason: output && plan?.decomposition ? undefined : "Story macro output was not persisted.",
        };
      },
      commit: async (_output, context) => {
        const { state, novelId } = await loadDirectorModuleState(context);
        const producedArtifacts = await getDirectorCoreStepRuntime().collectWrittenArtifacts(
          novelId,
          state.task.id,
          descriptor.writes,
        );
        await getDirectorCoreStateCommitter().recordArtifactsIndexed({
          taskId: state.task.id,
          novelId,
          runtimeId: state.runtime?.id ?? null,
          nodeKey: descriptor.nodeKey,
          artifacts: producedArtifacts,
        });
        return { producedArtifacts };
      },
      inspectProgress: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const plan = await getDirectorCoreStepRuntime().getStoryMacroPlan(novelId);
        return plan?.decomposition
          ? buildSimpleProgress({
            status: "completed",
            ratio: 1,
            label: "故事宏观规划已完成",
            evidence: { artifactType: "story_macro" },
          })
          : buildSimpleProgress({
            status: "not_started",
            ratio: 0,
            label: "等待生成故事宏观规划",
            nextAction: "run_story_macro",
          });
      },
      recover: async (context) => {
        const progress = await getDirectorCoreStepRuntime().getStoryMacroPlan((await loadDirectorModuleState(context)).novelId);
        return progress?.decomposition
          ? { recoverable: true, resumeFrom: "story_macro_artifact", reason: "Story macro artifact already exists." }
          : { recoverable: true, resumeFrom: "story_macro", reason: "Story macro can be regenerated." };
      },
      completeCriteria: async (_output, context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const plan = await getDirectorCoreStepRuntime().getStoryMacroPlan(novelId);
        return Boolean(plan?.decomposition);
      },
    },
  );
}

function createBookContractExecutableModule(
  descriptor: WorkflowStepModuleDescriptor,
): WorkflowStepModule<{ taskId: string; novelId: string; request: DirectorConfirmRequest }, void> {
  return createWorkflowStepModule(
    descriptor,
    async (input) => getDirectorCoreStepRuntime().executeBookContractStep(input),
    {
      inspectReadiness: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const contract = await getDirectorCoreStepRuntime().getBookContract(novelId);
        const plan = await getDirectorCoreStepRuntime().getStoryMacroPlan(novelId);
        if (!plan?.decomposition) {
          return blockedState("Story macro is required before book contract.", {
            code: "missing_story_macro",
            evidence: { artifactType: "story_macro" },
            nextAction: "run_story_macro",
          });
        }
        return readyState({ evidence: { artifactType: "book_contract", hasBookContract: Boolean(contract) } });
      },
      inspectCompletion: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const contract = await getDirectorCoreStepRuntime().getBookContract(novelId);
        return contract
          ? completedFact(descriptor.id, { evidence: { artifactType: "book_contract" } })
          : pendingFact(descriptor.id, { evidence: { artifactType: "book_contract" } });
      },
      buildInput: async (context) => {
        const { novelId, request } = await loadDirectorModuleState(context);
        return {
          taskId: context.taskId?.trim() ?? "",
          novelId,
          request: requireDirectorRequest(request),
        };
      },
      validateOutput: async (_output, context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const contract = await getDirectorCoreStepRuntime().getBookContract(novelId);
        return {
          valid: Boolean(contract),
          reason: contract ? undefined : "Book contract was not persisted.",
        };
      },
      commit: async (_output, context) => {
        const { state, novelId } = await loadDirectorModuleState(context);
        const producedArtifacts = await getDirectorCoreStepRuntime().collectWrittenArtifacts(
          novelId,
          state.task.id,
          descriptor.writes,
        );
        await getDirectorCoreStateCommitter().recordArtifactsIndexed({
          taskId: state.task.id,
          novelId,
          runtimeId: state.runtime?.id ?? null,
          nodeKey: descriptor.nodeKey,
          artifacts: producedArtifacts,
        });
        return { producedArtifacts };
      },
      inspectProgress: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const contract = await getDirectorCoreStepRuntime().getBookContract(novelId);
        return contract
          ? buildSimpleProgress({
            status: "completed",
            ratio: 1,
            label: "书级创作约定已完成",
            evidence: { artifactType: "book_contract" },
          })
          : buildSimpleProgress({
            status: "not_started",
            ratio: 0,
            label: "等待生成书级创作约定",
            nextAction: "run_book_contract",
          });
        },
        recover: async (context) => {
          const { novelId, state } = await loadDirectorModuleState(context);
          const contract = await getDirectorCoreStepRuntime().getBookContract(novelId);
          if (contract) {
            return { recoverable: true, resumeFrom: "book_contract_artifact", reason: "Book contract artifact already exists." };
          }
          return { recoverable: true, resumeFrom: "book_contract", reason: "Book contract can be regenerated." };
        },
      completeCriteria: async (_output, context) => {
        const { novelId } = await loadDirectorModuleState(context);
        return Boolean(await getDirectorCoreStepRuntime().getBookContract(novelId));
      },
    },
  );
}

function createCharacterSetupExecutableModule(
  descriptor: WorkflowStepModuleDescriptor,
): WorkflowStepModule<{ taskId: string; novelId: string; request: DirectorConfirmRequest }, boolean> {
  return createWorkflowStepModule(
    descriptor,
    async (input) => getDirectorCoreStepRuntime().executeCharacterSetupStep(input),
    {
      inspectReadiness: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const characterCount = (await getDirectorCoreStepRuntime().getCharacters(novelId)).length;
        const plan = await getDirectorCoreStepRuntime().getStoryMacroPlan(novelId);
        const contract = await getDirectorCoreStepRuntime().getBookContract(novelId);
        if (!plan?.decomposition || !contract) {
          return blockedState("Story macro and book contract are required before character setup.", {
            code: "missing_character_inputs",
            evidence: {
              hasStoryMacro: Boolean(plan?.decomposition),
              hasBookContract: Boolean(contract),
            },
            nextAction: "prepare_upstream_assets",
          });
        }
        return readyState({ evidence: { artifactType: "character_cast", characterCount } });
      },
      inspectCompletion: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const characterCount = (await getDirectorCoreStepRuntime().getCharacters(novelId)).length;
        return characterCount > 0
          ? completedFact(descriptor.id, { evidence: { artifactType: "character_cast", characterCount } })
          : pendingFact(descriptor.id, { evidence: { artifactType: "character_cast", characterCount } });
      },
      buildInput: async (context) => {
        const { novelId, request } = await loadDirectorModuleState(context);
        return {
          taskId: context.taskId?.trim() ?? "",
          novelId,
          request: requireDirectorRequest(request),
        };
      },
      commit: async (_output, context) => {
        const { state, novelId } = await loadDirectorModuleState(context);
        const producedArtifacts = await getDirectorCoreStepRuntime().collectWrittenArtifacts(
          novelId,
          state.task.id,
          descriptor.writes,
        );
        await getDirectorCoreStateCommitter().recordArtifactsIndexed({
          taskId: state.task.id,
          novelId,
          runtimeId: state.runtime?.id ?? null,
          nodeKey: descriptor.nodeKey,
          artifacts: producedArtifacts,
        });
        return { producedArtifacts };
      },
      inspectProgress: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const characterCount = (await getDirectorCoreStepRuntime().getCharacters(novelId)).length;
        return characterCount > 0
          ? buildSimpleProgress({
            status: "completed",
            ratio: 1,
            label: "角色准备已完成",
            evidence: { artifactType: "character_cast", characterCount },
          })
          : buildSimpleProgress({
            status: "not_started",
            ratio: 0,
            label: "等待补齐角色阵容",
            nextAction: "run_character_setup",
          });
      },
      recover: async (_context) => ({
        recoverable: true,
        resumeFrom: "character_setup",
        reason: "Character setup can resume from the current workspace.",
      }),
      completeCriteria: async (_output, context) => {
        const summary = await loadFactBaseSummary(context);
        return summary.book.characterCount > 0;
      },
    },
  );
}

function createVolumeStrategyExecutableModule(
  descriptor: WorkflowStepModuleDescriptor,
): WorkflowStepModule<{ taskId: string; novelId: string; request: DirectorConfirmRequest }, VolumePlanDocument | null> {
  return createWorkflowStepModule(
    descriptor,
    async (input) => getDirectorCoreStepRuntime().executeVolumeStrategyStep(input),
    {
      inspectReadiness: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const workspace = await getDirectorCoreStepRuntime().getVolumeWorkspace(novelId);
        const characterCount = (await getDirectorCoreStepRuntime().getCharacters(novelId)).length;
        if (characterCount === 0) {
          return blockedState("Character setup is required before volume strategy.", {
            code: "missing_character_setup",
            evidence: { characterCount },
            nextAction: "run_character_setup",
          });
        }
        return readyState({
          evidence: {
            artifactType: "volume_strategy",
            hasStrategyPlan: Boolean(workspace?.strategyPlan),
            volumeCount: workspace?.volumes.length ?? 0,
          },
        });
      },
      inspectCompletion: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const workspace = await getDirectorCoreStepRuntime().getVolumeWorkspace(novelId);
        return workspace?.strategyPlan && workspace.volumes.length > 0
          ? completedFact(descriptor.id, {
            evidence: { artifactType: "volume_strategy", volumeCount: workspace.volumes.length },
          })
          : pendingFact(descriptor.id, {
            ratio: workspace?.strategyPlan ? 0.5 : 0,
            evidence: {
              artifactType: "volume_strategy",
              hasStrategyPlan: Boolean(workspace?.strategyPlan),
              volumeCount: workspace?.volumes.length ?? 0,
            },
          });
      },
      buildInput: async (context) => {
        const { novelId, request } = await loadDirectorModuleState(context);
        return {
          taskId: context.taskId?.trim() ?? "",
          novelId,
          request: requireDirectorRequest(request),
        };
      },
      commit: async (_output, context) => {
        const { state, novelId } = await loadDirectorModuleState(context);
        const producedArtifacts = await getDirectorCoreStepRuntime().collectWrittenArtifacts(
          novelId,
          state.task.id,
          descriptor.writes,
        );
        await getDirectorCoreStateCommitter().recordArtifactsIndexed({
          taskId: state.task.id,
          novelId,
          runtimeId: state.runtime?.id ?? null,
          nodeKey: descriptor.nodeKey,
          artifacts: producedArtifacts,
        });
        return { producedArtifacts };
      },
      inspectProgress: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const workspace = await getDirectorCoreStepRuntime().getVolumeWorkspace(novelId);
        return workspace?.strategyPlan && workspace.volumes.length > 0
          ? buildSimpleProgress({
            status: "completed",
            ratio: 1,
            label: "分卷策略已完成",
            evidence: { artifactType: "volume_strategy", volumeCount: workspace.volumes.length },
          })
          : buildSimpleProgress({
            status: "not_started",
            ratio: 0,
            label: "等待生成分卷策略",
            nextAction: "run_volume_strategy",
          });
      },
      recover: async (_context) => ({
        recoverable: true,
        resumeFrom: "volume_strategy",
        reason: "Volume strategy can resume from the current workspace.",
      }),
      completeCriteria: async (_output, context) => {
        const { novelId } = await loadDirectorModuleState(context);
        const workspace = await getDirectorCoreStepRuntime().getVolumeWorkspace(novelId);
        return Boolean(workspace?.strategyPlan) && (workspace?.volumes.length ?? 0) > 0;
      },
    },
  );
}

export const DIRECTOR_PLANNING_STEP_MODULES: Record<
  DirectorPlanningStage,
  WorkflowStepModuleDescriptor
> = {
  story_macro: createStoryMacroExecutableModule(createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_PLANNING_STEP_IDS.story_macro,
    stage: "story_macro",
    adapter: getDirectorStageNodeAdapter("story_macro"),
  })),
  book_contract: createBookContractExecutableModule(createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_PLANNING_STEP_IDS.book_contract,
    stage: "story_macro",
    adapter: getDirectorStageNodeAdapter("book_contract"),
  })),
  character_setup: createCharacterSetupExecutableModule(createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_PLANNING_STEP_IDS.character_setup,
    stage: "character_setup",
    adapter: getDirectorStageNodeAdapter("character_setup"),
  })),
  volume_strategy: createVolumeStrategyExecutableModule(createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_PLANNING_STEP_IDS.volume_strategy,
    stage: "volume_strategy",
    adapter: getDirectorStageNodeAdapter("volume_strategy"),
  })),
  structured_outline: createStructuredOutlineFactModule({
    step: "beat_sheet",
    descriptor: buildStructuredOutlineStepDescriptor({
      id: DIRECTOR_PLANNING_STEP_IDS.structured_outline,
      nodeKey: "volume_beat_sheet_generate",
      label: "生成目标卷节奏板",
      defaultWaitingState: {
        stage: "structured_outline",
        itemKey: "beat_sheet",
        itemLabel: "等待卷节奏板准备完成",
        progress: 0.72,
      },
    }),
  }),
};
