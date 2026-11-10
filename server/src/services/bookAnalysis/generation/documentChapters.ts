import type { DocumentChapter } from "@ai-novel/shared/types/knowledge";
import type { DocumentChapterService } from "../../knowledge/DocumentChapterService";
import { withExecutionSignal } from "../../../platform/runtime/execution";
import { analysisSignal, isAnalysisCancelled } from "./lifecycle";

export async function getDocumentChaptersSafely(
  documentChapterService: DocumentChapterService,
  documentVersionId: string,
  content: string,
): Promise<DocumentChapter[]> {
  try {
    const signal = analysisSignal();
    const result = await (signal
      ? withExecutionSignal(signal, () => documentChapterService.ensureChaptersForVersion(documentVersionId))
      : documentChapterService.ensureChaptersForVersion(documentVersionId));
    return result.chapters;
  } catch (error) {
    if (isAnalysisCancelled(error)) throw error;
    return [{
      id: "inline-single-chapter",
      documentVersionId,
      chapterIndex: 0,
      title: "全文",
      startOffset: 0,
      endOffset: content.length,
      charCount: content.length,
      summary: null,
      splitter: "single",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }];
  }
}
