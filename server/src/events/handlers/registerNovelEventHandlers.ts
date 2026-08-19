import { createHash } from "node:crypto";
import { prisma } from "../../db/prisma";
import { novelSideEffectJobService, type NovelSideEffectJobService } from "../sideEffects";
import type { EventBus } from "../EventBus";
import type { VolumeUpdateReason } from "../types";

type SideEffectEnqueuePort = Pick<NovelSideEffectJobService, "enqueueJob">;

export interface RegisterNovelEventHandlerOptions {
  sideEffectJobs?: SideEffectEnqueuePort;
}

function hashText(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function hashJson(value: unknown): string {
  return hashText(JSON.stringify(value));
}

async function shouldRebuildCharacterDynamics(novelId: string, reason: VolumeUpdateReason): Promise<boolean> {
  if (reason === "chapter_execution_contract_refined" || reason === "chapter_sync") {
    return false;
  }
  if (reason === "version_activated" || reason === "legacy_migration") {
    return true;
  }
  if (reason !== "workspace_updated") {
    return false;
  }

  const assignmentCount = await prisma.characterVolumeAssignment.count({ where: { novelId } });
  if (assignmentCount > 0) {
    return false;
  }
  const readyVolumeCount = await prisma.volumePlan.count({
    where: {
      novelId,
      chapters: { some: {} },
    },
  });
  return readyVolumeCount > 0;
}

async function buildVolumeRebuildSemanticKey(novelId: string, reason: VolumeUpdateReason): Promise<string> {
  const volumes = await prisma.volumePlan.findMany({
    where: { novelId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      sortOrder: true,
      title: true,
      summary: true,
      mainPromise: true,
      escalationMode: true,
      protagonistChange: true,
      climax: true,
      nextVolumeHook: true,
      resetPoint: true,
      openPayoffsJson: true,
      chapters: {
        orderBy: [{ chapterOrder: "asc" }, { id: "asc" }],
        select: {
          chapterOrder: true,
          title: true,
          summary: true,
          purpose: true,
          payoffRefsJson: true,
        },
      },
      characterAssignments: {
        orderBy: [{ characterId: "asc" }],
        select: {
          characterId: true,
          roleLabel: true,
          responsibility: true,
          appearanceExpectation: true,
          plannedChapterOrdersJson: true,
          isCore: true,
          absenceWarningThreshold: true,
          absenceHighRiskThreshold: true,
        },
      },
    },
  });
  return [
    "character.volumeRebuild",
    novelId,
    reason,
    hashJson(volumes),
  ].join(":");
}

export function registerNovelEventHandlers(
  eventBus: EventBus,
  options: RegisterNovelEventHandlerOptions = {},
): void {
  const sideEffectJobs = options.sideEffectJobs ?? novelSideEffectJobService;

  eventBus.on("volume:updated", async (event) => {
    if (event.type !== "volume:updated") {
      return;
    }
    if (!await shouldRebuildCharacterDynamics(event.payload.novelId, event.payload.reason)) {
      return;
    }
    await sideEffectJobs.enqueueJob({
      novelId: event.payload.novelId,
      jobType: "character.volumeRebuild",
      idempotencyKey: await buildVolumeRebuildSemanticKey(event.payload.novelId, event.payload.reason),
      payload: {
        novelId: event.payload.novelId,
        sourceType: "volume_projection",
      },
    });
  }, 90);

  eventBus.on("pipeline:completed", async (event) => {
    if (event.type !== "pipeline:completed" || event.payload.status !== "succeeded") {
      return;
    }
    await sideEffectJobs.enqueueJob({
      novelId: event.payload.novelId,
      jobType: "novel.pipelineSnapshot",
      idempotencyKey: `novel.pipelineSnapshot:${event.payload.jobId}`,
      payload: {
        novelId: event.payload.novelId,
        jobId: event.payload.jobId,
        label: `pipeline-${event.payload.jobId.slice(0, 8)}`,
      },
    });
  }, 100);

  eventBus.on("book-contract:updated", async (event) => {
    if (event.type !== "book-contract:updated" || !event.payload.payoffChanged) {
      return;
    }
    await sideEffectJobs.enqueueJob({
      novelId: event.payload.novelId,
      jobType: "payoff.bookContractSync",
      idempotencyKey: [
        "payoff.bookContractSync",
        event.payload.novelId,
        event.payload.contractUpdatedAt,
      ].join(":"),
      payload: {
        novelId: event.payload.novelId,
      },
    });
  }, 80);
}
