import { chapterInspection, type FinalFinding } from "@ai-novel/shared/types/director/finalReview/contract";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { finalInspectionPrompt } from "../../../prompting/prompts/novel/finalReview/inspection.prompt";
import type { RunContract } from "../../../modules/director";
import { readFinalChapter } from "./manuscript";

export function finalModelOptions(novelId: string, chapterId: string, contract: RunContract | null) {
  return {
    novelId,
    chapterId,
    entrypoint: "director_next",
    stage: "final_review",
    provider: contract?.modelConfig?.route,
    model: contract?.modelConfig?.model,
    temperature: contract?.launchInput?.temperature,
  };
}
export function anchorFinalFindings(findings: FinalFinding[], paragraphs: Record<string, string>): FinalFinding[] {
  return findings.map(finding => {
    if (paragraphs[String(finding.paragraph)]?.includes(finding.quote)) return finding;
    const matches = Object.entries(paragraphs).filter(([, text]) => text.includes(finding.quote));
    if (matches.length !== 1) throw new AppError("检查意见未能定位到本章原句，请重试本章检查。", 422);
    return {...finding, paragraph: Number(matches[0][0])};
  });
}
async function inspect(novelId: string, chapterId: string, sourceHash: string) {
  const chapter = await readFinalChapter(prisma, novelId, chapterId, sourceHash);
  if (chapter.findings) return chapter.findings;
  const response = await runStructuredPrompt({
    asset: finalInspectionPrompt,
    promptInput: chapter.input,
    options: finalModelOptions(novelId, chapterId, chapter.book.contract),
  });
  const report = chapterInspection.parse(response.output);
  report.findings = anchorFinalFindings(report.findings, chapter.input.chapter.paragraphs);
  return prisma.$transaction(async (tx) => {
    await readFinalChapter(tx, novelId, chapterId, sourceHash);
    const saved = await tx.directorFinalChapterCheck.upsert({
      where: { chapterId_sourceHash: { chapterId, sourceHash } },
      create: { chapterId, sourceHash, findingsJson: JSON.stringify(report) },
      update: {},
    });
    return chapterInspection.parse(JSON.parse(saved.findingsJson)).findings;
  });
}
const underway = new Map<string, ReturnType<typeof inspect>>();
export function inspectFinalChapter(novelId: string, chapterId: string, sourceHash: string) {
  const key = JSON.stringify([novelId, chapterId, sourceHash]);
  const current = underway.get(key);
  if (current) return current;
  const work = inspect(novelId, chapterId, sourceHash).finally(() => underway.delete(key));
  underway.set(key, work);
  return work;
}
