import type { DirectorGenerationSnapshot } from "@ai-novel/shared/types/director/generation";
import { subscribeSnapshots, type SnapshotSourceFactory } from "../../../lib/streaming/subscribeSnapshots.ts";
import { acceptGenerationSnapshot } from "./model.ts";

export function subscribeGenerationSnapshots(url: string, novelId: string, callbacks: {
  onSnapshot: (snapshot: DirectorGenerationSnapshot | null) => void;
  onConnection: (connected: boolean) => void;
}, createSource?: SnapshotSourceFactory) {
  let current: DirectorGenerationSnapshot | null = null;
  return subscribeSnapshots(url, value => {
    const next = acceptGenerationSnapshot(current, value, novelId);
    if (next === current) return;
    current = next;
    callbacks.onSnapshot(next);
  }, callbacks.onConnection, createSource);
}
