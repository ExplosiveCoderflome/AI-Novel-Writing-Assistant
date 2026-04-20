export type VolumeUpdateReason =
  | "workspace_updated"
  | "version_activated"
  | "chapter_sync"
  | "chapter_execution_contract_refined"
  | "legacy_migration";

export type NovelEvent =
  | { type: "chapter:updated"; payload: { novelId: string; chapterId: string; chapterOrder: number } }
  | { type: "chapter:drafted"; payload: { novelId: string; chapterId: string; chapterOrder: number } }
  | { type: "chapter:reviewed"; payload: { novelId: string; chapterId: string; qualityScore?: number } }
  | { type: "character:changed"; payload: { novelId: string; characterId: string } }
  | { type: "volume:updated"; payload: { novelId: string; reason: VolumeUpdateReason } }
  | { type: "world:updated"; payload: { worldId: string } }
  | { type: "outline:revised"; payload: { novelId: string; stage: "outline" | "structured_outline" } }
  | { type: "pipeline:completed"; payload: { novelId: string; jobId: string; status: string } };

export type NovelEventType = NovelEvent["type"];

export type EventHandler<T extends NovelEvent = NovelEvent> = (event: T) => void | Promise<void>;
