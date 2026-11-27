import type { ChapterAuthorProvenance } from "@ai-novel/shared/types/novel";
import type { WorkspaceChapter } from "./model";

export function resolveWorkspaceChapterProvenance(
  chapter: Pick<WorkspaceChapter, "authorProvenance" | "content">,
): ChapterAuthorProvenance | null {
  if (chapter.authorProvenance === "human_locked") {
    return "human_locked";
  }
  if (!chapter.content?.trim()) {
    return null;
  }
  return chapter.authorProvenance ?? "ai_generated";
}

export function provenanceLabel(provenance: ChapterAuthorProvenance | null): string | null {
  if (provenance === "human_locked") return "人工锁定";
  if (provenance === "human_edited") return "人工修订";
  if (provenance === "ai_generated") return "AI 生成";
  return null;
}

export function provenanceHint(provenance: ChapterAuthorProvenance | null): string | null {
  if (provenance === "human_locked") return "已锁定定稿，自动创作不会改写本章；解除锁定后可继续编辑。";
  if (provenance === "human_edited") return "已包含人工修改，自动创作会保留本章内容。";
  if (provenance === "ai_generated") return "当前为 AI 生成版本，可直接修改或锁定定稿。";
  return null;
}
