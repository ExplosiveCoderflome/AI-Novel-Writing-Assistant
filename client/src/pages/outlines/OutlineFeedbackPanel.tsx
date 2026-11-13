import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OutlineFeedbackRunView, OutlineFeedbackSettings } from "@ai-novel/shared/types/outlineFeedback";
import {
  adoptOutlineFeedback,
  analyzeOutlineFeedback,
  getOutlineFeedbackStatus,
  rejectOutlineFeedback,
  retryOutlineFeedbackRun,
  updateOutlineFeedbackSettings,
} from "@/api/outlines";
import { Button } from "@/components/ui/button";
import { featureFlags } from "@/config/featureFlags";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";
import { outlineFieldLabels } from "./outlineNodes";

const RUN_STATUS_LABEL: Record<OutlineFeedbackRunView["status"], string> = {
  pending: "等待中",
  running: "分析中",
  completed: "已完成",
  failed: "失败",
};

const ITEM_STATUS_LABEL = {
  pending: "待处理",
  adopted: "已采纳",
  rejected: "已拒绝",
} as const;

function defaultSettings(settings?: OutlineFeedbackSettings | null): OutlineFeedbackSettings {
  return {
    mode: settings?.mode ?? "chapter",
    everyN: settings?.everyN ?? 5,
    provider: settings?.provider,
    model: settings?.model,
  };
}

export function shouldShowOutlineFeedbackPanel(options: { flagEnabled: boolean; bound: boolean; isMobile: boolean }) {
  return options.flagEnabled && options.bound && !options.isMobile;
}

export function OutlineFeedbackPanel({ outlineId, bound }: { outlineId: string; bound: boolean }) {
  const isMobile = useIsMobileViewport();
  if (!shouldShowOutlineFeedbackPanel({ flagEnabled: featureFlags.outlineFeedbackEnabled, bound, isMobile })) {
    return null;
  }
  return <OutlineFeedbackPanelBody outlineId={outlineId} />;
}

