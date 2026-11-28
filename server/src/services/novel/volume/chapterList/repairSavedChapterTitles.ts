import type { VolumePlan, VolumePlanDocument } from "@ai-novel/shared/types/novel";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { chapterTitleRepairPrompt } from "../../../../prompting/prompts/novel/volume/chapterTitleRepair.prompt";
import { assessChapterTitleDiversity } from "../chapterTitleDiversity";
import type { VolumeGenerateOptions } from "../volumeModels";

export async function repairSavedChapterTitles(
  document: VolumePlanDocument,
  volume: VolumePlan,
  options: VolumeGenerateOptions,
): Promise<VolumePlanDocument> {
  const chapters = [...volume.chapters].sort((a, b) => a.chapterOrder - b.chapterOrder);
  const issue = assessChapterTitleDiversity(chapters.map(chapter => chapter.title));
  if (issue?.severity !== "severe") return document;

  const flagged = new Set(issue.offendingTitles);
  const targets = chapters.filter(chapter => !chapter.chapterId && flagged.has(chapter.title));
  const replacements = new Map<number, string>();
  for (let offset = 0; offset < targets.length; offset += 16) {
    const batch = targets.slice(offset, offset + 16);
    const orders = new Set(batch.map(chapter => chapter.chapterOrder));
    const { output } = await runStructuredPrompt({
      asset: chapterTitleRepairPrompt,
      promptInput: {
        issue: issue.issue,
        chapters: batch.map(({ chapterOrder, title, summary }) => ({ chapterOrder, title, summary })),
        reservedTitles: chapters.filter(chapter => !orders.has(chapter.chapterOrder))
          .map(chapter => replacements.get(chapter.chapterOrder) ?? chapter.title),
      },
      options: {
        provider: options.provider, model: options.model, temperature: options.temperature ?? 0.5,
        automaticMaxTokens: 400 + batch.length * 80, novelId: document.novelId, volumeId: volume.id,
        taskId: options.taskId, stage: "structured_outline", itemKey: "chapter_list",
        scope: "chapter_list", entrypoint: options.entrypoint, signal: options.signal,
      },
    });
    for (const { chapterOrder, title } of output.chapters) {
      if (!orders.delete(chapterOrder)) throw new Error("章名修改包含重复或未指定的章节，请重试。");
      replacements.set(chapterOrder, title);
    }
    if (orders.size) throw new Error("部分章节缺少修改后的章名，请重试。");
  }
  return {
    ...document,
    volumes: document.volumes.map(item => item.id === volume.id ? {
      ...item,
      chapters: item.chapters.map(chapter => replacements.has(chapter.chapterOrder)
        ? { ...chapter, title: replacements.get(chapter.chapterOrder)! } : chapter),
    } : item),
  };
}
