import i18next from "i18next";
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
      setMessage(response.message ?? i18next.t("gen.pages.novels.hooks.useVolumeVersionControl.gen_a69308e8"));
      await invalidateVersionList();
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : i18next.t("gen.pages.novels.hooks.useVolumeVersionControl.gen_9e0e39c3"));
    },
  });

  const activateVersionMutation = useMutation({
    mutationFn: () => {
      if (!selectedVersionId) {
        throw new Error(i18next.t("gen.pages.novels.hooks.useVolumeVersionControl.gen_b8ccbcfc"));
      }
      return activateVolumeVersion(novelId, selectedVersionId);
    },
    onSuccess: async (response) => {
      setMessage(response.message ?? i18next.t("gen.pages.novels.hooks.useVolumeVersionControl.gen_b64724b6"));
      await invalidateVersionList();
      await invalidateNovelDetail();
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : i18next.t("gen.pages.novels.hooks.useVolumeVersionControl.gen_5c4833b3"));
    },
  });

  const freezeVersionMutation = useMutation({
    mutationFn: () => {
      if (!selectedVersionId) {
        throw new Error(i18next.t("gen.pages.novels.hooks.useVolumeVersionControl.gen_b8ccbcfc"));
      }
      return freezeVolumeVersion(novelId, selectedVersionId);
    },
    onSuccess: async (response) => {
      setMessage(response.message ?? i18next.t("gen.pages.novels.hooks.useVolumeVersionControl.gen_4519b3fb"));
      await invalidateVersionList();
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : i18next.t("gen.pages.novels.hooks.useVolumeVersionControl.gen_040f912d"));
    },
  });

  const diffMutation = useMutation({
    mutationFn: () => {
      if (!selectedVersionId) {
        throw new Error(i18next.t("gen.pages.novels.hooks.useVolumeVersionControl.gen_b8ccbcfc"));
      }
      return getVolumeDiff(novelId, selectedVersionId);
    },
    onSuccess: (response) => {
      setDiffResult(response.data ?? null);
      setMessage(response.message ?? i18next.t("gen.pages.novels.hooks.useVolumeVersionControl.gen_436e727f"));
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : i18next.t("gen.pages.novels.hooks.useVolumeVersionControl.gen_bb98c27a"));
    },
  });

  const analyzeDraftImpactMutation = useMutation({
    mutationFn: () => analyzeVolumeImpact(novelId, { volumes: draftDocument.volumes }),
    onSuccess: (response) => {
      setImpactResult(response.data ?? null);
      setMessage(response.message ?? i18next.t("gen.pages.novels.hooks.useVolumeVersionControl.gen_52fea1df"));
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : i18next.t("gen.pages.novels.hooks.useVolumeVersionControl.gen_7fa8f912"));
    },
  });

  const analyzeVersionImpactMutation = useMutation({
    mutationFn: () => {
      if (!selectedVersionId) {
        throw new Error(i18next.t("gen.pages.novels.hooks.useVolumeVersionControl.gen_b8ccbcfc"));
      }
      return analyzeVolumeImpact(novelId, { versionId: selectedVersionId });
    },
    onSuccess: (response) => {
      setImpactResult(response.data ?? null);
      setMessage(response.message ?? i18next.t("gen.pages.novels.hooks.useVolumeVersionControl.gen_1a5590e4"));
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : i18next.t("gen.pages.novels.hooks.useVolumeVersionControl.gen_d2c7a968"));
    },
  });

  const loadSelectedVersionMutation = useMutation({
    mutationFn: () => {
      if (!selectedVersionId) {
        throw new Error(i18next.t("gen.pages.novels.hooks.useVolumeVersionControl.gen_b8ccbcfc"));
      }
      return getVolumeVersion(novelId, selectedVersionId);
    },
    onSuccess: (response) => {
      const version = response.data;
      if (!version) {
        setMessage(i18next.t("gen.pages.novels.hooks.useVolumeVersionControl.gen_e4fa5194"));
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
        setMessage(i18next.t("gen.pages.novels.hooks.useVolumeVersionControl.gen_e4fa5194"));
      }
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : i18next.t("gen.pages.novels.hooks.useVolumeVersionControl.gen_e4fa5194"));
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
