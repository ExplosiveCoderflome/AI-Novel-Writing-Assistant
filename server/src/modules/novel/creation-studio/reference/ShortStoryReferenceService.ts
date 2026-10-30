import { createHash } from "node:crypto";
import type {
  ShortStoryReferenceSelection, ShortStoryReferenceSnapshot, ShortStoryReferenceContract, ShortStoryReferenceView,
} from "@ai-novel/shared/types/shortStoryReference";
import { BOOK_ANALYSIS_SECTIONS } from "@ai-novel/shared/types/bookAnalysis";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { isEmptySucceededBookAnalysisSection } from "../../../../services/bookAnalysis/shared/bookAnalysis.status";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { shortStoryReferenceExtractPrompt } from "../../../../prompting/prompts/creation/shortStoryReference.prompts";

export function referenceContract(snapshot: ShortStoryReferenceSnapshot | null): ShortStoryReferenceContract | undefined {
  if (!snapshot) return undefined;
  return {
    sourceTitle: snapshot.sourceTitle, goal: snapshot.goal, structureLessons: snapshot.structureLessons,
    pacingLessons: snapshot.pacingLessons, styleLessons: snapshot.styleLessons, endingLessons: snapshot.endingLessons,
    endingEvidence: snapshot.endingEvidence, originalityConstraints: snapshot.originalityConstraints,
  };
}

export function parseShortStoryReference(raw: string | null, required = false): ShortStoryReferenceSnapshot | null {
  if (!raw && !required) return null;
  let snapshot: ShortStoryReferenceSnapshot | null = null;
  try { snapshot = JSON.parse(raw ?? "null") as ShortStoryReferenceSnapshot; } catch { /* fail below */ }
  if (!snapshot || snapshot.schemaVersion !== 1 || !snapshot.analysisRevision || !snapshot.selection
    || !snapshot.structureLessons?.length || !snapshot.originalityConstraints?.length) {
    throw new AppError("参考资料快照不完整，请检查作品保存的数据后继续。", 409);
  }
  return snapshot;
}

export class ShortStoryReferenceService {
  private async source(selection: ShortStoryReferenceSelection) {
    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id: selection.analysisId }, include: { document: true, documentVersion: true,
        sections: { orderBy: { sortOrder: "asc" } } },
    });
    if (!analysis || analysis.documentId !== selection.documentId) throw new AppError("参考拆书与所选文档不匹配，请重新选择。", 404);
    // The application currently has workspace-wide access; disabled/archived documents are unavailable.
    if (analysis.document.status !== "enabled") throw new AppError("参考文档不可访问，请选择可用的参考小说。", 403);
    if (analysis.status !== "succeeded" || analysis.documentVersion.documentId !== selection.documentId) {
      throw new AppError("请先完成所选参考小说的拆书分析。", 409);
    }
    const keys = selection.sectionKeys ?? analysis.sections
      .filter((section) => section.status === "succeeded" || section.frozen).map((section) => section.sectionKey);
    const supported = new Set(BOOK_ANALYSIS_SECTIONS.map((section) => section.key as string));
    if (!keys.length || new Set(keys).size !== keys.length || keys.some((key) => !supported.has(key))) {
      throw new AppError("请选择有效的拆书结论。", 400);
    }
    const sections = keys.map((key) => analysis.sections.find((section) => section.sectionKey === key));
    if (sections.some((section) => !section || (section.status !== "succeeded" && !section.frozen)
      || isEmptySucceededBookAnalysisSection({ ...section, status: "succeeded", frozen: false }))) {
      throw new AppError("所选拆书结论尚未完成或没有可用内容。", 409);
    }
    const conclusions = sections.map((section) => ({
      sectionKey: section!.sectionKey, title: section!.title,
      content: section!.editedContent?.trim() || [section!.aiContent?.trim(), section!.structuredDataJson?.trim()]
        .filter(Boolean).join("\n\n"),
      evidence: section!.evidenceJson,
    }));
    const revision = createHash("sha256").update(JSON.stringify({
      documentVersionId: analysis.documentVersionId, contentHash: analysis.documentVersion.contentHash,
      scope: [analysis.sourceStartOffset, analysis.sourceEndOffset], conclusions,
      updatedAt: sections.map((section) => section!.updatedAt.toISOString()),
    })).digest("hex");
    return { analysis, conclusions, revision };
  }

  async create(selection: ShortStoryReferenceSelection, idea: string, taskId: string): Promise<ShortStoryReferenceSnapshot> {
    const goal = selection.goal.trim();
    if (!goal || goal.length > 4000) throw new AppError("请说明你希望借鉴的内容，最多 4000 字。", 400);
    const source = await this.source(selection);
    if (JSON.stringify(source.conclusions).length > 100000) {
      throw new AppError("所选拆书结论较长，请减少选择范围后继续；结论不会截取开头代替整篇。", 400);
    }
    const result = await runStructuredPrompt({
      asset: shortStoryReferenceExtractPrompt,
      promptInput: { idea, goal, conclusions: source.conclusions },
      options: { taskId, stage: "creation_intent", itemKey: "reference_extract", entrypoint: "creation_studio",
        temperature: 0.3, maxTokens: 5000 },
    });
    const current = await this.source(selection);
    if (current.revision !== source.revision) throw new AppError("参考结论在读取期间发生变化，请重新生成方向。", 409);
    return { ...result.output, schemaVersion: 1, mode: "adaptation", sourceTitle: source.analysis.document.title,
      goal, originalIdea: idea, analysisId: source.analysis.id, documentId: source.analysis.documentId,
      documentVersionId: source.analysis.documentVersionId, documentVersionNumber: source.analysis.documentVersion.versionNumber,
      analysisRevision: source.revision, selection: { ...selection, goal }, selectedConclusions: source.conclusions };
  }

  async validate(snapshot: ShortStoryReferenceSnapshot): Promise<void> {
    const source = await this.source(snapshot.selection);
    if (source.revision !== snapshot.analysisRevision) throw new AppError("参考拆书已更新，请重新生成并核对两个创作方向。", 409);
  }

  async view(snapshot: ShortStoryReferenceSnapshot | null): Promise<ShortStoryReferenceView | null> {
    if (!snapshot) return null;
    let sourceState: ShortStoryReferenceView["sourceState"] = "available";
    try { const source = await this.source(snapshot.selection);
      if (source.revision !== snapshot.analysisRevision) sourceState = "updated";
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      sourceState = "unavailable";
    }
    return { ...referenceContract(snapshot)!, analysisId: snapshot.analysisId, documentId: snapshot.documentId,
      documentVersionNumber: snapshot.documentVersionNumber, analysisRevision: snapshot.analysisRevision, sourceState };
  }
}
export const shortStoryReferenceService = new ShortStoryReferenceService();
