import { prisma } from "../../../../db/prisma";
import { BookContractService } from "../../BookContractService";
import { StoryMacroPlanService } from "../../storyMacro/StoryMacroPlanService";
import { readVolumeWorkspace } from "../../volume/read-model";
import type { DirectorChapterExecutionProgressSummary } from "@ai-novel/shared/types/directorRuntime";
import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import { ChapterExecutionProgressInspector } from "../runtime/ChapterExecutionProgressInspector";
import { resolveStructuredOutlineRecoveryCursorForRequest, type StructuredOutlineRecoveryCursor } from "../recovery/novelDirectorStructuredOutlineRecovery";
import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";

// Null/empty values mean a successful read found no facts; failed reads must reject.
// Existing execution runtimes remain valid injection ports without loading their implementation.
export interface DirectorFactReadPort {
  getStoryMacroPlan(novelId: string): Promise<{ decomposition?: unknown; storyInput?: string | null } | null>;
  getBookContract(novelId: string): Promise<unknown | null>;
  getCharacters(novelId: string): Promise<unknown[]>;
  getVolumeWorkspace(novelId: string): Promise<VolumePlanDocument | null>;
  getStructuredOutlineRecoveryCursor(novelId: string, request?: DirectorConfirmRequest | null): Promise<StructuredOutlineRecoveryCursor | null>;
  inspectChapterExecutionProgress(novelId: string): Promise<DirectorChapterExecutionProgressSummary | null>;
  getExecutionChapters(novelId: string): Promise<Array<{ order: number }>>;
}

/** Projection reads must not construct the director's generation and recovery orchestrators. */
export class DirectorFactReader implements DirectorFactReadPort {
  private readonly storyMacroService = new StoryMacroPlanService();
  private readonly bookContractService = new BookContractService();
  private readonly chapterProgressInspector = new ChapterExecutionProgressInspector();

  getStoryMacroPlan(novelId: string) {
    return this.storyMacroService.getPlan(novelId);
  }

  getBookContract(novelId: string) {
    return this.bookContractService.getByNovelId(novelId);
  }

  getCharacters(novelId: string) {
    return prisma.character.findMany({ where: { novelId }, select: { id: true } });
  }

  getExecutionChapters(novelId: string) {
    return prisma.chapter.findMany({ where: { novelId }, select: { order: true }, orderBy: { order: "asc" } });
  }

  async getVolumeWorkspace(novelId: string) {
    const workspace = await readVolumeWorkspace(novelId);
    return workspace?.volumes.length && workspace.strategyPlan ? workspace : null;
  }

  async getStructuredOutlineRecoveryCursor(novelId: string, request?: DirectorConfirmRequest | null) {
    const workspace = await this.getVolumeWorkspace(novelId);
    return workspace ? resolveStructuredOutlineRecoveryCursorForRequest(workspace, request) : null;
  }

  inspectChapterExecutionProgress(novelId: string) {
    return this.chapterProgressInspector.inspectNovel(novelId);
  }
}
