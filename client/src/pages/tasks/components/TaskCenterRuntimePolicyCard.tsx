import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  DirectorPolicyMode,
  DirectorRuntimeSnapshot,
} from "@ai-novel/shared/types/directorRuntime";
import { updateDirectorRuntimePolicy } from "@/api/novelDirector";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

interface TaskCenterRuntimePolicyCardProps {
  taskId: string;
  snapshot: DirectorRuntimeSnapshot | null | undefined;
}

const POLICY_OPTIONS: Array<{ value: DirectorPolicyMode; label: string; description: string }> = [
  {
    value: "suggest_only",
    label: "只给建议",
    description: "只分析和给出建议，不自动写入规划或正文。",
  },
  {
    value: "run_next_step",
    label: "推进下一步",
    description: "只执行当前最小步骤，完成后停下来让你检查。",
  },
  {
    value: "run_until_gate",
    label: "推进到检查点",
    description: "连续推进到下一个需要确认的节点。",
  },
  {
    value: "auto_safe_scope",
    label: "安全范围自动推进",
    description: "仅在系统判断风险较低的范围内继续自动处理。",
  },
];

function formatPolicyMode(mode: DirectorPolicyMode): string {
  return POLICY_OPTIONS.find((item) => item.value === mode)?.label ?? mode;
}

export default function TaskCenterRuntimePolicyCard({
  taskId,
  snapshot,
}: TaskCenterRuntimePolicyCardProps) {
  const queryClient = useQueryClient();
  const currentMode = snapshot?.policy.mode ?? "run_until_gate";
  const [selectedMode, setSelectedMode] = useState<DirectorPolicyMode>(currentMode);
  const selectedOption = useMemo(
    () => POLICY_OPTIONS.find((item) => item.value === selectedMode) ?? POLICY_OPTIONS[2],
    [selectedMode],
  );
  const mutation = useMutation({
    mutationFn: () => updateDirectorRuntimePolicy(taskId, {
      mode: selectedMode,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.directorRuntime(taskId) });
      toast.success("导演推进方式已更新");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "更新导演推进方式失败");
    },
  });

  useEffect(() => {
    setSelectedMode(currentMode);
  }, [currentMode]);

  if (!snapshot) {
    return null;
  }

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium">导演推进方式</div>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">
            选择系统接下来怎么推进这个导演任务。
          </div>
        </div>
        <Badge variant="outline">{formatPolicyMode(snapshot.policy.mode)}</Badge>
      </div>
      <div className="mt-3 space-y-2">
        <select
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={selectedMode}
          onChange={(event) => setSelectedMode(event.target.value as DirectorPolicyMode)}
        >
          {POLICY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <div className="text-xs leading-5 text-muted-foreground">{selectedOption.description}</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || selectedMode === snapshot.policy.mode}
        >
          {mutation.isPending ? "保存中..." : "保存推进方式"}
        </Button>
      </div>
    </div>
  );
}
