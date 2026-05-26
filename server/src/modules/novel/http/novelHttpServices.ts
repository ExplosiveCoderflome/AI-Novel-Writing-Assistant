import { NovelDraftOptimizeService } from "../../../services/novel/NovelDraftOptimizeService";
import { createNovelApplicationServices } from "../../../services/novel/application/NovelApplicationServices";

export function createNovelHttpServices() {
  return {
    novelService: createNovelApplicationServices(),
    novelDraftOptimizeService: new NovelDraftOptimizeService(),
  };
}

export type NovelHttpServices = ReturnType<typeof createNovelHttpServices>;
