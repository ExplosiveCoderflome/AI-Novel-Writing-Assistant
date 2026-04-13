import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createNovelSnapshot, listNovelSnapshots, restoreNovelSnapshot } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";

interface VersionHistoryTabProps {
  novelId: string;
}

export default function VersionHistoryTab({ novelId }: VersionHistoryTabProps) {
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
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <div className="font-medium">版本历史</div>
          <div className="text-sm text-muted-foreground">支持手动创建、预览元信息和恢复前确认。</div>
        </div>
        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
          {createMutation.isPending ? "创建中..." : "创建快照"}
        </Button>
      </div>

      <div className="space-y-2">
        {snapshots.map((snapshot) => (
          <div key={snapshot.id} className="rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{snapshot.label || "未命名快照"}</div>
                <div className="text-xs text-muted-foreground">
                  {snapshot.triggerType} · {new Date(snapshot.createdAt).toLocaleString()}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const confirmed = window.confirm("恢复前会自动备份当前状态。确认恢复这个快照吗？");
                  if (confirmed) {
                    restoreMutation.mutate(snapshot.id);
                  }
                }}
                disabled={restoreMutation.isPending}
              >
                恢复
              </Button>
            </div>
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
              {snapshot.snapshotData.slice(0, 1200)}
              {snapshot.snapshotData.length > 1200 ? "\n...(truncated)" : ""}
            </pre>
          </div>
        ))}
        {snapshots.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
            当前还没有版本快照。
          </div>
        ) : null}
      </div>
    </div>
  );
}
