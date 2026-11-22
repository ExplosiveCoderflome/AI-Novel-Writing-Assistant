import {downstreamArtifactTypes, latestArtifact, VersionConflictError} from "../domain";
import type {FactsLoader} from "./factsLoader";
import type {GateResolution, PlanRegistry} from "./ports";

export class GateResolutionError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {super(message); this.name = "GateResolutionError";}
}
/** Prepares pure invalidation policy; repository commits ledger, control and command together. */
export class GateService {
  constructor(private readonly deps: {factsLoader: Pick<FactsLoader, "load">; planRegistry: PlanRegistry}) {}
  async prepare(runId: string, decision: GateResolution["decision"], expectedVersion: number, revision: Pick<GateResolution,"expectedVolumePlanVersionId"|"guidance"|"chapterPlanEdit"|"assetEdit"|"proseReview"> = {}): Promise<GateResolution> {
    if (revision.guidance !== undefined && (decision !== "regenerate" || typeof revision.guidance !== "string" || revision.guidance.length > 6000)) throw new GateResolutionError("修正建议只能用于重新生成，且不能超过 6000 字。");
    if (revision.chapterPlanEdit) {
      const edit = revision.chapterPlanEdit;
      const acceptsOriginal = "chapters" in edit && !edit.chapters.length && Boolean(edit.approveForProse);
      if (decision !== (acceptsOriginal ? "confirm" : "confirm_after_edit")) throw new GateResolutionError("请在章节确认页核对并提交本次修改。");
    }
    const {contract, control, facts} = await this.deps.factsLoader.load(runId);
    if (control.version !== expectedVersion) throw new VersionConflictError(expectedVersion, control.version);
    if (control.status !== "waiting_gate" || !control.gate?.artifactTypes.length) throw new GateResolutionError("请先打开需要确认的创作阶段。");
    const types = control.gate.artifactTypes;
    if (revision.expectedVolumePlanVersionId && (types.length !== 1 || types[0] !== "volume_strategy" || decision === "regenerate")) {
      throw new GateResolutionError("请在卷纲确认页核对所选版本。");
    }
    if (revision.assetEdit && (decision !== "confirm_after_edit" || types.length !== 1 || types[0] !== revision.assetEdit.type)) {
      throw new GateResolutionError("请在对应的角色阵容或卷纲确认页保存修改。");
    }
    if (decision === "confirm_after_edit" && !revision.assetEdit && types.some(type => type === "character_cast" || type === "volume_strategy")) {
      throw new GateResolutionError("请先编辑内容，或选择“确认结果并继续”。");
    }
    const plan = this.deps.planRegistry.get(contract.planVersion);
    if (!plan) throw new GateResolutionError("缺少本次运行的创作计划。");
    if (revision.proseReview && (types.length !== 1 || types[0] !== "chapter_batch_closed" ||
      decision !== (revision.proseReview.chapters.some(chapter => chapter.content !== undefined) ? "confirm_after_edit" : "confirm") ||
      (revision.proseReview.nextRange && plan.steps.at(-1)?.produces !== "chapter_batch_closed"))) {
      throw new GateResolutionError("请在本批正文确认页核对章节与续写范围。");
    }
    const artifacts = control.gate.artifactTypes.map(type => {
      const step = plan.steps.find(step => step.produces === type && step.gateable);
      const artifact = latestArtifact(facts, type, contract.scope);
      if (!step || (contract.stepIdsInScope && !contract.stepIdsInScope.includes(step.id)) || !artifact
        || (artifact.status === "stale" && !artifact.protectedUserContent)) throw new GateResolutionError("需要确认的资产已变化，请刷新创作页面。");
      if (decision === "regenerate" && artifact.protectedUserContent) throw new GateResolutionError("该资产包含需保留的内容，请先在资产页面查看并保存调整。");
      return {type, expectedVersion: artifact.version};
    });
    // A combined approval must check the synchronized rows even if an older execution artifact exists.
    const approvesProse = revision.chapterPlanEdit && "chapters" in revision.chapterPlanEdit && revision.chapterPlanEdit.approveForProse;
    const invalidated = decision === "confirm" ? (approvesProse ? ["chapter_execution_contract"] : []) : [...new Set(artifacts.flatMap(artifact => downstreamArtifactTypes(plan, artifact.type)))];
    const invalidateTypes = [...new Set([...invalidated, ...(decision === "regenerate" ? artifacts.map(artifact => artifact.type) : [])])]
      .filter(type => type !== "chapter_draft" && (decision === "regenerate" || !artifacts.some(artifact => artifact.type === type)));
    if (revision.chapterPlanEdit && (artifacts.length !== 1 || artifacts[0].type !== "chapter_task_sheet")) throw new GateResolutionError("只能在章节任务与场景阶段编辑此计划。");
    return {decision, scope: contract.scope, artifacts, invalidateTypes,
      ...(revision.proseReview ? {proseReview:revision.proseReview} : {}),
      ...(revision.expectedVolumePlanVersionId ? {expectedVolumePlanVersionId: revision.expectedVolumePlanVersionId} : {}),
      ...(revision.guidance?.trim() ? {guidance: revision.guidance.trim()} : {}),
      ...(revision.assetEdit ? {assetEdit: revision.assetEdit} : {}),
      ...(revision.chapterPlanEdit ? {chapterPlanEdit: revision.chapterPlanEdit} : {})};
  }
}
