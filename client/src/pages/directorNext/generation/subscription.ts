import type { DirectorGenerationSnapshot } from "@ai-novel/shared/types/director/generation";
import { acceptGenerationSnapshot } from "./model.ts";

type Source = Pick<EventSource, "onmessage" | "onopen" | "onerror" | "close">;

export function subscribeGenerationSnapshots(url: string, novelId: string, callbacks: {
  onSnapshot: (snapshot: DirectorGenerationSnapshot | null) => void;
  onConnection: (connected: boolean) => void;
}, createSource: (url: string) => Source = address => new EventSource(address)) {
  let active = true;
  let current: DirectorGenerationSnapshot | null = null;
  const source = createSource(url);
  source.onopen = () => { if (active) callbacks.onConnection(true); };
  source.onerror = () => { if (active) callbacks.onConnection(false); };
  source.onmessage = event => {
    if (!active) return;
    let next: DirectorGenerationSnapshot | null;
    try { next = acceptGenerationSnapshot(current, JSON.parse(event.data), novelId); }
    catch { return; }
    if (next === current) return;
    current = next;
    callbacks.onSnapshot(next);
  };
  return () => { active = false; source.close(); };
}
