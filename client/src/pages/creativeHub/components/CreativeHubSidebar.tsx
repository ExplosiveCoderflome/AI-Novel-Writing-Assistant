import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useMemo, useState } from "react";
import type { FailureDiagnostic } from "@ai-novel/shared/types/agent";
import type {
  CreativeHubInterrupt,
  CreativeHubNovelSetupStatus,
  CreativeHubProductionStatus,
  CreativeHubResourceBinding,
  CreativeHubThread,
  CreativeHubTurnSummary,
} from "@ai-novel/shared/types/creativeHub";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import CreativeHubNovelSetupCard from "./CreativeHubNovelSetupCard";
import NovelProductionStarterCard from "./NovelProductionStarterCard";
import SelectControl from "@/components/common/SelectControl";

interface CreativeHubSidebarProps {
  thread?: CreativeHubThread;
  bindings: CreativeHubResourceBinding;
  novels: Array<{ id: string; title: string }>;
  interrupt?: CreativeHubInterrupt;
  diagnostics?: FailureDiagnostic;
  productionStatus?: CreativeHubProductionStatus | null;
  novelSetup?: CreativeHubNovelSetupStatus | null;
  latestTurnSummary?: CreativeHubTurnSummary | null;
  currentCheckpointId?: string | null;
  modelSummary: {
    provider: string;
    model: string;
    temperature: number;
    maxTokens?: number;
  };
  defaultRuntimeDetailsCollapsed: boolean;
  onToggleRuntimeDetailsDefault: () => void;
  onNovelChange: (novelId: string) => void;
  onQuickAction?: (prompt: string) => void;
  onCreateNovel?: (title: string) => void;
  onStartProduction?: (prompt: string) => void;
}

function bindingValue(value: string | null | undefined): string {
  return value?.trim() || t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_906ad18b");
}

function turnStatusLabel(status: CreativeHubTurnSummary["status"]): string {
  switch (status) {
    case "succeeded":
      return t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_fad5222c");
    case "interrupted":
      return t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_2a2772fa");
    case "failed":
      return t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_acd5cb84");
    case "cancelled":
      return t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_2111ccbb");
    case "running":
      return t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_fb852fc6");
    default:
      return status;
  }
}

function threadStatusLabel(status: CreativeHubThread["status"] | undefined): string {
  switch (status) {
    case "busy":
      return t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_46e38679");
    case "interrupted":
      return t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_047109de");
    case "error":
      return t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_c195df63");
    case "idle":
      return t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_87bb5bbc");
    default:
      return t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_aeade8e9");
  }
}

function statusVariant(
  status: CreativeHubTurnSummary["status"] | CreativeHubThread["status"] | undefined,
): "outline" | "secondary" | "destructive" {
  if (status === "failed" || status === "cancelled" || status === "error") {
    return "destructive";
  }
  if (status === "interrupted") {
    return "secondary";
  }
  return "outline";
}

