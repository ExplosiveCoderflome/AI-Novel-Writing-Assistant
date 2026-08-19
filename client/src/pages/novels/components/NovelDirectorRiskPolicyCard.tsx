import i18next from "i18next";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_DIRECTOR_RISK_POLICY,
  getNovelDirectorRiskPolicy,
  isDirectorRiskPolicyEndpointUnavailable,
  saveNovelDirectorRiskPolicy,
  type DirectorRiskPolicy,
} from "@/api/directorRiskPolicy";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";

export function NovelDirectorRiskPolicyCard({ novelId }: { novelId: string }) {
  const queryClient = useQueryClient();
  const policyQuery = useQuery({
    queryKey: queryKeys.novels.directorRiskPolicy(novelId),
    queryFn: () => getNovelDirectorRiskPolicy(novelId),
    retry: false,
  });
  const policy = policyQuery.data?.data;
  const [draft, setDraft] = useState<DirectorRiskPolicy>(DEFAULT_DIRECTOR_RISK_POLICY);
  const [usesOverride, setUsesOverride] = useState(false);
  useEffect(() => {
    if (!policy) return;
    setUsesOverride(policy.source === "novel");
    setDraft(policy.override ?? policy);
  }, [policy]);
  const unavailable = policyQuery.isError && isDirectorRiskPolicyEndpointUnavailable(policyQuery.error);
  const saveMutation = useMutation({
    mutationFn: (override: DirectorRiskPolicy | null) => saveNovelDirectorRiskPolicy(novelId, override),
    onSuccess: async (response) => {
      if (response.data) {
        setUsesOverride(response.data.source === "novel");
        setDraft(response.data.override ?? response.data);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.directorRiskPolicy(novelId) });
      toast.success(i18next.t("novels.novelDirectorRiskPolicyCard.1kjm8l"));
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : i18next.t("novels.novelDirectorRiskPolicyCard.90w88n")),
  });
  const setPolicy = (noticeRaw: number, pauseRaw: number) => setDraft(() => {
    const noticeThreshold = Math.max(2, Math.min(7, Math.round(noticeRaw) || 5));
    const pauseThreshold = Math.max(noticeThreshold + 1, Math.min(8, Math.max(3, Math.round(pauseRaw) || 8)));
    return { noticeThreshold, pauseThreshold };
  });

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{i18next.t("novels.novelDirectorRiskPolicyCard.l5dkg0")}</CardTitle>
        <CardDescription>{i18next.t("novels.novelDirectorRiskPolicyCard.n8knnf")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/15 p-3">
          <div><div className="text-sm font-medium">{i18next.t("novels.novelDirectorRiskPolicyCard.o6dbj9")}</div><div className="mt-1 text-xs text-muted-foreground">{i18next.t("novels.novelDirectorRiskPolicyCard.dyhxhx")}</div></div>
          <Switch checked={usesOverride} disabled={policyQuery.isLoading || unavailable || saveMutation.isPending}
            aria-label={i18next.t("novels.novelDirectorRiskPolicyCard.vhpqu7")} onCheckedChange={(checked) => {
              setUsesOverride(checked);
              if (!checked) saveMutation.mutate(null);
            }} />
        </div>
        {usesOverride ? <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2"><span className="text-sm font-medium">{i18next.t("novels.novelDirectorRiskPolicyCard.d6xobw")}</span><Input type="number" min={2} max={7} value={draft.noticeThreshold} onChange={(event) => setPolicy(Number(event.target.value), draft.pauseThreshold)} /></label>
          <label className="space-y-2"><span className="text-sm font-medium">{i18next.t("novels.novelDirectorRiskPolicyCard.y8n3j0")}</span><Input type="number" min={draft.noticeThreshold + 1} max={8} value={draft.pauseThreshold} onChange={(event) => setPolicy(draft.noticeThreshold, Number(event.target.value))} /><span className="block text-xs leading-5 text-muted-foreground">{i18next.t("novels.novelDirectorRiskPolicyCard.84u66k")}</span></label>
        </div> : null}
        {unavailable ? <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{i18next.t("novels.novelDirectorRiskPolicyCard.ppqc2h")}</div> : null}
        {usesOverride ? <div className="flex justify-end"><Button type="button" disabled={saveMutation.isPending || unavailable} onClick={() => saveMutation.mutate(draft)}>{saveMutation.isPending ? "保存中..." : "保存本书规则"}</Button></div> : null}
      </CardContent>
    </Card>
  );
}
