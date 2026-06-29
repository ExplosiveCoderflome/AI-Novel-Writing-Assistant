import type { DocumentChapter } from "@ai-novel/shared/types/knowledge";
import type { DocumentChapterService } from "../../knowledge/DocumentChapterService";

export async function getDocumentChaptersSafely(
  documentChapterService: DocumentChapterService,
  documentVersionId: string,
  content: string,
): Promise<DocumentChapter[]> {
  try {
    const result = await documentChapterService.ensureChaptersForVersion(documentVersionId);
    return result.chapters;
  } catch {
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
