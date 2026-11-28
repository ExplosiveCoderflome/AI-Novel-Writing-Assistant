import type { BookAnalysisSection } from "../types/bookAnalysis";

export function getManualBookAnalysisContent(
  section: Pick<BookAnalysisSection, "editedContent" | "aiContent">,
): string | null {
  const edited = section.editedContent?.trim();
  if (!edited || edited.replace(/\r\n?/g, "\n") === section.aiContent?.trim().replace(/\r\n?/g, "\n")) {
    return null;
  }
  return edited;
}
