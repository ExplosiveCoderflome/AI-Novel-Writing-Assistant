import { NovelDraftOptimizeService } from "../../../services/novel/NovelDraftOptimizeService";
import { getSharedNovelServices } from "../../../services/novel/application/sharedNovelServices";

export function createNovelHttpServices() {
  return {
    novelService: getSharedNovelServices(),
    novelDraftOptimizeService: new NovelDraftOptimizeService(),
  };
}

export type NovelHttpServices = ReturnType<typeof createNovelHttpServices>;