function metricTone(status: "pending" | "completed" | "running" | "blocked"): string {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "running":
      return "border-sky-200 bg-sky-50 text-sky-700";
    case "blocked":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function summarizeFocus(
  latestTurnSummary: CreativeHubTurnSummary | null | undefined,
  productionStatus: CreativeHubProductionStatus | null | undefined,
  novelSetup: CreativeHubNovelSetupStatus | null | undefined,
): string {
  if (latestTurnSummary?.intentSummary?.trim()) {
    return latestTurnSummary.intentSummary.trim();
  }
  if (novelSetup?.stage === "setup_in_progress" || novelSetup?.stage === "ready_for_planning") {
    return `当前正在补齐《${novelSetup.title}》的初始信息。`;
  }
  if (productionStatus?.summary?.trim()) {
    return productionStatus.summary.trim();
  }
  return t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_b51b450d");
}

function buildBlockerCardData(input: {
  interrupt?: CreativeHubInterrupt;
  diagnostics?: FailureDiagnostic;
  productionStatus?: CreativeHubProductionStatus | null;
  latestTurnSummary?: CreativeHubTurnSummary | null;
}) {
  if (input.interrupt) {
    return {
      title: t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_b144df0f"),
      summary: input.interrupt.summary,
      details: [
        `等待确认: ${input.interrupt.title}`,
        input.interrupt.targetType ? `目标类型: ${input.interrupt.targetType}` : "",
        input.interrupt.targetId ? `目标对象: ${input.interrupt.targetId}` : "",
      ].filter(Boolean),
      tone: "border-amber-200 bg-amber-50 text-amber-900",
      actionLabel: t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_d26a068c"),
      actionPrompt: t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_5fa9adbb"),
    };
  }

  if (input.diagnostics?.failureSummary) {
    return {
      title: t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_72022eb6"),
      summary: input.diagnostics.failureSummary,
      details: [
        input.diagnostics.failureCode ? `错误码: ${input.diagnostics.failureCode}` : "",
        input.diagnostics.recoveryHint ? `恢复建议: ${input.diagnostics.recoveryHint}` : "",
      ].filter(Boolean),
      tone: "border-rose-200 bg-rose-50 text-rose-900",
      actionLabel: t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_65921d4a"),
      actionPrompt: input.diagnostics.recoveryHint || t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_4efc152f"),
    };
  }

  if (input.productionStatus?.failureSummary) {
    return {
      title: t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_b144df0f"),
      summary: input.productionStatus.failureSummary,
      details: [
        input.productionStatus.recoveryHint ? `恢复建议: ${input.productionStatus.recoveryHint}` : "",
        `当前阶段: ${input.productionStatus.currentStage}`,
      ].filter(Boolean),
      tone: "border-orange-200 bg-orange-50 text-orange-900",
      actionLabel: t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_24068591"),
      actionPrompt: input.productionStatus.recoveryHint || t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_6fa50d9b"),
    };
  }

  if (input.latestTurnSummary?.status === "interrupted") {
    return {
      title: t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_7c3be765"),
      summary: input.latestTurnSummary.nextSuggestion,
      details: [
        `阶段: ${input.latestTurnSummary.currentStage}`,
        `状态: ${turnStatusLabel(input.latestTurnSummary.status)}`,
      ],
      tone: "border-sky-200 bg-sky-50 text-sky-900",
      actionLabel: t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_a4b6e9ea"),
      actionPrompt: input.latestTurnSummary.nextSuggestion,
    };
  }

  return {
    title: t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_6bf1f392"),
    summary: t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_1d85a303"),
    details: input.latestTurnSummary?.nextSuggestion
      ? [`建议下一步: ${input.latestTurnSummary.nextSuggestion}`]
      : [],
    tone: "border-slate-200 bg-slate-50 text-slate-800",
    actionLabel: input.latestTurnSummary?.nextSuggestion ? t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_a4b6e9ea") : undefined,
    actionPrompt: input.latestTurnSummary?.nextSuggestion,
  };
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs text-slate-600">
      <span className="text-slate-500">{label}</span>
      <span className="max-w-[60%] break-all text-right text-slate-800">{value}</span>
    </div>
  );
}

