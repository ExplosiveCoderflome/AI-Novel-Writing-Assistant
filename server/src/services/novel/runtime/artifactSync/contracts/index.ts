// Public data/version contracts without importing extractor or recovery orchestration.
export { buildChapterArtifactContentHash } from "../ChapterArtifactContentVersion";
export * from "../ChapterArtifactSyncBoundary";
export * from "../ChapterArtifactSyncResult";
export {authorizeManualRevision, type ManualRevisionProof} from "../authorization";
