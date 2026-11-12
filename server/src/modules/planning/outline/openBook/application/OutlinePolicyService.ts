import type { PrismaClient } from "@prisma/client";
import { outlinePolicyPatchSchema } from "@ai-novel/shared/types/outlineOpenBook";
import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import { patchOutlinePolicy, applyOutlinePolicy } from "../domain/policy";
import { OutlineOpenBookError } from "../domain/errors";
import { readOutlinePlanningState } from "./OutlinePlanningContext";
import { persistActiveVolumeWorkspace } from "../../../../../services/novel/volume/volumeWorkspacePersistence";
import { buildVolumeWorkspaceDocument } from "../../../../../services/novel/volume/volumeWorkspaceDocument";
import { withSqliteRetry } from "../../../../../db/sqliteRetry";
export class OutlinePolicyService {
  constructor(private readonly db: PrismaClient) {}
  async update(projectId: string, raw: unknown) {
    const patch = outlinePolicyPatchSchema.parse(raw);
    return withSqliteRetry(() => this.db.$transaction(async tx => {
      const b = await tx.outlineBookBinding.findUnique({where: {projectId}});
      if (!b) throw new OutlineOpenBookError("OUTLINE_BINDING_NOT_FOUND", "这份大纲尚未开书。", 404);
      if (b.policyVersion !== patch.expectedPolicyVersion) throw new OutlineOpenBookError("OUTLINE_POLICY_CONFLICT", "保留策略已变化，请刷新后重试。");
      const state = await readOutlinePlanningState(tx, b.novelId);
      if (!state) throw new OutlineOpenBookError("OUTLINE_BINDING_INTEGRITY", "找不到采用的大纲。");
      const policy = patchOutlinePolicy(state.policy, patch);
      const effective = applyOutlinePolicy(state.document, policy);
      const changed = await tx.outlineBookBinding.updateMany({where: {id: b.id, policyVersion: patch.expectedPolicyVersion}, data: {policyJson: JSON.stringify(policy), policyVersion: {increment: 1}}});
      if (changed.count !== 1) throw new OutlineOpenBookError("OUTLINE_POLICY_CONFLICT", "保留策略已变化，请刷新后重试。");
      const volumeFields: Record<string,string> = {title: "title", summary: "summary", promise: "mainPromise", pressure: "primaryPressureSource", protagonistChange: "protagonistChange", climax: "climax", endingHook: "nextVolumeHook"};
      const chapterFields: Record<string,string> = {title: "title", summary: "summary", purpose: "purpose"};
      let workspace = state.baseline ? structuredClone(state.baseline) : null;
      for (const change of patch.changes) {
        if (!("value" in change)) continue;
        const v = state.mapping.volumes.find(v => v.nodeId === change.nodeId);
        const c = state.mapping.chapters.find(c => c.nodeId === change.nodeId);
        const character = state.mapping.characters.find(c => c.nodeId === change.nodeId);
        if (v && workspace && volumeFields[change.field]) {
          const target = workspace.volumes.find(x => x.id === v.volumeId)!;
          (target as unknown as Record<string, unknown>)[volumeFields[change.field]] = change.value;
        }
        if (c && workspace) {
          const chapter = workspace.volumes.flatMap(v => v.chapters).find(x => x.id === c.planId)!;
          if (chapterFields[change.field]) (chapter as unknown as Record<string, unknown>)[chapterFields[change.field]] = change.value;
          if (change.field === "title" || change.field === "summary") await tx.chapter.update({where: {id: c.chapterId}, data: change.field === "title" ? {title: String(change.value)} : {expectation: String(change.value)}});
          if (change.field === "characterNodeIds") chapter.plannedCharacterIds = effective.chapters.find(x => x.nodeId === c.nodeId)!.characterNodeIds.map(id => state.mapping.characters.find(x => x.nodeId === id)!.characterId);
        }
        const characterFields: Record<string,string> = {name: "name", role: "role", goal: "outerGoal", secret: "secret", arcDirection: "development"};
        if (character && characterFields[change.field]) await tx.character.update({where: {id: character.characterId}, data: {[characterFields[change.field]]: change.value}});
        if (change.nodeId === effective.story.nodeId) {
          const storyFields: Record<string,string> = {title: "title", tone: "styleTone", targetAudience: "targetAudience"};
          if (storyFields[change.field]) await tx.novel.update({where: {id: b.novelId}, data: {[storyFields[change.field]]: change.value}});
          if (["premise", "synopsis"].includes(change.field)) await tx.novel.update({where: {id: b.novelId}, data: {description: effective.story.synopsis || effective.story.premise}});
        }
      }
      if (workspace) {
        if (patch.changes.some(c => ["characterNodeIds", "appearanceNodeIds"].includes(c.field) && "value" in c)) {
          for (const mapped of state.mapping.chapters) {
            const source = effective.chapters.find(c => c.nodeId === mapped.nodeId)!;
            const cast = effective.characters.filter(c => source.characterNodeIds.includes(c.nodeId) || c.appearanceNodeIds.includes(source.nodeId));
            workspace.volumes.flatMap(v => v.chapters).find(c => c.id === mapped.planId)!.plannedCharacterIds = cast.map(c => state.mapping.characters.find(m => m.nodeId === c.nodeId)!.characterId);
          }
        }
        const reconcile = (existing: string[], nodeIds: string[]) => [
          ...existing.filter(ref => !state.mapping.payoffs.some(p => ref.includes(`[${p.ledgerKey}]`))),
          ...nodeIds.map(id => `计划：${effective.payoffs.find(p => p.nodeId === id)!.title} [${state.mapping.payoffs.find(p => p.nodeId === id)!.ledgerKey}]`),
        ];
        for (const volume of workspace.volumes) {
          const sourceChapterIds = state.mapping.chapters.filter(c => c.volumeId === volume.id).map(c => c.nodeId);
          volume.openPayoffs = reconcile(volume.openPayoffs, effective.payoffs.filter(p => [...p.setupChapterNodeIds, ...p.payoffChapterNodeIds].some(id => sourceChapterIds.includes(id))).map(p => p.nodeId));
          for (const mapped of state.mapping.chapters.filter(c => c.volumeId === volume.id)) {
            const chapter = volume.chapters.find(c => c.id === mapped.planId)!;
            chapter.payoffRefs = reconcile(chapter.payoffRefs, effective.chapters.find(c => c.nodeId === mapped.nodeId)!.payoffNodeIds);
          }
        }
        workspace = buildVolumeWorkspaceDocument(workspace);
        await persistActiveVolumeWorkspace(tx, b.novelId, workspace, workspace.activeVersionId);
        if (workspace.activeVersionId) await tx.volumePlanVersion.update({where: {id: workspace.activeVersionId}, data: {contentJson: JSON.stringify(workspace)}});
      }
      return {bindingId: b.id, policyVersion: patch.expectedPolicyVersion+1, policy};
    }), {label: "outline-policy"});
  }
}
