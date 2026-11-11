import type { ProductionStepId, StepHandler } from "../../../modules/director";
import type { NovelVolumeService } from "../../../services/novel/volume/NovelVolumeService";
import { prisma } from "../../../db/prisma";
import { artifactContentHash } from "../../../modules/director";
import { readOutlinePlanningState, assertOutlineReference, withOutlinePlanningState } from "../../../modules/planning/outline/constraints";
import { buildVolumeWorkspaceDocument } from "../../../services/novel/volume/volumeWorkspaceDocument";
import { modelOptions, targetVolume } from "../productionInputs";
import { ensureOutlineRouteWindow } from "../../../services/novel/volume/routeWindow/outlineSlots";

export function withOutlineOpeningSteps(handlers: Record<ProductionStepId, StepHandler>, volumes: NovelVolumeService): Record<ProductionStepId, StepHandler> {
  return Object.fromEntries(Object.entries(handlers).map(([id, original]) => [id, async (context: Parameters<StepHandler>[0]) => {
    const ref = context.contract.launchInput?.outlineBinding;
    if (!ref) return original(context);
    await assertOutlineReference(prisma, context.contract.novelId, ref);
    const state = await readOutlinePlanningState(prisma, context.contract.novelId, context.contract.chapterRange ?? {from: 1, to: 1});
    if (!state) throw new Error("大纲绑定不存在。");
    return withOutlinePlanningState(state, async () => {
      if (id === "volume_beat_sheet") {
        const workspace = await volumes.getVolumes(state.novelId, {hydrateCanonical: false});
        const targetVolumeId = targetVolume(context, workspace);
        let sheet = workspace.beatSheets.find(s => s.volumeId === targetVolumeId && s.beats.length);
        if (!sheet) {
          const generated = await volumes.generateVolumes(state.novelId, {...modelOptions(context), scope: "beat_sheet", targetVolumeId,
            draftWorkspace: workspace, taskId: context.runId, entrypoint: "director_next", persistIntermediateDocuments: false});
          const saved = await volumes.updateVolumesWithOptions(state.novelId, generated, {emitEvent: false, syncPayoffLedger: false, syncToChapterExecution: false,
            memoryTelemetry: {entrypoint: "director_next", taskId: context.runId, stage: "structured_outline", scope: "beat_sheet", volumeId: targetVolumeId}});
          sheet = saved.beatSheets.find(s => s.volumeId === targetVolumeId && s.beats.length);
        }
        if (!sheet) throw new Error("当前卷缺少可确认的节奏安排。");
        return {artifact: {scope: context.contract.scope, status: "draft" as const, protectedUserContent: false,
          contentRef: `volume_beat_sheet:${state.novelId}:${targetVolumeId}`, contentHash: artifactContentHash(sheet)}};
      }
      if (id === "volume_chapter_list") {
        // Preparation without a prose range still only creates the current opening route, never a full-volume list.
        await ensureOutlineRouteWindow(state.novelId, state.range.from, {...modelOptions(context), min: 1, target: 1, taskId: context.runId}, volumes, state);
        const workspace = await volumes.getVolumes(state.novelId, {hydrateCanonical: false});
        const routes = workspace.volumes.flatMap(v => v.chapters).filter(c => c.chapterOrder === state.range.from);
        if (routes.length !== 1) throw new Error("当前章缺少唯一的已保存路线。");
        return {artifact: {scope: context.contract.scope, status: "draft" as const, protectedUserContent: false, contentRef: `volume_chapter_list:${state.novelId}:${state.range.from}`, contentHash: artifactContentHash(routes)}};
      }
      const result = await original(context);
      await assertOutlineReference(prisma, state.novelId, ref);
      if (id === "volume_strategy" && !state.mapping.volumes.length && !state.mapping.runtimeVolumes?.length) {
        const workspace = await volumes.getVolumes(state.novelId, {hydrateCanonical: false});
        const total = context.contract.launchInput!.estimatedChapterCount;
        if (workspace.volumes.length > total) throw new Error("卷数超过确认章数，请调整卷规划。");
        let from = 1, remaining = total;
        const runtimeVolumes = workspace.volumes.map((v, i) => {const chapterQuota = Math.floor(remaining/(workspace.volumes.length-i));const slot = {volumeId: v.id, chapterQuota, from, to: from+chapterQuota-1};from += chapterQuota;remaining -= chapterQuota;return slot;});
        const updated = await prisma.outlineBookBinding.updateMany({where: {id: ref.bindingId, policyVersion: ref.policyVersion, mappingJson: JSON.stringify(state.mapping)}, data: {mappingJson: JSON.stringify({...state.mapping, runtimeVolumes})}});
        if (updated.count !== 1) throw new Error("大纲篇幅分配在准备期间变化，请重试。");
      }
      return result;
    });
  }])) as Record<ProductionStepId, StepHandler>;
}