export default function CreativeHubSidebar({
  thread,
  bindings,
  novels,
  interrupt,
  diagnostics,
  productionStatus,
  novelSetup,
  latestTurnSummary,
  currentCheckpointId,
  modelSummary,
  defaultRuntimeDetailsCollapsed,
  onToggleRuntimeDetailsDefault,
  onNovelChange,
  onQuickAction,
  onCreateNovel,
  onStartProduction,
}: CreativeHubSidebarProps) {
  const [novelTitleDraft, setNovelTitleDraft] = useState("");
  const currentNovelTitle = novels.find((item) => item.id === bindings.novelId)?.title ?? null;
  const blocker = useMemo(
    () => buildBlockerCardData({
      interrupt,
      diagnostics,
      productionStatus,
      latestTurnSummary,
    }),
    [diagnostics, interrupt, latestTurnSummary, productionStatus],
  );
  const completedAssets = productionStatus?.assetStages.filter((item) => item.status === "completed").length ?? 0;
  const activeStage = latestTurnSummary?.currentStage
    ?? productionStatus?.currentStage
    ?? (novelSetup?.stage === "ready_for_production"
      ? t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_741e41f5")
      : novelSetup?.stage === "ready_for_planning"
        ? t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_7a5a716d")
        : novelSetup?.stage === "setup_in_progress"
          ? t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_06f8bd5d")
          : t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_dd4e55c3"));
  const latestRunId = latestTurnSummary?.runId ?? thread?.latestRunId ?? null;
  const blockerActionPrompt = blocker.actionPrompt ?? "";

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_544f95db")}</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 text-sm">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_49f9d850")}</div>
              <div className="mt-2 text-base font-semibold text-slate-900">
                {thread?.title?.trim() || t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_3f9cf1c7")}
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-700">
                {summarizeFocus(latestTurnSummary, productionStatus, novelSetup)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{activeStage}</Badge>
              <Badge variant={statusVariant(thread?.status)}>{threadStatusLabel(thread?.status)}</Badge>
              {latestTurnSummary ? (
                <Badge variant={statusVariant(latestTurnSummary.status)}>
                  {turnStatusLabel(latestTurnSummary.status)}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 text-xs font-medium text-slate-500">{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_1b5c241d")}</div>
          <div className="space-y-3 text-xs text-slate-700">
            <div className="space-y-1">
              <div className="text-[11px] font-medium text-slate-500">{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_ecb24d41")}</div>
              <SelectControl
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-700"
                value={bindings.novelId ?? ""}
                onChange={(event) => onNovelChange(event.target.value)}
              >
                <option value="">{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_24353ccc")}</option>
                {novels.map((novel) => (
                  <option key={novel.id} value={novel.id}>
                    {novel.title}
                  </option>
                ))}
              </SelectControl>
              {!bindings.novelId ? (
                <div className="mt-2 space-y-2 rounded-lg border border-dashed border-slate-200 bg-white p-2">
                  <input
                    className="w-full rounded-md border border-slate-300 bg-slate-50 px-2 py-2 text-xs text-slate-700 outline-none focus:border-slate-400 focus:bg-white"
                    value={novelTitleDraft}
                    onChange={(event) => setNovelTitleDraft(event.target.value)}
                    placeholder={t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_06199b0d")}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onQuickAction?.(t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_21ac4620"))}
                    >
                      查看小说
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        const title = novelTitleDraft.trim();
                        if (!title) {
                          return;
                        }
                        onCreateNovel?.(title);
                        setNovelTitleDraft("");
                      }}
                    >
                      创建并接入
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_ca327234")}</div>
              <div>{t("gen.pages.creativeHub.components.CreativeHubSidebar.worldViewBindingValue")}</div>
              <div>{t("gen.pages.creativeHub.components.CreativeHubSidebar.taskBindingValue")}</div>
              <div>{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_71f59f81")}</div>
              <div>{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_263b7ef3")}</div>
              <div>{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_10929f5d")}</div>
            </div>
            <div>{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_ce7c6588")}</div>
          </div>
        </div>

        {novelSetup ? (
          <CreativeHubNovelSetupCard setup={novelSetup} onQuickAction={onQuickAction} />
        ) : null}

        {novelSetup?.stage === "setup_in_progress" || novelSetup?.stage === "ready_for_planning" ? null : (
          <NovelProductionStarterCard
            currentNovelId={bindings.novelId ?? null}
            currentNovelTitle={currentNovelTitle}
            productionStatus={productionStatus}
            onQuickAction={onQuickAction}
            onSubmit={(prompt) => onStartProduction?.(prompt)}
          />
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-slate-500">{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_465a1081")}</div>
            <Badge variant="outline">{activeStage}</Badge>
          </div>
          {latestTurnSummary ? (
            <div className="space-y-3 text-sm text-slate-700">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_f0c1cdce")}</div>
                <div className="mt-2 leading-6 text-slate-800">{latestTurnSummary.actionSummary}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_ef5d1a7d")}</div>
                <div className="mt-2 leading-6 text-slate-800">{latestTurnSummary.impactSummary}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_fdf768b1")}</div>
                <div className="mt-2 leading-6 text-slate-800">{latestTurnSummary.nextSuggestion}</div>
                {latestTurnSummary.nextSuggestion.trim() ? (
                  <div className="mt-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onQuickAction?.(latestTurnSummary.nextSuggestion)}
                    >
                      按建议继续
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              当前线程还没有完成的回合摘要。发起一次创作请求后，这里会显示本轮推进和下一步建议。
            </div>
          )}
        </div>

        <div className={cn("rounded-2xl border p-3", blocker.tone)}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-medium">{blocker.title}</div>
            {interrupt ? <Badge variant="secondary">{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_ec4f36de")}</Badge> : null}
          </div>
          <div className="text-sm leading-6">{blocker.summary}</div>
          {blocker.details.length > 0 ? (
            <div className="mt-3 space-y-2 text-xs">
              {blocker.details.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          ) : null}
          {blocker.actionLabel && blockerActionPrompt ? (
            <div className="mt-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-current bg-white/80"
                onClick={() => onQuickAction?.(blockerActionPrompt)}
              >
                {blocker.actionLabel}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="mb-3 text-xs font-medium text-slate-500">{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_9ae9c15f")}</div>
          {productionStatus ? (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_ea328dc7")}</div>
                  <div className="mt-2 text-sm font-medium text-slate-900">{productionStatus.currentStage}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_9c8e364e")}</div>
                  <div className="mt-2 text-sm font-medium text-slate-900">
                    {productionStatus.chapterCount}/{productionStatus.targetChapterCount}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_ef46403c")}</div>
                  <div className="mt-2 text-sm font-medium text-slate-900">
                    {completedAssets}/{productionStatus.assetStages.length}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_fbe15c40")}</div>
                  <div className="mt-2 text-sm font-medium text-slate-900">
                    {productionStatus.pipelineStatus ?? t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_f4baf7c6")}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {productionStatus.assetStages.map((item) => (
                  <span
                    key={item.key}
                    className={cn("rounded-full border px-2 py-1 text-[11px]", metricTone(item.status))}
                  >
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
              当前线程还没有整本生产状态。选择一本小说并发起整本创作后，这里会显示阶段与进度。
            </div>
          )}
        </div>

        <details className="rounded-2xl border border-slate-200 bg-white p-3">
          <summary className="cursor-pointer list-none text-xs font-medium text-slate-500">
            调试信息
          </summary>
          <div className="mt-3 space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                运行细节显示
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-slate-700">
                <span>
                  当前默认
                  {defaultRuntimeDetailsCollapsed ? t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_e082621c") : t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_e2edde5a")}
                  消息内的运行细节
                </span>
                <Button type="button" size="sm" variant="outline" onClick={onToggleRuntimeDetailsDefault}>
                  切换为{defaultRuntimeDetailsCollapsed ? t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_205cb6cc") : t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_2678ac32")}
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_2db7d11c")}</div>
              <DebugRow label={t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_208f3f9e")} value={thread?.id ?? "-"} />
              <DebugRow label={t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_2db7d11c")} value={threadStatusLabel(thread?.status)} />
              <DebugRow label={t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_a3b12d4f")} value={latestRunId ?? "-"} />
              <DebugRow label={t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_cfd04e1e")} value={currentCheckpointId ?? "-"} />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_0361f422")}</div>
              <DebugRow label="Provider" value={modelSummary.provider} />
              <DebugRow label="Model" value={modelSummary.model} />
              <DebugRow label="Temperature" value={String(modelSummary.temperature)} />
              <DebugRow label="Max tokens" value={modelSummary.maxTokens != null ? String(modelSummary.maxTokens) : t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_18c63459")} />
            </div>

            {latestTurnSummary ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">{t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_01110358")}</div>
                <DebugRow label={t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_6a71551f")} value={turnStatusLabel(latestTurnSummary.status)} />
                <DebugRow label={t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_73e797e6")} value={latestTurnSummary.currentStage} />
                <DebugRow label={t("gen.pages.creativeHub.components.CreativeHubSidebar.gen_52952d2c")} value={latestTurnSummary.checkpointId ?? "-"} />
              </div>
            ) : null}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
