import { useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { bootstrapNovelWorkflow } from "@/api/novelWorkflow";
import { useSearchParams } from "react-router-dom";

const VALID_TABS = new Set([
  "basic",
  "story_macro",
  "character",
  "outline",
  "structured",
  "chapter",
  "pipeline",
]);

function normalizeTab(value: string | null): string {
  return value && VALID_TABS.has(value) ? value : "basic";
}

export function useNovelEditWorkflow(novelId: string) {
  const [searchParams, setSearchParams] = useSearchParams();

  const workflowTaskId = searchParams.get("taskId") ?? "";
  const selectedVolumeId = searchParams.get("volumeId") ?? "";

  const bootstrapMutation = useMutation({
    mutationFn: () => bootstrapNovelWorkflow({
      workflowTaskId: workflowTaskId || undefined,
      novelId,
      lane: "manual_create",
      seedPayload: {
        entry: "novel_edit",
        stage: normalizeTab(searchParams.get("stage")),
      },
    }),
    onSuccess: (response) => {
      const nextTaskId = response.data?.id;
      if (!nextTaskId || nextTaskId === workflowTaskId) {
        return;
      }
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("taskId", nextTaskId);
        if (!next.get("stage")) {
          next.set("stage", normalizeTab(searchParams.get("stage")));
        }
        return next;
      }, { replace: true });
    },
  });

  useEffect(() => {
    if (!novelId) {
      return;
    }
    bootstrapMutation.mutate();
  }, [novelId, workflowTaskId]);

  const activeTab = useMemo(
    () => normalizeTab(searchParams.get("stage")),
    [searchParams],
  );
  const selectedChapterId = useMemo(
    () => searchParams.get("chapterId") ?? "",
    [searchParams],
  );

  const setActiveTab = (value: string) => {
    const nextTab = normalizeTab(value);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("stage", nextTab);
      return next;
    }, { replace: true });
  };

  const setSelectedChapterId = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set("chapterId", value);
      } else {
        next.delete("chapterId");
      }
      return next;
    }, { replace: true });
  };

  return {
    activeTab,
    setActiveTab,
    selectedChapterId,
    setSelectedChapterId,
    workflowTaskId,
    selectedVolumeId,
  };
}
