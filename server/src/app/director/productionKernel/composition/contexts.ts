import { createContextBlock } from "../../../../prompting/core/contextBudget";
import { resolvePromptContextBlocksForAsset } from "../../../../prompting/context/promptContextResolution";
import { buildChapterWriterContextBlocks, sanitizeWriterContextBlocks } from "../../../../prompting/prompts/novel/chapterLayeredContext";
import { chapterWriterPrompt } from "../../../../prompting/prompts/novel/chapterWriter.prompts";
import type { WritingPlatformSnapshot } from "@ai-novel/shared/types/writingPlatform";
import type { RegisteredChapterWriterDependencies } from "../../../../modules/production";
import type { NativeStageDependencies } from "./types";

/** Same platform contract, sanitization and broker as the native chapter writer. */
export function nativeWriterContext({ db }: NativeStageDependencies): RegisteredChapterWriterDependencies["resolveContext"] {
  return async (run, prepared) => {
    const chapterWriteContext = prepared.contextPackage.chapterWriteContext;
    if (!chapterWriteContext) throw new Error("Chapter runtime context is required before chapter generation.");
    const novel = await db.novel.findUniqueOrThrow({ where: { id: run.progress.unit.novelId }, select: { writingPlatformSnapshotJson: true } });
    let content = "沿用通用中文商业网文写法，保持情节推进、人物主动、因果清晰和章节回报。";
    if (novel.writingPlatformSnapshotJson) {
      try { const snapshot = JSON.parse(novel.writingPlatformSnapshotJson) as WritingPlatformSnapshot;
        content = `${snapshot.label}（配置版本 ${snapshot.profileVersion}）：${snapshot.guidance.drafting}`;
      } catch { /* Native compatibility for pre-snapshot books. */ }
    }
    const sanitized = sanitizeWriterContextBlocks([createContextBlock({ id: "writing_platform", group: "writing_platform",
      priority: 105, required: true, content }), ...buildChapterWriterContextBlocks(chapterWriteContext)]);
    return (await resolvePromptContextBlocksForAsset({ asset: chapterWriterPrompt, executionContext: {
      entrypoint: "chapter_pipeline", novelId: run.progress.unit.novelId, chapterId: run.progress.unit.chapterId,
      metadata: { chapterWriteContext, chapterBlockMode: "full", ragContext: prepared.contextPackage.ragContext } },
      fallbackBlocks: sanitized.allowedBlocks })).blocks;
  };
}
