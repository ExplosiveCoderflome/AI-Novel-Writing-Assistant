import { useCallback, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { bootstrapNovelWorkflow } from "@/api/novelWorkflow";
import { stripLegacyTaskUrlParams } from "@/lib/legacyTaskUrlParams";
import { normalizeNovelWorkspaceTab } from "../novelWorkspaceNavigation";

export function useNovelEditWorkflow(novelId: string) {
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedVolumeId = searchParams.get("volumeId") ?? "";
  const taskPanelOpen = searchParams.get("taskPanel") === "1";

  useEffect(() => {
    const cleaned = stripLegacyTaskUrlParams(searchParams);
    if (cleaned.toString() === searchParams.toString()) {
      return;
    }
    setSearchParams(cleaned, { replace: true });
  }, [searchParams, setSearchParams]);

  const bootstrapMutation = useMutation({
    mutationFn: () => bootstrapNovelWorkflow({
      novelId,
      lane: "manual_create",
      seedPayload: {
        entry: "novel_edit",
        stage: normalizeNovelWorkspaceTab(searchParams.get("stage")),
      },
    }),
  });

  useEffect(() => {
    if (!novelId) {
      return;
    }
    bootstrapMutation.mutate();
  }, [novelId]);

  const activeTab = useMemo(
    () => normalizeNovelWorkspaceTab(searchParams.get("stage")),
    [searchParams],
  );
  const selectedChapterId = useMemo(
    () => searchParams.get("chapterId") ?? "",
    [searchParams],
  );

  const setActiveTab = (value: string) => {
    const nextTab = normalizeNovelWorkspaceTab(value);
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

  const setSelectedVolumeId = (value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set("volumeId", value);
      } else {
        next.delete("volumeId");
      }
      return next;
    }, { replace: true });
  };

  const clearTaskPanelOpen = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("taskPanel");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  return {
    activeTab,
    setActiveTab,
    selectedChapterId,
    setSelectedChapterId,
    selectedVolumeId,
    setSelectedVolumeId,
    taskPanelOpen,
    clearTaskPanelOpen,
  };
}
