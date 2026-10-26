import type { CanonicalStateService } from "../../../../services/novel/state/CanonicalStateService";
import type { StateVersionLog } from "../../../../services/novel/state/StateVersionLog";
import type { ResourcePersistenceDependencies } from "../storyState/persistence";

export function createResourceVersionRecorder(deps: {
  canonical: Pick<CanonicalStateService, "getSnapshot">;
  versions: Pick<StateVersionLog, "createVersion">;
}): ResourcePersistenceDependencies {
  return { async recordVersion(tx, input) {
    const snapshot = await deps.canonical.getSnapshot(input.novelId, { chapterId: input.chapterId,
      chapterOrder: input.chapterOrder, includeCurrentChapterState: true }, tx);
    return deps.versions.createVersion({ novelId: input.novelId, chapterId: input.chapterId,
      sourceType: "chapter_background_sync", sourceStage: "production_kernel",
      summary: `chapter ${input.chapterOrder} committed character_resource_update x${input.acceptedProposalIds.length}`,
      acceptedProposalIds: input.acceptedProposalIds, snapshot }, tx);
  } };
}
