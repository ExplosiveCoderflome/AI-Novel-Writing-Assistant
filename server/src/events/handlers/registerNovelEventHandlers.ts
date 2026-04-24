import { prisma } from "../../db/prisma";
import { NovelService } from "../../services/novel/NovelService";
import { CharacterDynamicsService } from "../../services/novel/dynamics/CharacterDynamicsService";
import type { EventBus } from "../EventBus";
import type { VolumeUpdateReason } from "../types";

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

export function registerNovelEventHandlers(eventBus: EventBus): void {
  eventBus.on("chapter:drafted", async (event) => {
    if (event.type !== "chapter:drafted") {
      return;
    }
    const characterDynamicsService = new CharacterDynamicsService();
    await characterDynamicsService.syncChapterDraftDynamics(
      event.payload.novelId,
      event.payload.chapterId,
      event.payload.chapterOrder,
    );
  }, 90);

  eventBus.on("volume:updated", async (event) => {
    if (event.type !== "volume:updated") {
      return;
    }
    if (!await shouldRebuildCharacterDynamics(event.payload.novelId, event.payload.reason)) {
      return;
    }
    const characterDynamicsService = new CharacterDynamicsService();
    await characterDynamicsService.rebuildDynamics(event.payload.novelId, {
      sourceType: "volume_projection",
    });
  }, 90);

  eventBus.on("pipeline:completed", async (event) => {
    if (event.type !== "pipeline:completed" || event.payload.status !== "succeeded") {
      return;
    }
    const novelService = new NovelService();
    await novelService.createNovelSnapshot(
      event.payload.novelId,
      "auto_milestone",
      `pipeline-${event.payload.jobId.slice(0, 8)}`,
    );
  }, 100);
}
