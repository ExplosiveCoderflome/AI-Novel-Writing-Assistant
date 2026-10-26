import type { PrismaClient } from "@prisma/client";
import { DirectorCharacterCandidateService, CharacterCandidateReviewRequiredError } from "../../../../services/novel/characters/candidates/DirectorCharacterCandidateService";
import { chapterArtifactDeltaOutputSchema } from "../../../../prompting/prompts/novel/chapterArtifactDelta.prompts";
import { hashProductionContent, type ArtifactReconciliationPorts } from "../../../../modules/production";
import { ProductionVersionConflictError, type ProductionJson } from "../../../../modules/production/common";
import type { NativeStageDependencies } from "./types";

/** Reuse native identity decisions within the caller's lease/manuscript transaction, including blocking review persistence. */
export function nativeCandidates(deps: NativeStageDependencies): NonNullable<ArtifactReconciliationPorts["prepareCandidates"]> {
  return async (ctx, output) => {
    const result = await deps.db.$transaction(async tx => {
      await deps.ownership(tx, { ...ctx.run.progress, executionToken: ctx.executionToken });
      const unit = ctx.run.progress.unit;
      const saved = await tx.productionUnitRun.findUnique({ where: { id: ctx.run.id } });
      if (!saved || saved.version !== ctx.run.version || saved.activeStage !== "reconcile" || saved.activeRequestKey !== ctx.run.activeRequestKey) {
        throw new ProductionVersionConflictError();
      }
      const chapter = await tx.chapter.findFirst({ where: { id: unit.chapterId, novelId: unit.novelId, order: unit.order }, select: { content: true } });
      if (!chapter || hashProductionContent(chapter.content ?? "") !== ctx.contentHash || chapter.content !== ctx.content) throw new ProductionVersionConflictError();
      const locked = await tx.chapter.updateMany({ where: { id: unit.chapterId, novelId: unit.novelId, content: chapter.content }, data: { content: chapter.content } });
      if (locked.count !== 1) throw new ProductionVersionConflictError();
      // The service opens a short callback transaction. Bind it to this existing transaction, never a second client/connection.
      const client = new Proxy(tx, { get(target, name) {
        if (name === "$transaction") return async (operation: (transaction: typeof tx) => Promise<unknown>) => {
          if (typeof operation !== "function") throw new Error("Only callback transactions are supported for native candidate preparation");
          return operation(tx);
        };
        return Reflect.get(target, name);
      } }) as PrismaClient;
      try {
        const prepared = await new DirectorCharacterCandidateService(client).prepare({ novelId: unit.novelId, chapterId: unit.chapterId,
          content: ctx.content, directorRunId: deps.context.runId }, chapterArtifactDeltaOutputSchema.parse(output));
        return { output: JSON.parse(JSON.stringify(prepared)) as ProductionJson };
      } catch (error) {
        if (error instanceof CharacterCandidateReviewRequiredError) return { error };
        throw error;
      }
    });
    if (result.error) throw result.error;
    return result.output!;
  };
}
