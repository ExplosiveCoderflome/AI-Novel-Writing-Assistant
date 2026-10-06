import { randomUUID } from "node:crypto";
import type { DirectorGenerationSnapshot } from "@ai-novel/shared/types/director/generation";

type Listener = (snapshot: DirectorGenerationSnapshot | null) => void;
type Identity = Pick<DirectorGenerationSnapshot, "novelId" | "executionId">;

/** Observation is isolated from production: no persistence, retries, or model calls. */
export class ChapterGenerationFeed {
  private readonly snapshots = new Map<string, DirectorGenerationSnapshot>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private revision = 0;
  constructor(private readonly options: {
    maxBooks?: number; maxContentLength?: number; ttlMs?: number; now?: () => number;
  } = {}) {}

  private now() { return (this.options.now ?? Date.now)(); }
  private notify(listener: Listener, snapshot: DirectorGenerationSnapshot | null) {
    // A disconnected browser must never affect chapter generation.
    try { listener(snapshot ? {...snapshot} : null); } catch { /* observation only */ }
  }
  private publish(novelId: string) {
    const snapshot = this.snapshots.get(novelId) ?? null;
    for (const listener of this.listeners.get(novelId) ?? []) this.notify(listener, snapshot);
  }
  private prune() {
    for (const [id, snapshot] of this.snapshots) {
      if (this.now() - snapshot.updatedAt > (this.options.ttlMs ?? 30 * 60_000)) {
        this.snapshots.delete(id);
        this.publish(id);
      }
    }
  }
  begin(chapter: Pick<DirectorGenerationSnapshot, "novelId" | "chapterId" | "chapterOrder" | "chapterTitle">): Identity {
    this.prune();
    this.snapshots.delete(chapter.novelId);
    while (this.snapshots.size >= (this.options.maxBooks ?? 32)) {
      const oldest = this.snapshots.keys().next().value!;
      this.snapshots.delete(oldest);
      this.publish(oldest);
    }
    const snapshot: DirectorGenerationSnapshot = {...chapter, executionId: randomUUID(), revision: ++this.revision,
      state: "writing", content: "", updatedAt: this.now()};
    this.snapshots.set(chapter.novelId, snapshot);
    this.publish(chapter.novelId);
    return {novelId: chapter.novelId, executionId: snapshot.executionId};
  }
  update(identity: Identity, state: DirectorGenerationSnapshot["state"], content?: string) {
    const previous = this.snapshots.get(identity.novelId);
    if (!previous || previous.executionId !== identity.executionId) return;
    this.snapshots.set(identity.novelId, {...previous, state,
      content: (content ?? previous.content).slice(0, this.options.maxContentLength ?? 100_000),
      revision: ++this.revision, updatedAt: this.now()});
    this.publish(identity.novelId);
  }
  read(novelId: string): DirectorGenerationSnapshot | null {
    this.prune();
    const snapshot = this.snapshots.get(novelId);
    return snapshot ? {...snapshot} : null;
  }
  subscribe(novelId: string, listener: Listener): () => void {
    const snapshot = this.read(novelId);
    const listeners = this.listeners.get(novelId) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(novelId, listeners);
    this.notify(listener, snapshot);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(novelId);
    };
  }
}

export const chapterGenerationFeed = new ChapterGenerationFeed();
