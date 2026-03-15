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
    maxTokens: number;
  };
  defaultRuntimeDetailsCollapsed: boolean;
  onToggleRuntimeDetailsDefault: () => void;
  onNovelChange: (novelId: string) => void;
  onQuickAction?: (prompt: string) => void;
  onCreateNovel?: (title: string) => void;
  onStartProduction?: (prompt: string) => void;
}

function bindingValue(value: string | null | undefined): string {
  return value?.trim() || "未绑定";
}

function turnStatusLabel(status: CreativeHubTurnSummary["status"]): string {
  switch (status) {
    case "succeeded":
      return "已完成";
    case "interrupted":
      return "待确认";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
    case "running":
      return "进行中";
    default:
      return status;
  }
}

function threadStatusLabel(status: CreativeHubThread["status"] | undefined): string {
  switch (status) {
    case "busy":
      return "执行中";
    case "interrupted":
      return "待处理";
    case "error":
      return "异常";
    case "idle":
      return "空闲";
    default:
      return "未初始化";
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
  return "绑定作品或直接发起一个创作目标后，中枢会围绕当前线程持续推进。";
}

function buildBlockerCardData(input: {
  interrupt?: CreativeHubInterrupt;
  diagnostics?: FailureDiagnostic;
  productionStatus?: CreativeHubProductionStatus | null;
  latestTurnSummary?: CreativeHubTurnSummary | null;
}) {
  if (input.interrupt) {
    return {
      title: "当前阻塞",
      summary: input.interrupt.summary,
      details: [
        `等待确认: ${input.interrupt.title}`,
        input.interrupt.targetType ? `目标类型: ${input.interrupt.targetType}` : "",
        input.interrupt.targetId ? `目标对象: ${input.interrupt.targetId}` : "",
      ].filter(Boolean),
      tone: "border-amber-200 bg-amber-50 text-amber-900",
      actionLabel: "查看待确认项",
      actionPrompt: "总结当前待确认的创作决策，并说明推荐处理方式",
    };
  }

  if (input.diagnostics?.failureSummary) {
    return {
      title: "当前风险",
      summary: input.diagnostics.failureSummary,
      details: [
        input.diagnostics.failureCode ? `错误码: ${input.diagnostics.failureCode}` : "",
        input.diagnostics.recoveryHint ? `恢复建议: ${input.diagnostics.recoveryHint}` : "",
      ].filter(Boolean),
      tone: "border-rose-200 bg-rose-50 text-rose-900",
      actionLabel: "生成恢复方案",
      actionPrompt: input.diagnostics.recoveryHint || "分析当前失败原因并给出恢复步骤",
    };
  }

  if (input.productionStatus?.failureSummary) {
    return {
      title: "当前阻塞",
      summary: input.productionStatus.failureSummary,
      details: [
        input.productionStatus.recoveryHint ? `恢复建议: ${input.productionStatus.recoveryHint}` : "",
        `当前阶段: ${input.productionStatus.currentStage}`,
      ].filter(Boolean),
      tone: "border-orange-200 bg-orange-50 text-orange-900",
      actionLabel: "处理当前阻塞",
      actionPrompt: input.productionStatus.recoveryHint || "分析当前生产阻塞并继续推进",
    };
  }

  if (input.latestTurnSummary?.status === "interrupted") {
    return {
      title: "当前关注点",
      summary: input.latestTurnSummary.nextSuggestion,
      details: [
        `阶段: ${input.latestTurnSummary.currentStage}`,
        `状态: ${turnStatusLabel(input.latestTurnSummary.status)}`,
      ],
      tone: "border-sky-200 bg-sky-50 text-sky-900",
      actionLabel: "按建议继续",
      actionPrompt: input.latestTurnSummary.nextSuggestion,
    };
  }

  return {
    title: "当前状态",
    summary: "当前没有需要立即处理的阻塞项，可以继续推进创作。",
    details: input.latestTurnSummary?.nextSuggestion
      ? [`建议下一步: ${input.latestTurnSummary.nextSuggestion}`]
      : [],
    tone: "border-slate-200 bg-slate-50 text-slate-800",
    actionLabel: input.latestTurnSummary?.nextSuggestion ? "按建议继续" : undefined,
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
      ? "初始化完成"
      : novelSetup?.stage === "ready_for_planning"
        ? "初始化待规划"
        : novelSetup?.stage === "setup_in_progress"
          ? "初始化中"
          : "未开始");
  const latestRunId = latestTurnSummary?.runId ?? thread?.latestRunId ?? null;
  const blockerActionPrompt = blocker.actionPrompt ?? "";

  return (
    <Card className="flex h-full min-h-0 flex-col">
      <CardHeader className="pb-4">
        <CardTitle className="text-base">创作工作区</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 text-sm">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">当前焦点</div>
              <div className="mt-2 text-base font-semibold text-slate-900">
                {thread?.title?.trim() || "未命名线程"}
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
          <div className="mb-2 text-xs font-medium text-slate-500">资源绑定</div>
          <div className="space-y-3 text-xs text-slate-700">
            <div className="space-y-1">
              <div className="text-[11px] font-medium text-slate-500">当前小说</div>
              <select
                className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs text-slate-700"
                value={bindings.novelId ?? ""}
                onChange={(event) => onNovelChange(event.target.value)}
              >
                <option value="">未绑定小说</option>
                {novels.map((novel) => (
                  <option key={novel.id} value={novel.id}>
                    {novel.title}
                  </option>
                ))}
              </select>
              {!bindings.novelId ? (
                <div className="mt-2 space-y-2 rounded-lg border border-dashed border-slate-200 bg-white p-2">
                  <input
                    className="w-full rounded-md border border-slate-300 bg-slate-50 px-2 py-2 text-xs text-slate-700 outline-none focus:border-slate-400 focus:bg-white"
                    value={novelTitleDraft}
                    onChange={(event) => setNovelTitleDraft(event.target.value)}
                    placeholder="输入新小说标题"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onQuickAction?.("列出当前可用的小说工作区")}
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
              <div>章节: {bindingValue(bindings.chapterId)}</div>
              <div>世界观: {bindingValue(bindings.worldId)}</div>
              <div>任务: {bindingValue(bindings.taskId)}</div>
              <div>拆书分析: {bindingValue(bindings.bookAnalysisId)}</div>
              <div>写作公式: {bindingValue(bindings.formulaId)}</div>
              <div>基础角色: {bindingValue(bindings.baseCharacterId)}</div>
            </div>
            <div>知识文档: {bindings.knowledgeDocumentIds?.length ?? 0} 份</div>
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
            <div className="text-xs font-medium text-slate-500">当前推进</div>
            <Badge variant="outline">{activeStage}</Badge>
          </div>
          {latestTurnSummary ? (
            <div className="space-y-3 text-sm text-slate-700">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">已执行动作</div>
                <div className="mt-2 leading-6 text-slate-800">{latestTurnSummary.actionSummary}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">影响与变化</div>
                <div className="mt-2 leading-6 text-slate-800">{latestTurnSummary.impactSummary}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">建议下一步</div>
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
            {interrupt ? <Badge variant="secondary">需要确认</Badge> : null}
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
          <div className="mb-3 text-xs font-medium text-slate-500">创作阶段</div>
          {productionStatus ? (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">当前阶段</div>
                  <div className="mt-2 text-sm font-medium text-slate-900">{productionStatus.currentStage}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">章节进度</div>
                  <div className="mt-2 text-sm font-medium text-slate-900">
                    {productionStatus.chapterCount}/{productionStatus.targetChapterCount}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">资产完成</div>
                  <div className="mt-2 text-sm font-medium text-slate-900">
                    {completedAssets}/{productionStatus.assetStages.length}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">生产流水线</div>
                  <div className="mt-2 text-sm font-medium text-slate-900">
                    {productionStatus.pipelineStatus ?? "未启动"}
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
                  {defaultRuntimeDetailsCollapsed ? "折叠" : "展开"}
                  消息内的运行细节
                </span>
                <Button type="button" size="sm" variant="outline" onClick={onToggleRuntimeDetailsDefault}>
                  切换为{defaultRuntimeDetailsCollapsed ? "默认展开" : "默认折叠"}
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">线程状态</div>
              <DebugRow label="线程 ID" value={thread?.id ?? "-"} />
              <DebugRow label="线程状态" value={threadStatusLabel(thread?.status)} />
              <DebugRow label="最新 Run" value={latestRunId ?? "-"} />
              <DebugRow label="当前 Checkpoint" value={currentCheckpointId ?? "-"} />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">模型路由</div>
              <DebugRow label="Provider" value={modelSummary.provider} />
              <DebugRow label="Model" value={modelSummary.model} />
              <DebugRow label="Temperature" value={String(modelSummary.temperature)} />
              <DebugRow label="Max tokens" value={String(modelSummary.maxTokens)} />
            </div>

            {latestTurnSummary ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">最近回合</div>
                <DebugRow label="回合状态" value={turnStatusLabel(latestTurnSummary.status)} />
                <DebugRow label="回合阶段" value={latestTurnSummary.currentStage} />
                <DebugRow label="摘要 Checkpoint" value={latestTurnSummary.checkpointId ?? "-"} />
              </div>
            ) : null}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
