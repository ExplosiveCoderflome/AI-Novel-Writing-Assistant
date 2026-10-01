import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import type {
  ArtifactRef,
  ArtifactStatus,
  ArtifactType,
} from "../domain";
import type { ArtifactLedger } from "../application/ports";

function artifactStatus(value: string): ArtifactStatus {
  if (value === "stale" || value === "draft" || value === "user_edited" || value === "confirmed") {
    return value;
  }
  return "confirmed";
}

function toArtifactRef(row: {
  type: string;
  scope: string;
  version: number;
  status: string;
  protectedUserContent: boolean;
}): ArtifactRef {
  return {
    type: row.type,
    scope: row.scope,
    version: row.version,
    status: artifactStatus(row.status),
    protectedUserContent: row.protectedUserContent,
  };
}

export class PrismaArtifactLedger implements ArtifactLedger {
  constructor(private readonly db: PrismaClient = prisma) {}

  async listByNovel(novelId: string): Promise<ArtifactRef[]> {
    const rows = await this.db.directorNextArtifact.findMany({
      where: { novelId },
      orderBy: [{ scope: "asc" }, { type: "asc" }, { version: "desc" }],
      select: {
        type: true,
        scope: true,
        version: true,
        status: true,
        protectedUserContent: true,
      },
    });
    return rows.map(toArtifactRef);
  }

  async record(input: {
    novelId: string;
    type: ArtifactType;
    scope: string;
    status: ArtifactStatus;
    protectedUserContent: boolean;
    contentRef: string;
    contentHash: string | null;
    producedByRunId: string;
  }): Promise<ArtifactRef> {
    return this.db.$transaction(async (tx) => {
      const latest = await tx.directorNextArtifact.findFirst({
        where: {
          novelId: input.novelId,
          type: input.type,
          scope: input.scope,
        },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const version = (latest?.version ?? 0) + 1;
      const ref: ArtifactRef = {
        type: input.type,
        scope: input.scope,
        version,
        status: input.status,
        protectedUserContent: input.protectedUserContent,
      };
      await tx.directorNextArtifact.create({
        data: {
          id: `${input.novelId}:${input.type}:${input.scope}:${version}`,
          novelId: input.novelId,
          type: input.type,
          scope: input.scope,
          version,
          status: input.status,
          protectedUserContent: input.protectedUserContent,
          contentRef: input.contentRef,
          contentHash: input.contentHash,
          producedByRunId: input.producedByRunId,
        },
      });
      return ref;
    });
  }

  async markStale(novelId: string, types: readonly ArtifactType[]): Promise<number> {
    const staleTypes = [...new Set(types)].filter((type) => type !== "chapter_draft");
    if (staleTypes.length === 0) {
      return 0;
    }
    const result = await this.db.directorNextArtifact.updateMany({
      where: {
        novelId,
        type: { in: staleTypes },
        protectedUserContent: false,
        status: { not: "stale" },
      },
      data: { status: "stale" },
    });
    return result.count;
  }
}
