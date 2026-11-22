import { useMemo, useSyncExternalStore } from "react";
import type { XYPosition } from "@xyflow/react";

type Positions = ReadonlyMap<string, XYPosition>;
const empty: Positions = new Map();

function readPositions(key: string | null, fallback: Positions): Positions {
  if (!key || typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return empty;
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return empty;
    const positions = new Map<string, XYPosition>();
    for (const [id, point] of Object.entries(data)) {
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
        positions.set(id, { x: point.x, y: point.y });
      }
    }
    return positions;
  } catch {
    return fallback;
  }
}

function openLayout(novelId: string | null, scope: string) {
  const key = novelId ? `character-relationship-layout:v1:${encodeURIComponent(novelId)}:${scope}` : null;
  let positions = readPositions(key, empty);
  let localOnly = false;
  const listeners = new Set<() => void>();

  function publish(next: Positions) {
    positions = next;
    listeners.forEach(notify => notify());
  }

  function save(next: Positions) {
    if (key) {
      try {
        if (next.size) window.localStorage.setItem(key, JSON.stringify(Object.fromEntries(next)));
        else window.localStorage.removeItem(key);
        localOnly = false;
      } catch {
        localOnly = true;
      }
    }
    publish(next);
  }

  return {
    getSnapshot: () => positions,
    subscribe(notify: () => void) {
      listeners.add(notify);
      function onStorage(event: StorageEvent) {
        if (key && (event.key === key || event.key === null)) publish(readPositions(key, positions));
      }
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(notify);
        window.removeEventListener("storage", onStorage);
      };
    },
    move(moves: ReadonlyArray<{ id: string; position: XYPosition }>) {
      const next = new Map(localOnly ? positions : readPositions(key, positions));
      for (const { id, position } of moves) next.set(id, position);
      save(next);
    },
    reset: () => save(empty),
  };
}

export function useRelationshipLayout(novelId: string | null, scope: string) {
  const layout = useMemo(() => openLayout(novelId, scope), [novelId, scope]);
  const positions = useSyncExternalStore(layout.subscribe, layout.getSnapshot, () => empty);
  return { positions, move: layout.move, reset: layout.reset };
}
