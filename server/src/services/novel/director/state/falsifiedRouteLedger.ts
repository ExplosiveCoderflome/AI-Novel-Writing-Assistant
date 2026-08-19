import { prisma } from '../../../../db/prisma';

export interface FalsifiedRoute {
  id?: string;
  novelId: string;
  volumeOrder?: number;
  chapterOrder?: number;
  failedPlanSummary: string;
  rejectionReason: string;
  rootCauseCode: string;
  evidenceArtifactId?: string;
  negativePromptConstraint: string;
  createdAt?: Date;
}

export class FalsifiedRouteLedgerService {
  /**
   * Record a new falsified route (dead branch) into the ledger.
   */
  public async record(data: FalsifiedRoute): Promise<FalsifiedRoute> {
    const record = await prisma.directorFalsifiedRoute.create({
      data: {
        novelId: data.novelId,
        volumeOrder: data.volumeOrder,
        chapterOrder: data.chapterOrder,
        failedPlanSummary: data.failedPlanSummary,
        rejectionReason: data.rejectionReason,
        rootCauseCode: data.rootCauseCode,
        evidenceArtifactId: data.evidenceArtifactId,
        negativePromptConstraint: data.negativePromptConstraint,
      },
    });

    return {
      id: record.id,
      novelId: record.novelId,
      volumeOrder: record.volumeOrder ?? undefined,
      chapterOrder: record.chapterOrder ?? undefined,
      failedPlanSummary: record.failedPlanSummary,
      rejectionReason: record.rejectionReason,
      rootCauseCode: record.rootCauseCode,
      evidenceArtifactId: record.evidenceArtifactId ?? undefined,
      negativePromptConstraint: record.negativePromptConstraint,
      createdAt: record.createdAt,
    };
  }

  /**
   * List all active falsified routes for a novel.
   */
  public async listByNovel(novelId: string): Promise<FalsifiedRoute[]> {
    const records = await prisma.directorFalsifiedRoute.findMany({
      where: { novelId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => ({
      id: r.id,
      novelId: r.novelId,
      volumeOrder: r.volumeOrder ?? undefined,
      chapterOrder: r.chapterOrder ?? undefined,
      failedPlanSummary: r.failedPlanSummary,
      rejectionReason: r.rejectionReason,
      rootCauseCode: r.rootCauseCode,
      evidenceArtifactId: r.evidenceArtifactId ?? undefined,
      negativePromptConstraint: r.negativePromptConstraint,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Format negative constraints for injection into Planner / Writer prompt context.
   */
  public formatNegativeConstraintsForPrompt(routes: FalsifiedRoute[]): string[] {
    return routes.map(
      (r) =>
        `[避坑规则] 避开否定路线 (${r.rootCauseCode}): ${r.negativePromptConstraint}`
    );
  }
}

export const falsifiedRouteLedgerService = new FalsifiedRouteLedgerService();
