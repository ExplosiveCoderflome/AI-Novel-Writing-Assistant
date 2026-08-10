import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createNovelSnapshot, listNovelSnapshots, restoreNovelSnapshot } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface VersionHistoryTabProps {
  novelId: string;
}

function formatSnapshotTrigger(triggerType: string): string {
  if (triggerType === "manual") {
    return i18next.t("dict.gen_291fb3fc");
  }
  if (triggerType === "auto_milestone") {
    return i18next.t("dict.gen_55c19f20");
  }
  if (triggerType === "before_pipeline") {
    return i18next.t("dict.gen_01a7446d");
  }
  return i18next.t("dict.gen_387b56ef");
}

export default function VersionHistoryTab({ novelId }: VersionHistoryTabProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const snapshotsQuery = useQuery({
    queryKey: queryKeys.novels.snapshots(novelId),
    queryFn: () => listNovelSnapshots(novelId),
    enabled: Boolean(novelId),
  });

  const createMutation = useMutation({
    mutationFn: () => createNovelSnapshot(novelId, {
      triggerType: "manual",
      label: `manual-${new Date().toLocaleString()}`,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.snapshots(novelId) });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (snapshotId: string) => restoreNovelSnapshot(novelId, snapshotId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.detail(novelId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.novels.snapshots(novelId) });
    },
  });

  const snapshots = snapshotsQuery.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/15 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-medium">{i18next.t("home.versionHistory")}</div>
          <div className="text-sm text-muted-foreground">{i18next.t("novels.versionHistoryTab.euw1wc")}</div>
        </div>
        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
          {createMutation.isPending ? i18next.t("common.saving") : i18next.t("dict.saveCurrentVersion")}
        </Button>
      </div>

      <div className="space-y-3">
        {snapshots.map((snapshot) => {
          const isRestoringCurrent = restoreMutation.isPending && restoreMutation.variables === snapshot.id;

          return (
            <div key={snapshot.id} className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="font-medium">{i18next.t("dict.gen_snapshotla_36vz")}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatSnapshotTrigger(snapshot.triggerType)} · {new Date(snapshot.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant={snapshot.triggerType === "manual" ? "secondary" : "outline"}>
                      {formatSnapshotTrigger(snapshot.triggerType)}
                    </Badge>
                    <Badge variant="outline">{new Date(snapshot.createdAt).toLocaleDateString()}</Badge>
                  </div>

                  <div className="text-sm leading-6 text-muted-foreground">{i18next.t("novels.versionHistoryTab.n0u3ia")}</div>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const confirmed = window.confirm(i18next.t("dict.gen_eecaf902"));
                    if (confirmed) {
                      restoreMutation.mutate(snapshot.id);
                    }
                  }}
                  disabled={restoreMutation.isPending}
                >
                  {isRestoringCurrent ? i18next.t("dict.gen_3baa9427") : i18next.t("dict.gen_db4a6ab7")}
                </Button>
              </div>
            </div>
          );
        })}
        {snapshots.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">{i18next.t("novels.versionHistoryTab.gtu2re")}</div>
        ) : null}
      </div>
    </div>
  );
}
