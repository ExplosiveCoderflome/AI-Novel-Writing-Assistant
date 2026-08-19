import i18next from "i18next";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DIRECTOR_ISSUE_ACTIONS,
  DIRECTOR_ISSUE_CATALOG,
  type DirectorIssueAction,
  type DirectorIssueCode,
  type DirectorIssuePolicyOverride,
} from "@ai-novel/shared/types/directorIssue";
import { getNovelDirectorIssuePolicy, saveNovelDirectorIssuePolicy } from "@/api/novelDirector";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ACTION_LABELS: Record<DirectorIssueAction, string> = {
  auto_retry: i18next.t("novels.novelDirectorIssuePolicyCard.gqpgkm"),
  continue_with_warning: i18next.t("novels.novelDirectorIssuePolicyCard.h78n0u"),
  pause_for_manual: i18next.t("novels.novelDirectorIssuePolicyCard.d9no64"),
  fail_task: i18next.t("novels.novelDirectorIssuePolicyCard.gfdxpu"),
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
      setMessage(result?.message ?? "本书处理规则已保存。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.tasks.directorIssuePolicy(novelId) });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : i18next.t("novels.novelDirectorIssuePolicyCard.ek85fi")),
  });

  if (!response || draft === null) return null;
  const overrideActions = draft.issueActions ?? {};
  const savedActions = response.override?.issueActions ?? {};
  const hasChanges = JSON.stringify(overrideActions) !== JSON.stringify(savedActions);

  const setAction = (code: DirectorIssueCode, value: string) => {
    const nextActions = { ...overrideActions };
    if (!value) delete nextActions[code];
    else nextActions[code] = value as DirectorIssueAction;
    setDraft({ ...draft, issueActions: nextActions });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{i18next.t("novels.novelDirectorIssuePolicyCard.66jws4")}</CardTitle>
        <CardDescription>{i18next.t("novels.novelDirectorIssuePolicyCard.uanm")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {CONFIGURABLE_ISSUES.map((entry) => {
          const actionKey = (response.effectivePolicy.issueActions[entry.code] ?? entry.defaultAction) as DirectorIssueAction;
          return (
            <div key={entry.code} className="grid gap-2 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <div>
                <div className="text-sm font-medium">{entry.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">全局：{ACTION_LABELS[actionKey] ?? actionKey}</div>
                {entry.lockedReason ? <div className="mt-1 text-xs text-amber-700">安全提示：{entry.lockedReason}{entry.enforcedAction ? i18next.t("novels.novelDirectorIssuePolicyCard.wwe9qs", { val1: (ACTION_LABELS[entry.enforcedAction]) }) : ""}</div> : null}
              </div>
              <select className="h-9 rounded-md border bg-background px-3 text-sm" value={overrideActions[entry.code] ?? ""} onChange={(event) => setAction(entry.code, event.target.value)}>
                <option value="">{i18next.t("novels.novelDirectorIssuePolicyCard.gf1gsw")}</option>
                {DIRECTOR_ISSUE_ACTIONS.map((value) => <option key={value} value={value}>{ACTION_LABELS[value]}</option>)}
              </select>
            </div>
          );
        })}
        {hasChanges ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950" role="status">{i18next.t("novels.novelDirectorIssuePolicyCard.fj1a14")}</div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate(draft)}>{mutation.isPending ? "保存中…" : "保存本书偏好"}</Button>
          <Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate(null)}>{i18next.t("novels.novelDirectorIssuePolicyCard.s5nbd1")}</Button>
          {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
