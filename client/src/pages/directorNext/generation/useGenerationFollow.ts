import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/constants";
import type { DirectorGenerationSnapshot } from "@ai-novel/shared/types/director/generation";
import { subscribeGenerationSnapshots } from "./subscription";

function readPreference(novelId: string) {
  try { return localStorage.getItem(`director-follow:${novelId}`) === "true"; } catch { return false; }
}

export function useGenerationFollow(novelId: string, preview: boolean) {
  const queryClient = useQueryClient();
  const [preference, setPreference] = useState(() => ({novelId, enabled: readPreference(novelId)}));
  const enabled = preference.novelId === novelId ? preference.enabled : readPreference(novelId);
  const [snapshot, setSnapshot] = useState<DirectorGenerationSnapshot | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  useEffect(() => {
    setSnapshot(null);
    setDisconnected(false);
    if (!enabled || preview) return;
    let active = true;
    let current: DirectorGenerationSnapshot | null = null;
    let refreshedExecution: string | null = null;
    const stop = subscribeGenerationSnapshots(`${API_BASE_URL.replace(/\/$/, "")}/director-next/novels/${encodeURIComponent(novelId)}/generation-stream`, novelId, {
      onConnection: connected => { if (active) setDisconnected(!connected); },
      onSnapshot: next => {
        current = next;
        setSnapshot(next);
        if (next?.state === "saved" && refreshedExecution !== next.executionId) {
          refreshedExecution = next.executionId;
          void queryClient.invalidateQueries({queryKey:["directorBookWorkspace",novelId]}, {throwOnError:true})
            .then(() => {
              if (active && current?.executionId === next.executionId && current.state === "saved") setSnapshot(null);
            }).catch(() => { /* Keep the saved snapshot available if reloading saved assets fails. */ });
        }
      },
    });
    return () => { active = false; stop(); };
  }, [novelId, enabled, preview, queryClient]);
  return {
    enabled,
    snapshot: enabled && snapshot?.novelId === novelId ? snapshot : null,
    disconnected: enabled && disconnected,
    setEnabled(value: boolean) {
      setPreference({novelId, enabled: value});
      try { localStorage.setItem(`director-follow:${novelId}`, String(value)); } catch { /* Session preference still works. */ }
    },
  };
}
