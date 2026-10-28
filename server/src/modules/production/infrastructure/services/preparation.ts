import type { PrismaClient } from "@prisma/client";
import type { ChapterExecutionPreparationService } from "../../../../services/novel/production/preparation/ChapterExecutionPreparationService";
import type { GenerationContextAssembler } from "../../../../services/novel/runtime/GenerationContextAssembler";
import type { ChapterRuntimeRequestInput } from "../../../../services/novel/runtime/chapterRuntimeSchema";
import { InvalidProductionRequestError, ProductionSnapshotConflictError, type UnitRun } from "../../application";
import type { UnitRef } from "../../domain";
import type { ChapterStageServices } from "../stages";

export interface ChapterPreparationDependencies {
  db: Pick<PrismaClient, "chapter">;
  preparation: Pick<ChapterExecutionPreparationService, "prepare">;
  assembler: Pick<GenerationContextAssembler, "assemble">;
  /** Caller reads its persistent artifact/edit protection; the kernel does not interpret a task record. */
  protectedContent(unit: UnitRef): Promise<boolean>;
  /** Native service request derived from this run's frozen execution contract, never a live book default. */
  request(run: UnitRun): Promise<ChapterRuntimeRequestInput>;
}

export function createChapterPreparationAdapter(deps: ChapterPreparationDependencies): Pick<ChapterStageServices, "readBaseline" | "prepare"> {
  return {
    async readBaseline(unit) {
      const [chapter, protectedUserContent] = await Promise.all([
        deps.db.chapter.findFirst({ where: { id: unit.chapterId, novelId: unit.novelId },
          select: { content: true, updatedAt: true, order: true } }), deps.protectedContent(unit),
      ]);
      if (!chapter || chapter.order !== unit.order) throw new InvalidProductionRequestError("Preparation chapter identity changed");
      return { content: chapter.content, updatedAt: chapter.updatedAt.toISOString(), protectedUserContent };
    },
    async prepare(run) {
      const unit = run.progress.unit;
      const request = await deps.request(run);
      if (request.provider !== run.snapshots.model.provider || request.model !== run.snapshots.model.model) throw new ProductionSnapshotConflictError();
      // Planning writes finish before the existing assembler begins its read-only context contract.
      await deps.preparation.prepare(unit.novelId, unit.chapterId, request);
      const assembled = await deps.assembler.assemble(unit.novelId, unit.chapterId, request);
      if (assembled.novel.id !== unit.novelId || assembled.chapter.id !== unit.chapterId || assembled.chapter.order !== unit.order) {
        throw new InvalidProductionRequestError("Assembled chapter identity changed");
      }
      return { novelTitle: assembled.novel.title, chapterTitle: assembled.chapter.title, contextPackage: assembled.contextPackage };
    },
  };
}
