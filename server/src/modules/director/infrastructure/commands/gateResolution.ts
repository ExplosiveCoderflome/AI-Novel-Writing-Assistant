import type {Prisma} from "@prisma/client";
import {GateResolutionError, type GateResolution} from "../../application";
import {VersionConflictError, type RunContract, type RunControl} from "../../domain";

export type ArtifactEditReader = (input: {contract: RunContract; type: string; contentRef: string}, tx: Prisma.TransactionClient)
  => Promise<{contentRef: string; contentHash: string}>;

export async function commitGateResolution(tx: Prisma.TransactionClient, input: {runId: string; contract: RunContract; control: RunControl; resolution: GateResolution}, readEdit?: ArtifactEditReader) {
  const {contract, control, resolution} = input;
  if (control.status !== "waiting_gate" || !control.gate || resolution.scope !== contract.scope
    || resolution.artifacts.length !== control.gate.artifactTypes.length
    || resolution.artifacts.some(artifact => !control.gate!.artifactTypes.includes(artifact.type))) throw new GateResolutionError("需要确认的阶段已变化，请刷新页面。");
  for (const selected of resolution.artifacts) {
    const current = await tx.directorNextArtifact.findFirst({where: {novelId: contract.novelId, scope: contract.scope, type: selected.type}, orderBy: {version: "desc"}});
    if (!current || current.version !== selected.expectedVersion || current.status === "stale") throw new VersionConflictError(selected.expectedVersion, current?.version ?? -1);
    if (resolution.decision === "regenerate") {
      if (current.protectedUserContent) throw new GateResolutionError("该资产包含需保留的内容，不能自动覆盖。");
      continue;
    }
    if (resolution.decision === "confirm_after_edit") {
      if (!readEdit) throw new GateResolutionError("请从资产页面保存修改，再确认本阶段。");
      const edited = await readEdit({contract, type: current.type, contentRef: current.contentRef}, tx);
      if (!edited.contentRef.trim() || !edited.contentHash.trim()) throw new GateResolutionError("未读取到已保存的修改。");
      await tx.directorNextArtifact.create({data: {id: `${contract.novelId}:${current.type}:${contract.scope}:${current.version+1}`,
        novelId: contract.novelId, type: current.type, scope: contract.scope, version: current.version+1, status: "user_edited", protectedUserContent: true,
        contentRef: edited.contentRef, contentHash: edited.contentHash, producedByRunId: input.runId}});
    } else {
      await tx.directorNextArtifact.update({where: {id: current.id}, data: {status: current.protectedUserContent ? "user_edited" : "confirmed"}});
    }
  }
  const staleTypes = resolution.invalidateTypes.filter(type => type !== "chapter_draft");
  if (staleTypes.length) await tx.directorNextArtifact.updateMany({where: {novelId: contract.novelId, scope: contract.scope, type: {in: staleTypes}, status: {not: "stale"}}, data: {status: "stale"}});
}
