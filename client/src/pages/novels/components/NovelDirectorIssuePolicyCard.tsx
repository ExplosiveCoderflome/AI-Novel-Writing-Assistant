import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DIRECTOR_ISSUE_ACTIONS,
  DIRECTOR_ISSUE_CATALOG,
  DIRECTOR_ISSUE_POLICY_PRESETS,
  type DirectorIssueAction,
  type DirectorIssueCode,
  type DirectorIssuePolicyOverride,
} from "@ai-novel/shared/types/directorIssue";
import { getNovelDirectorIssuePolicy, saveNovelDirectorIssuePolicy } from "@/api/novelDirector";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ACTION_LABELS: Record<DirectorIssueAction, string> = {
  auto_retry: "自动重试",
  continue_with_warning: "提醒后继续",
  pause_for_manual: "暂停处理",
  fail_task: "结束任务",
};

const CONFIGURABLE_ISSUES = DIRECTOR_ISSUE_CATALOG;

export default function NovelDirectorIssuePolicyCard({ novelId }: { novelId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.tasks.directorIssuePolicy(novelId),
    queryFn: () => getNovelDirectorIssuePolicy(novelId),
  });
  const response = query.data?.data;
  const [draft, setDraft] = useState<DirectorIssuePolicyOverride | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (response) setDraft(response.override ?? {});
  }, [response]);

  const mutation = useMutation({
    mutationFn: (override: DirectorIssuePolicyOverride | null) => saveNovelDirectorIssuePolicy(novelId, override),
    onSuccess: async (result) => {
      setMessage(result.message ?? "本书处理规则已保存。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.directorIssuePolicy(novelId) });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "保存本书处理规则失败。"),
  });

  if (!response || draft === null) return null;
  const overrideActions = draft.issueActions ?? {};
  const savedActions = response.override?.issueActions ?? {};
  const hasCompleteActionMap = CONFIGURABLE_ISSUES.every(
    (entry) => overrideActions[entry.code] !== undefined,
  );
  const hasChanges = JSON.stringify(overrideActions) !== JSON.stringify(savedActions)
    || draft.maxAutomaticRetries !== response.override?.maxAutomaticRetries;

  const setAction = (code: DirectorIssueCode, value: string) => {
    const nextActions = { ...overrideActions };
    if (!value) delete nextActions[code];
    else nextActions[code] = value as DirectorIssueAction;
    setDraft({ ...draft, issueActions: nextActions });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>本书问题处理偏好</CardTitle>
        <CardDescription>选择适合本书的处理方案，或逐项调整。保存后会用于后续任务；安全保护仍会优先保护作品。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          {DIRECTOR_ISSUE_POLICY_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="rounded-xl border border-border p-4 text-left transition-colors hover:bg-muted/40"
              onClick={() => setDraft({
                maxAutomaticRetries: preset.policy.maxAutomaticRetries,
                issueActions: { ...preset.policy.issueActions },
              })}
            >
              <div className="text-sm font-semibold">{preset.name}</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{preset.description}</div>
            </button>
          ))}
        </div>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2 text-sm">
          <span className="font-medium">自动重试</span>
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={draft.maxAutomaticRetries ?? response.effectivePolicy.maxAutomaticRetries} onChange={(event) => setDraft({ ...draft, maxAutomaticRetries: Number(event.target.value) })}>
            <option value={0}>不自动重试</option>
            <option value={1}>最多 1 次</option>
          </select>
        </label>
        {CONFIGURABLE_ISSUES.map((entry) => (
          <div key={entry.code} className="grid gap-2 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <div className="text-sm font-medium">{entry.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">全局：{ACTION_LABELS[response.effectivePolicy.issueActions[entry.code] ?? entry.defaultAction]}</div>
              {entry.lockedReason ? <div className="mt-1 text-xs text-amber-700">安全提示：{entry.lockedReason}{entry.enforcedAction ? ` 当前触发时仍会${ACTION_LABELS[entry.enforcedAction]}。` : ""}</div> : null}
            </div>
            <select className="h-9 rounded-md border bg-background px-3 text-sm" value={overrideActions[entry.code] ?? ""} onChange={(event) => setAction(entry.code, event.target.value)}>
              {!hasCompleteActionMap ? <option value="">继承全局</option> : null}
              {DIRECTOR_ISSUE_ACTIONS.map((value) => <option key={value} value={value}>{ACTION_LABELS[value]}</option>)}
            </select>
          </div>
        ))}
        {hasChanges ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950" role="status">
            你修改了本书的问题处理偏好。保存后会影响后续任务；安全保护触发时，系统可能仍会暂停或结束任务，并保留这次选择供复核。
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate(draft)}>{mutation.isPending ? "保存中…" : "保存本书偏好"}</Button>
          <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate(null)}>恢复继承全局</Button>
          {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
