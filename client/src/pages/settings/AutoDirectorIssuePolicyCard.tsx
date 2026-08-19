import i18next from "i18next";
import { useEffect, useMemo, useState } from "react";
import {
  DIRECTOR_ISSUE_ACTIONS,
  DIRECTOR_ISSUE_CATALOG,
  type DirectorIssueAction,
  type DirectorIssueCategory,
  type DirectorIssuePolicy,
} from "@ai-novel/shared/types/directorIssue";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const ACTION_LABELS: Record<DirectorIssueAction, string> = {
  auto_retry: i18next.t("novels.novelDirectorIssuePolicyCard.gqpgkm"),
  continue_with_warning: i18next.t("settings.autoDirectorIssuePolicyCard.dayu97"),
  pause_for_manual: i18next.t("settings.autoDirectorIssuePolicyCard.uic8p4"),
  fail_task: i18next.t("settings.autoDirectorIssuePolicyCard.jykmvg"),
};

const CATEGORY_LABELS: Record<DirectorIssueCategory, string> = {
  planning: i18next.t("dict.gen_335d6d3b"),
  generation: i18next.t("settings.autoDirectorIssuePolicyCard.kgk1"),
  quality: i18next.t("dict.gen_3a7170b9"),
  runtime: i18next.t("settings.autoDirectorIssuePolicyCard.p7jw"),
};

export function AutoDirectorIssuePolicyCard(props: {
  policy?: DirectorIssuePolicy | null;
  isLoading: boolean;
  isSaving: boolean;
  onSave: (policy: DirectorIssuePolicy) => void;
}) {
  const { policy, isLoading, isSaving, onSave } = props;
  const [draft, setDraft] = useState<DirectorIssuePolicy | null>(null);
  const [category, setCategory] = useState<DirectorIssueCategory | "all">("all");
  const [action, setAction] = useState<DirectorIssueAction | "all">("all");

  useEffect(() => {
    if (policy) setDraft(policy);
  }, [policy]);

  const current = draft ?? policy;
  const hasChanges = Boolean(policy && current && (
    current.noticeThreshold !== policy.noticeThreshold
    || current.pauseThreshold !== policy.pauseThreshold
    || JSON.stringify(current.issueActions) !== JSON.stringify(policy.issueActions)
  ));
  const entries = useMemo(() => DIRECTOR_ISSUE_CATALOG.filter((entry) => {
    const selectedAction = current?.issueActions[entry.code] ?? entry.defaultAction;
    return (category === "all" || entry.category === category)
      && (action === "all" || selectedAction === action);
  }), [action, category, current]);

  if (!current) {
    return (
      <Card><CardHeader><CardTitle>{i18next.t("settings.autoDirectorIssuePolicyCard.t2gwn5")}</CardTitle><CardDescription>{isLoading ? "正在加载…" : "暂时无法加载规则。"}</CardDescription></CardHeader></Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{i18next.t("settings.autoDirectorIssuePolicyCard.t2gwn5")}</CardTitle>
        <CardDescription>{i18next.t("settings.autoDirectorIssuePolicyCard.unkpwc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium">{i18next.t("novels.novelDirectorRiskPolicyCard.d6xobw")}</span>
            <Input type="number" min={2} max={7} value={current.noticeThreshold} onChange={(event) => setDraft({ ...current, noticeThreshold: Number(event.target.value) })} />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium">{i18next.t("settings.autoDirectorIssuePolicyCard.d9meh0")}</span>
            <Input type="number" min={3} max={8} value={current.pauseThreshold} onChange={(event) => setDraft({ ...current, pauseThreshold: Number(event.target.value) })} />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={category} onChange={(event) => setCategory(event.target.value as DirectorIssueCategory | "all")}>
            <option value="all">{i18next.t("settings.autoDirectorIssuePolicyCard.avl2v3")}</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={action} onChange={(event) => setAction(event.target.value as DirectorIssueAction | "all")}>
            <option value="all">{i18next.t("settings.autoDirectorIssuePolicyCard.av9flg")}</option>
            {DIRECTOR_ISSUE_ACTIONS.map((value) => <option key={value} value={value}>{ACTION_LABELS[value]}</option>)}
          </select>
        </div>

        {hasChanges ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950" role="status">{i18next.t("settings.autoDirectorIssuePolicyCard.8ujxga")}</div>
        ) : null}

        <div className="space-y-2">
          {entries.map((entry) => {
            const selected = current.issueActions[entry.code] ?? entry.defaultAction;
            return (
              <div key={entry.code} className="grid gap-2 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_220px]">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{entry.label}</div>
                  <div className="mt-1 break-all text-xs text-muted-foreground">{entry.code} · 默认：{ACTION_LABELS[entry.defaultAction]}</div>
                  {entry.lockedReason ? <div className="mt-1 text-xs text-amber-700">安全提示：{entry.lockedReason}{entry.enforcedAction ? i18next.t("novels.novelDirectorIssuePolicyCard.wwe9qs", { val1: (ACTION_LABELS[entry.enforcedAction]) }) : ""}</div> : null}
                </div>
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={selected}
                  onChange={(event) => setDraft({
                    ...current,
                    issueActions: { ...current.issueActions, [entry.code]: event.target.value as DirectorIssueAction },
                  })}
                >
                  {DIRECTOR_ISSUE_ACTIONS.map((value) => <option key={value} value={value}>{ACTION_LABELS[value]}</option>)}
                </select>
              </div>
            );
          })}
        </div>

        <Button disabled={isSaving || current.pauseThreshold <= current.noticeThreshold} onClick={() => onSave(current)}>
          {isSaving ? "保存中…" : "保存问题处理规则"}
        </Button>
      </CardContent>
    </Card>
  );
}
