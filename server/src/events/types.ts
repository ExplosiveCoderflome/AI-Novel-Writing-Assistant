export type NovelEvent =
  | { type: "chapter:drafted"; payload: { novelId: string; chapterId: string; chapterOrder: number } }
  | { type: "chapter:reviewed"; payload: { novelId: string; chapterId: string; qualityScore?: number } }
  | { type: "pipeline:completed"; payload: { novelId: string; jobId: string; status: string } };

export type NovelEventType = NovelEvent["type"];

export type EventHandler<T extends NovelEvent = NovelEvent> = (event: T) => void | Promise<void>;
