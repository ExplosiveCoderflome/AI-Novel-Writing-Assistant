import { normalizePlanMetadata } from "../plannerPlanMetadata";
import { resolveChapterPlanParticipants } from "../plannerParticipantResolution";
import { compactPlannerText as compactText,takeUniquePlannerItems as takeUnique } from "../plannerStateDirectives";
import { normalizePlannerOutput,type PlannerOutput } from "../plannerOutputNormalization";
import type { PersistPlanInput } from "../plannerPersistence";
import { plannerChapterPlanPrompt } from "../../../prompting/prompts/planner/plannerPlan.prompts";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import type { PreparedChapterPlan } from "./prepare";

export async function executePreparedChapterPlan(prepared: PreparedChapterPlan, invoke: (request:PreparedChapterPlan["request"])=>Promise<{output:unknown}> = runStructuredPrompt):Promise<PlannerOutput> {
  if(prepared.request.asset.id !== plannerChapterPlanPrompt.id || prepared.request.asset.version !== plannerChapterPlanPrompt.version)throw new Error("Chapter planner Prompt snapshot changed");
  const result=await invoke({...prepared.request,asset:plannerChapterPlanPrompt});return normalizePlannerOutput(result.output);
}

export function projectChapterPlan(prepared: PreparedChapterPlan, output:PlannerOutput):PersistPlanInput {
  const {novelId,chapter,defaultMetadata,characters,characterDynamicsOverview,resolvedStateDrivenContext,anchoredVolumeChapter,replanContext}=prepared.projection;
  const options={replanContext};
  const metadata = normalizePlanMetadata("chapter", output, {
    ...defaultMetadata,
    sourceIssueIds: options.replanContext?.sourceIssueIds ?? [],
    replannedFromPlanId: options.replanContext?.replannedFromPlanId ?? null,
  });
  const chapterStateGoal = resolvedStateDrivenContext.chapterStateGoal;
  const resolvedParticipants = resolveChapterPlanParticipants({
    outputParticipants: output.participants ?? [],
    characters,
    characterDynamicsOverview,
    chapterOrder: chapter.order,
  });

  return {
    novelId,
    chapterId: chapter.id,
    sourceStateSnapshotId: resolvedStateDrivenContext.snapshot.sourceSnapshotId ?? null,
    level: "chapter",
    title: output.title || chapter.title,
    objective: output.objective
      || compactText(chapterStateGoal?.summary)
      || chapter.expectation?.trim()
      || `推进第${chapter.order}章主线。`,
    targetWordCount: chapter.targetWordCount,
    participants: resolvedParticipants,
    reveals: output.reveals ?? [],
    riskNotes: takeUnique([
      ...(output.riskNotes ?? []),
      ...resolvedStateDrivenContext.protectedSecrets.map((item) => `禁止提前泄露：${item}`),
    ], 8),
    hookTarget: output.hookTarget || chapter.hook?.trim() || null,
    baseExecutionContract: {
      expectation: chapter.expectation,
      targetWordCount: chapter.targetWordCount,
      conflictLevel: anchoredVolumeChapter?.conflictLevel ?? chapter.conflictLevel,
      revealLevel: chapter.revealLevel,
      mustAvoid: chapter.mustAvoid,
      taskSheet: chapter.taskSheet,
      sceneCards: chapter.sceneCards,
      hook: chapter.hook,
    },
    scenes: output.scenes ?? [],
    planRole: metadata.planRole,
    phaseLabel: metadata.phaseLabel,
    mustAdvance: takeUnique([
      ...(chapterStateGoal?.targetConflicts ?? []),
      ...metadata.mustAdvance,
    ], 8),
    mustPreserve: takeUnique([
      ...(chapterStateGoal?.targetRelationships ?? []),
      ...metadata.mustPreserve,
    ], 8),
    sourceIssueIds: metadata.sourceIssueIds,
    replannedFromPlanId: metadata.replannedFromPlanId,
  };
}
