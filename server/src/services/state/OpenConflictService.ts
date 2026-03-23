import type { AuditReport } from "@ai-novel/shared/types/novel";
import { prisma } from "../../db/prisma";
import type { StateDiffConflictCandidate } from "./stateConflictDetection";

const AUDIT_SOURCE_TYPE = "audit_issue";
const STATE_DIFF_SOURCE_TYPE = "state_diff";

function normalizeWhitespace(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function buildConflictKey(report: AuditReport, issue: AuditReport["issues"][number]): string {
  const description = normalizeWhitespace(issue.description).toLowerCase();
  return `${report.auditType}:${issue.code.trim().toLowerCase()}:${description}`;
}

function buildConflictTitle(report: AuditReport, issue: AuditReport["issues"][number]): string {
  const code = issue.code.trim();
  const description = normalizeWhitespace(issue.description);
  if (code) {
    return `${report.auditType}/${code}`;
  }
  if (description) {
    return `${report.auditType}/${description.slice(0, 32)}`;
  }
  return `${report.auditType} conflict`;
}

function severityRank(severity: string): number {
  switch (severity) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

export class OpenConflictService {
  async listOpenConflicts(
    novelId: string,
    options: {
      beforeChapterOrder?: number;
      includeCurrentChapter?: boolean;
      limit?: number;
    } = {},
  ) {
    const limit = Math.max(1, Math.min(options.limit ?? 8, 20));
    const rows = await prisma.openConflict.findMany({
      where: {
        novelId,
        status: "open",
        ...(typeof options.beforeChapterOrder === "number"
          ? {
              OR: [
                { chapter: { is: null } },
                {
                  chapter: {
                    is: {
                      order: options.includeCurrentChapter
                        ? { lte: options.beforeChapterOrder }
                        : { lt: options.beforeChapterOrder },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        chapter: {
          select: {
            order: true,
            title: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 20,
    });

    return rows.sort((left, right) => {
      const bySeverity = severityRank(right.severity) - severityRank(left.severity);
      if (bySeverity !== 0) {
        return bySeverity;
      }
      return right.updatedAt.getTime() - left.updatedAt.getTime();
    }).slice(0, limit);
  }

  async syncFromAuditReports(input: {
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    sourceSnapshotId?: string | null;
    auditReports: AuditReport[];
  }) {
    const normalized = input.auditReports.flatMap((report) => (
      report.issues
        .filter((issue) => issue.status === "open")
        .map((issue) => ({
          sourceIssueId: issue.id,
          conflictKey: buildConflictKey(report, issue),
          conflictType: report.auditType,
          title: buildConflictTitle(report, issue),
          summary: normalizeWhitespace(issue.description),
          severity: issue.severity,
          resolutionHint: normalizeWhitespace(issue.fixSuggestion) || null,
          evidenceJson: JSON.stringify([normalizeWhitespace(issue.evidence)].filter(Boolean)),
        }))
    ));

    await prisma.$transaction(async (tx) => {
      await tx.openConflict.updateMany({
        where: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          sourceType: AUDIT_SOURCE_TYPE,
          status: "open",
          conflictKey: { notIn: normalized.map((item) => item.conflictKey) },
        },
        data: {
          status: "resolved",
        },
      });

      for (const item of normalized) {
        await tx.openConflict.upsert({
          where: {
            novelId_chapterId_sourceType_conflictKey: {
              novelId: input.novelId,
              chapterId: input.chapterId,
              sourceType: AUDIT_SOURCE_TYPE,
              conflictKey: item.conflictKey,
            },
          },
          update: {
            sourceSnapshotId: input.sourceSnapshotId ?? null,
            sourceIssueId: item.sourceIssueId,
            conflictType: item.conflictType,
            title: item.title,
            summary: item.summary,
            severity: item.severity,
            status: "open",
            evidenceJson: item.evidenceJson,
            resolutionHint: item.resolutionHint,
            lastSeenChapterOrder: input.chapterOrder,
          },
          create: {
            novelId: input.novelId,
            chapterId: input.chapterId,
            sourceSnapshotId: input.sourceSnapshotId ?? null,
            sourceIssueId: item.sourceIssueId,
            sourceType: AUDIT_SOURCE_TYPE,
            conflictType: item.conflictType,
            conflictKey: item.conflictKey,
            title: item.title,
            summary: item.summary,
            severity: item.severity,
            status: "open",
            evidenceJson: item.evidenceJson,
            resolutionHint: item.resolutionHint,
            lastSeenChapterOrder: input.chapterOrder,
          },
        });
      }
    });

    return this.listOpenConflicts(input.novelId, {
      beforeChapterOrder: input.chapterOrder,
      includeCurrentChapter: true,
      limit: 8,
    });
  }

  async resolveFromAuditIssueIds(novelId: string, issueIds: string[]) {
    if (issueIds.length === 0) {
      return;
    }
    await prisma.openConflict.updateMany({
      where: {
        novelId,
        sourceType: AUDIT_SOURCE_TYPE,
        sourceIssueId: { in: issueIds },
      },
      data: {
        status: "resolved",
      },
    });
  }

  async syncFromStateDiff(input: {
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    sourceSnapshotId?: string | null;
    trackedConflictKeys: string[];
    conflicts: StateDiffConflictCandidate[];
  }) {
    const activeKeys = input.conflicts.map((item) => item.conflictKey);

    await prisma.$transaction(async (tx) => {
      if (input.trackedConflictKeys.length > 0) {
        await tx.openConflict.updateMany({
          where: {
            novelId: input.novelId,
            sourceType: STATE_DIFF_SOURCE_TYPE,
            status: "open",
            conflictKey: {
              in: input.trackedConflictKeys,
              notIn: activeKeys,
            },
          },
          data: {
            status: "resolved",
          },
        });
      }

      for (const item of input.conflicts) {
        await tx.openConflict.updateMany({
          where: {
            novelId: input.novelId,
            sourceType: STATE_DIFF_SOURCE_TYPE,
            conflictKey: item.conflictKey,
            status: "open",
            NOT: {
              chapterId: input.chapterId,
            },
          },
          data: {
            status: "resolved",
          },
        });

        await tx.openConflict.upsert({
          where: {
            novelId_chapterId_sourceType_conflictKey: {
              novelId: input.novelId,
              chapterId: input.chapterId,
              sourceType: STATE_DIFF_SOURCE_TYPE,
              conflictKey: item.conflictKey,
            },
          },
          update: {
            sourceSnapshotId: input.sourceSnapshotId ?? null,
            sourceIssueId: null,
            conflictType: item.conflictType,
            title: item.title,
            summary: item.summary,
            severity: item.severity,
            status: "open",
            evidenceJson: item.evidence.length > 0 ? JSON.stringify(item.evidence) : null,
            affectedCharacterIdsJson: item.affectedCharacterIds.length > 0 ? JSON.stringify(item.affectedCharacterIds) : null,
            resolutionHint: item.resolutionHint,
            lastSeenChapterOrder: input.chapterOrder,
          },
          create: {
            novelId: input.novelId,
            chapterId: input.chapterId,
            sourceSnapshotId: input.sourceSnapshotId ?? null,
            sourceIssueId: null,
            sourceType: STATE_DIFF_SOURCE_TYPE,
            conflictType: item.conflictType,
            conflictKey: item.conflictKey,
            title: item.title,
            summary: item.summary,
            severity: item.severity,
            status: "open",
            evidenceJson: item.evidence.length > 0 ? JSON.stringify(item.evidence) : null,
            affectedCharacterIdsJson: item.affectedCharacterIds.length > 0 ? JSON.stringify(item.affectedCharacterIds) : null,
            resolutionHint: item.resolutionHint,
            lastSeenChapterOrder: input.chapterOrder,
          },
        });
      }
    });

    return this.listOpenConflicts(input.novelId, {
      beforeChapterOrder: input.chapterOrder,
      includeCurrentChapter: true,
      limit: 8,
    });
  }
}

export const openConflictService = new OpenConflictService();