function OutlineFeedbackPanelBody({ outlineId }: { outlineId: string }) {
  const queryClient = useQueryClient();
  const [settingsDraft, setSettingsDraft] = useState<OutlineFeedbackSettings>(defaultSettings());
  const [chapterId, setChapterId] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const statusQuery = useQuery({
    queryKey: ["outline-feedback", outlineId],
    queryFn: () => getOutlineFeedbackStatus(outlineId),
    enabled: !!outlineId,
    refetchInterval: (query) => {
      const runs = query.state.data?.runs ?? [];
      return runs.some((run) => run.status === "pending" || run.status === "running") ? 3000 : false;
    },
  });

  useEffect(() => {
    if (statusQuery.data?.settings) setSettingsDraft(defaultSettings(statusQuery.data.settings));
  }, [statusQuery.data?.settings]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["outline-feedback", outlineId] }),
      queryClient.invalidateQueries({ queryKey: ["outline", outlineId] }),
      queryClient.invalidateQueries({ queryKey: ["outline-revisions", outlineId] }),
    ]);
  };

  const saveSettings = useMutation({
    mutationFn: () => updateOutlineFeedbackSettings(outlineId, settingsDraft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["outline-feedback", outlineId] });
    },
  });
  const analyze = useMutation({
    mutationFn: () => analyzeOutlineFeedback(outlineId, { chapterId: chapterId.trim(), requestKey: requestKey.trim() }),
    onSuccess: async () => {
      setRequestKey("");
      await queryClient.invalidateQueries({ queryKey: ["outline-feedback", outlineId] });
    },
  });
  const retry = useMutation({
    mutationFn: (runId: string) => retryOutlineFeedbackRun(outlineId, runId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["outline-feedback", outlineId] });
    },
  });
  const decide = useMutation({
    mutationFn: ({ runId, action, operationIds }: { runId: string; action: "adopt" | "reject"; operationIds: string[] }) =>
      action === "adopt"
        ? adoptOutlineFeedback(outlineId, runId, operationIds)
        : rejectOutlineFeedback(outlineId, runId, operationIds),
    onSuccess: async () => {
      await refresh();
    },
  });

  const runs = statusQuery.data?.runs ?? [];
  const hasActive = useMemo(() => runs.some((run) => run.status === "pending" || run.status === "running"), [runs]);

  return (
    <section id="outline-feedback-panel" aria-label="章节摘要反馈" className="space-y-4 rounded-md border border-border/60 p-4">
      <header className="space-y-1">
        <h2 className="text-base font-semibold">章节摘要反馈</h2>
        <p className="text-xs text-muted-foreground">
          根据已落库的章节摘要提出大纲字段调整，需逐项采纳或拒绝后才会生成新修订。不会自动改写大纲，也不会读取章节正文。
        </p>
        {statusQuery.data?.sourceRoute ? (
          <p className="text-xs text-muted-foreground">已绑定来源：{statusQuery.data.sourceRoute}</p>
        ) : null}
      </header>

      {statusQuery.isLoading ? <p className="text-sm text-muted-foreground">正在读取反馈…</p> : null}
      {statusQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {statusQuery.error instanceof Error ? statusQuery.error.message : "反馈状态读取失败，请稍后重试。"}
        </p>
      ) : null}

      {statusQuery.isSuccess ? (
        <>
          <form
            className="space-y-3 border-b border-border/50 pb-4"
            onSubmit={(event) => {
              event.preventDefault();
              saveSettings.mutate();
            }}
          >
            <h3 className="text-sm font-medium">触发设置</h3>
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">频率</span>
                <select
                  className="block rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={settingsDraft.mode}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, mode: event.target.value as OutlineFeedbackSettings["mode"] }))}
                >
                  <option value="chapter">逐章</option>
                  <option value="every_n">每 N 章</option>
                  <option value="volume">卷末章</option>
                  <option value="off">关闭自动分析</option>
                </select>
              </label>
              {settingsDraft.mode === "every_n" ? (
                <label className="space-y-1 text-xs">
                  <span className="text-muted-foreground">N</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className="block w-20 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    value={settingsDraft.everyN}
                    onChange={(event) => setSettingsDraft((current) => ({ ...current, everyN: Number(event.target.value) || 1 }))}
                  />
                </label>
              ) : null}
              <Button type="submit" size="sm" variant="outline" disabled={saveSettings.isPending}>
                {saveSettings.isPending ? "正在保存…" : "保存设置"}
              </Button>
            </div>
            {saveSettings.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {saveSettings.error instanceof Error ? saveSettings.error.message : "设置保存失败，请重试。"}
              </p>
            ) : null}
          </form>

          <form
            className="space-y-3 border-b border-border/50 pb-4"
            onSubmit={(event) => {
              event.preventDefault();
              analyze.mutate();
            }}
          >
            <h3 className="text-sm font-medium">手动分析</h3>
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">章节 ID</span>
                <input
                  className="block w-56 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={chapterId}
                  onChange={(event) => setChapterId(event.target.value)}
                  aria-label="要分析的章节 ID"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-muted-foreground">请求键</span>
                <input
                  className="block w-56 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={requestKey}
                  onChange={(event) => setRequestKey(event.target.value)}
                  aria-label="手动分析请求键"
                />
              </label>
              <Button type="submit" size="sm" disabled={!chapterId.trim() || !requestKey.trim() || analyze.isPending}>
                {analyze.isPending ? "已提交…" : "开始分析"}
              </Button>
            </div>
            {analyze.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {analyze.error instanceof Error ? analyze.error.message : "分析请求失败，请重试。"}
              </p>
            ) : null}
          </form>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">运行与建议</h3>
              {hasActive ? <p className="text-xs text-muted-foreground">有进行中的分析，列表会自动刷新。</p> : null}
            </div>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无反馈运行。摘要保存后会按设置异步分析，也可手动发起。</p>
            ) : (
              <ul className="space-y-4">
                {runs.map((run) => (
                  <li key={run.id} className="space-y-2 rounded-md border border-border/50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm">
                        第 {run.chapterOrder} 章 · {RUN_STATUS_LABEL[run.status]}
                        {run.attempt > 1 ? ` · 第 ${run.attempt} 次` : ""}
                      </p>
                      {run.status === "failed" || (run.status === "running" && run.attempt >= 1) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={retry.isPending}
                          onClick={() => retry.mutate(run.id)}
                        >
                          重试
                        </Button>
                      ) : null}
                    </div>
                    {run.error ? <p role="alert" className="text-xs text-destructive">{run.error}</p> : null}
                    {run.items.length ? (
                      <ul className="space-y-3">
                        {run.items.map((item) => (
                          <li key={item.operationId} className="space-y-2 text-sm">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-medium">节点 {item.nodeId}</p>
                                <p className="text-xs text-muted-foreground">{ITEM_STATUS_LABEL[item.status]}</p>
                              </div>
                              {item.status === "pending" ? (
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={decide.isPending}
                                    onClick={() => decide.mutate({ runId: run.id, action: "adopt", operationIds: [item.operationId] })}
                                  >
                                    采纳
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={decide.isPending}
                                    onClick={() => decide.mutate({ runId: run.id, action: "reject", operationIds: [item.operationId] })}
                                  >
                                    拒绝
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{item.reason}</p>
                            <dl className="outline-comparison text-xs">
                              {Object.entries(item.fields).map(([field, value]) => (
                                <div key={field}>
                                  <dt className="text-muted-foreground">{outlineFieldLabels[field] ?? field}</dt>
                                  <dd className="mt-1 whitespace-pre-wrap">{value}</dd>
                                </div>
                              ))}
                            </dl>
                          </li>
                        ))}
                      </ul>
                    ) : run.status === "completed" ? (
                      <p className="text-xs text-muted-foreground">这次运行没有可采纳的字段建议。</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {decide.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {decide.error instanceof Error ? decide.error.message : "处理建议失败。若大纲已被其他修订改动，请重新分析。"}
              </p>
            ) : null}
            {retry.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {retry.error instanceof Error ? retry.error.message : "重试失败，请稍后再次尝试。"}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
