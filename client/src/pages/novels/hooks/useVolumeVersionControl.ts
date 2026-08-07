import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, type QueryClient } from "@tanstack/react-query";
import type {
  VolumeBeatSheet,
  VolumeCritiqueReport,
  VolumeImpactResult,
  VolumePlan,
  VolumePlanDocument,
  VolumePlanDiff,
  VolumePlanVersionSummary,
  VolumeRebalanceDecision,
  VolumeStrategyPlan,
} from "@ai-novel/shared/types/novel";
import {
  activateVolumeVersion,
  analyzeVolumeImpact,
  createVolumeDraft,
  freezeVolumeVersion,
  getVolumeDiff,
  getVolumeVersion,
  listVolumeVersions,
} from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";

interface UseVolumeVersionControlArgs {
  novelId: string;
  draftDocument: VolumePlanDocument;
  setDraftVolumes: (value: VolumePlan[]) => void;
  setStrategyPlan: (value: VolumeStrategyPlan | null) => void;
  setCritiqueReport: (value: VolumeCritiqueReport | null) => void;
  setBeatSheets: (value: VolumeBeatSheet[]) => void;
  setRebalanceDecisions: (value: VolumeRebalanceDecision[]) => void;
  queryClient: QueryClient;
  invalidateNovelDetail: () => Promise<void>;
}

export function useVolumeVersionControl({
  novelId,
  draftDocument,
  setDraftVolumes,
  setStrategyPlan,
  setCritiqueReport,
  setBeatSheets,
  setRebalanceDecisions,
  queryClient,
  invalidateNovelDetail,
}: UseVolumeVersionControlArgs) {
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [message, setMessage] = useState("");
  const [diffResult, setDiffResult] = useState<VolumePlanDiff | null>(null);
  const [impactResult, setImpactResult] = useState<VolumeImpactResult | null>(null);

  const volumeVersionsQuery = useQuery({
    queryKey: queryKeys.novels.volumeVersions(novelId),
    queryFn: () => listVolumeVersions(novelId),
    enabled: Boolean(novelId),
  });

  const versions = volumeVersionsQuery.data?.data ?? [];
  const selectedVersion = useMemo(
    () => versions.find((item) => item.id === selectedVersionId),
    [selectedVersionId, versions],
  );

  useEffect(() => {
    if (!selectedVersionId && versions.length > 0) {
      setSelectedVersionId(versions[0].id);
    }
  }, [selectedVersionId, versions]);

  const invalidateVersionList = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.novels.volumeVersions(novelId) });
  };

  const createDraftVersionMutation = useMutation({
    mutationFn: () => createVolumeDraft(novelId, {
      ...draftDocument,
      baseVersion: selectedVersion?.version,
    }),
    onSuccess: async (response) => {
      const nextVersionId = response.data?.id;
      if (nextVersionId) {
        setSelectedVersionId(nextVersionId);
      }
      setMessage(response.message ?? "A volume-level draft version is created.");
      await invalidateVersionList();
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Failed to create volume level draft version.");
    },
  });

  const activateVersionMutation = useMutation({
    mutationFn: () => {
      if (!selectedVersionId) {
        throw new Error("Please select a volume-level version first.");
      }
      return activateVolumeVersion(novelId, selectedVersionId);
    },
    onSuccess: async (response) => {
      setMessage(response.message ?? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.");
      await invalidateVersionList();
      await invalidateNovelDetail();
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Failed to set the effective version.");
    },
  });

  const freezeVersionMutation = useMutation({
    mutationFn: () => {
      if (!selectedVersionId) {
        throw new Error("Please select a volume-level version first.");
      }
      return freezeVolumeVersion(novelId, selectedVersionId);
    },
    onSuccess: async (response) => {
      setMessage(response.message ?? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.");
      await invalidateVersionList();
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Freezing volume level version failed.");
    },
  });

  const diffMutation = useMutation({
    mutationFn: () => {
      if (!selectedVersionId) {
        throw new Error("Please select a volume-level version first.");
      }
      return getVolumeDiff(novelId, selectedVersionId);
    },
    onSuccess: (response) => {
      setDiffResult(response.data ?? null);
      setMessage(response.message ?? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.");
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Failed to load volume level version differences.");
    },
  });

  const analyzeDraftImpactMutation = useMutation({
    mutationFn: () => analyzeVolumeImpact(novelId, { volumes: draftDocument.volumes }),
    onSuccess: (response) => {
      setImpactResult(response.data ?? null);
      setMessage(response.message ?? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.");
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Volume level draft impact analysis failed.");
    },
  });

  const analyzeVersionImpactMutation = useMutation({
    mutationFn: () => {
      if (!selectedVersionId) {
        throw new Error("Please select a volume-level version first.");
      }
      return analyzeVolumeImpact(novelId, { versionId: selectedVersionId });
    },
    onSuccess: (response) => {
      setImpactResult(response.data ?? null);
      setMessage(response.message ?? "Volume-level version impact analysis completed.");
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.");
    },
  });

  const loadSelectedVersionMutation = useMutation({
    mutationFn: () => {
      if (!selectedVersionId) {
        throw new Error("Please select a volume-level version first.");
      }
      return getVolumeVersion(novelId, selectedVersionId);
    },
    onSuccess: (response) => {
      const version = response.data;
      if (!version) {
        setMessage("Failed to read volume level version content.");
        return;
      }
      try {
        const parsed = JSON.parse(version.contentJson) as Partial<VolumePlanDocument>;
        setDraftVolumes(parsed.volumes ?? []);
        setStrategyPlan(parsed.strategyPlan ?? null);
        setCritiqueReport(parsed.critiqueReport ?? null);
        setBeatSheets(parsed.beatSheets ?? []);
        setRebalanceDecisions(parsed.rebalanceDecisions ?? []);
        setMessage(`已加载 V${version.version} 到当前卷级草稿。`);
      } catch {
        setMessage("Failed to read volume level version content.");
      }
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Failed to read volume level version content.");
    },
  });

  const loadSelectedVersionToDraft = () => {
    loadSelectedVersionMutation.mutate();
  };

  return {
    volumeMessage: message,
    volumeVersions: versions,
    selectedVersionId,
    setSelectedVersionId,
    selectedVersion: selectedVersion as VolumePlanVersionSummary | undefined,
    diffResult,
    impactResult,
    isLoadingVersions: volumeVersionsQuery.isLoading,
    createDraftVersionMutation,
    activateVersionMutation,
    freezeVersionMutation,
    diffMutation,
    analyzeDraftImpactMutation,
    analyzeVersionImpactMutation,
    loadSelectedVersionToDraft,
  };
}
