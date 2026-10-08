import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { DirectorWorkspaceActivity } from "@ai-novel/shared/types/director/generation";
import { createWorkspaceRefresh } from "./workspaceRefresh";

/** Refresh saved assets independently of the follow preference. */
export function useWorkspaceActivity(novelId: string, preview: boolean, activity: DirectorWorkspaceActivity | undefined, statusUpdatedAt: number) {
  const queryClient = useQueryClient();
  const refresher = useRef<ReturnType<typeof createWorkspaceRefresh> | null>(null);
  useEffect(() => {
    if (preview) return;
    const current = createWorkspaceRefresh(() => queryClient.invalidateQueries(
      {queryKey: ["directorBookWorkspace", novelId]}, {throwOnError: true},
    ));
    refresher.current = current;
    return () => { current.dispose(); refresher.current = null; };
  }, [novelId, preview, queryClient]);
  useEffect(() => {
    if (activity?.novelId === novelId) refresher.current?.observe(activity.revision);
  }, [novelId, preview, activity?.novelId, activity?.revision, statusUpdatedAt]);
}
