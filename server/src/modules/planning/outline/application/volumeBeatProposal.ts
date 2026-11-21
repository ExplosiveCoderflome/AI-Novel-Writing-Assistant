import { randomUUID } from "node:crypto";
import { AppError } from "../../../../middleware/errorHandler";
import { outlineVolumeBeatsPrompt } from "../../../../prompting/prompts/outline/volumeBeats.prompt";
import { validateOutlineDocument } from "../domain/outlineDocument";
import { OutlineRepository } from "../infrastructure/OutlineRepository";
import { runOutlineProposalStructuredCall } from "./outlineProposalStructuredCall";

export async function generateVolumeBeatProposal(repository: OutlineRepository, projectId: string, volumeId: string, baseVersion: number, targetChapterCount: number) {
  const source = await repository.getCurrent(projectId);
  if (!source?.revision || source.project.status !== "active") throw new AppError("找不到可编辑的大纲。",404);
  if (source.project.currentVersion !== baseVersion) throw new AppError("请打开最新大纲后再规划本卷。",409);
  const document = validateOutlineDocument(JSON.parse(source.revision.documentJson));
  const volume = document.volumes.find(v => v.nodeId === volumeId);
  if (!volume) throw new AppError("找不到要规划的卷。",404);
  const chapters = document.chapters.filter(c => c.volumeNodeId === volumeId).sort((a,b) => a.order-b.order);
  if (chapters.length > targetChapterCount) throw new AppError("预计篇幅不能少于本卷已有章数。",422);
  const result = await runOutlineProposalStructuredCall({asset:outlineVolumeBeatsPrompt, promptInput:{story:document.story, volume, chapters, targetChapterCount}});
  const update = (nodeId: string, fields: Record<string,unknown>, reason: string) => ({
    operationId:nodeId, kind:"update_fields", nodeId, fields, reason, affectedNodeIds:[nodeId], dependsOn:[], risks:[],
  });
  const operations = [update(volumeId, {beats:result.output.beats}, "安排本卷的推进与兑现。"),
    ...result.output.assignments.map(a => update(a.chapterId, {beatKey:a.beatKey}, "将本章关联到它承担的节奏段。"))];
  return repository.transaction(async tx => {
    const current = await tx.outlineProject.findUnique({where:{id:projectId}});
    if (current?.currentVersion !== baseVersion || current.status !== "active") throw new AppError("生成期间大纲有新版本，请按当前稿重新规划。",409);
    return tx.outlineProposal.create({data:{id:randomUUID(), projectId, baseVersion, kind:"volume_beats", status:"pending",
      requestText:`《${volume.title}》的节奏与章节安排`, proposalJson:JSON.stringify({volumeId, operations}),
      promptId:outlineVolumeBeatsPrompt.id, promptVersion:outlineVolumeBeatsPrompt.version}});
  });
}
