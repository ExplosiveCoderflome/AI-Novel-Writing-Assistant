import i18next from "i18next";
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
import SelectControl from "@/components/common/SelectControl";

interface TaskCenterRuntimePolicyCardProps {
  taskId: string;
  snapshot: DirectorRuntimeSnapshot | null | undefined;
}

const POLICY_OPTIONS: Array<{ value: DirectorPolicyMode; label: string; description: string }> = [
  {
    value: "suggest_only",
    label: i18next.t("tasks.taskCenterRuntimePolicyCard.b42kir"),
    description: i18next.t("tasks.taskCenterRuntimePolicyCard.4chujy"),
  },
  {
    value: "run_next_step",
    label: i18next.t("tasks.taskCenterRuntimePolicyCard.i24uhv"),
    description: i18next.t("tasks.taskCenterRuntimePolicyCard.1uw6xn"),
  },
  {
    value: "run_until_gate",
    label: i18next.t("tasks.taskCenterRuntimePolicyCard.91gq7r"),
    description: i18next.t("tasks.taskCenterRuntimePolicyCard.uq7ivv"),
  },
  {
    value: "auto_safe_scope",
    label: i18next.t("tasks.taskCenterRuntimePolicyCard.vj93gf"),
    description: i18next.t("tasks.taskCenterRuntimePolicyCard.8qnol2"),
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
  const [allowExpensiveReview, setAllowExpensiveReview] = useState(false);
  const [mayOverwriteUserContent, setMayOverwriteUserContent] = useState(false);
  const selectedOption = useMemo(
    () => POLICY_OPTIONS.find((item) => item.value === selectedMode) ?? POLICY_OPTIONS[2],
    [selectedMode],
  );
  const mutation = useMutation({
    mutationFn: () => updateDirectorRuntimePolicy(taskId, {
      mode: selectedMode,
      allowExpensiveReview,
      mayOverwriteUserContent,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.directorRuntime(taskId) });
      toast.success(i18next.t("tasks.taskCenterRuntimePolicyCard.24q7bh"));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : i18next.t("tasks.taskCenterRuntimePolicyCard.w1ubgx"));
    },
  });

  useEffect(() => {
    setSelectedMode(currentMode);
    setAllowExpensiveReview(Boolean(snapshot?.policy.allowExpensiveReview));
    setMayOverwriteUserContent(Boolean(snapshot?.policy.mayOverwriteUserContent));
  }, [currentMode, snapshot?.policy.allowExpensiveReview, snapshot?.policy.mayOverwriteUserContent]);

  if (!snapshot) {
    return null;
  }

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium">{i18next.t("tasks.taskCenterRuntimePolicyCard.iszedd")}</div>
          <div className="mt-1 text-sm leading-6 text-muted-foreground">{i18next.t("tasks.taskCenterRuntimePolicyCard.1e5oln")}</div>
        </div>
        <Badge variant="outline">{formatPolicyMode(snapshot.policy.mode)}</Badge>
      </div>
      <div className="mt-3 space-y-2">
        <SelectControl
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={selectedMode}
          onChange={(event) => setSelectedMode(event.target.value as DirectorPolicyMode)}
        >
          {POLICY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </SelectControl>
        <div className="text-xs leading-5 text-muted-foreground">{selectedOption.description}</div>
      </div>
      <div className="mt-3 space-y-2 rounded-md border bg-background/70 p-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={allowExpensiveReview}
            onChange={(event) => setAllowExpensiveReview(event.target.checked)}
          />
          <span>
            <span className="block font-medium">{i18next.t("tasks.taskCenterRuntimePolicyCard.6maxi4")}</span>
            <span className="block text-xs leading-5 text-muted-foreground">{i18next.t("tasks.taskCenterRuntimePolicyCard.h2ojy4")}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={mayOverwriteUserContent}
            onChange={(event) => setMayOverwriteUserContent(event.target.checked)}
          />
          <span>
            <span className="block font-medium">{i18next.t("tasks.taskCenterRuntimePolicyCard.4i6dyp")}</span>
            <span className="block text-xs leading-5 text-muted-foreground">{i18next.t("tasks.taskCenterRuntimePolicyCard.65jxza")}</span>
          </span>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => mutation.mutate()}
          disabled={
            mutation.isPending
            || (
              selectedMode === snapshot.policy.mode
              && allowExpensiveReview === Boolean(snapshot.policy.allowExpensiveReview)
              && mayOverwriteUserContent === Boolean(snapshot.policy.mayOverwriteUserContent)
            )
          }
        >
          {mutation.isPending ? "保存中..." : "保存推进方式"}
        </Button>
      </div>
    </div>
  );
}
