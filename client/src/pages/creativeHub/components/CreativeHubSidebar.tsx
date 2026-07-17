import { useEffect, useMemo, useRef, useState } from "react";
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
import { toast } from "@/components/ui/toast";
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
  actionDisabled?: boolean;
  novelsLoading?: boolean;
  novelsErrorMessage?: string;
  novelsRetrying?: boolean;
  onToggleRuntimeDetailsDefault: () => void;
  onRetryNovels?: () => void;
  onNovelChange: (novelId: string) => void | Promise<void>;
  onQuickAction?: (prompt: string) => void;
  onCreateNovel?: (title: string) => void | Promise<void>;
  onStartProduction?: (prompt: string) => void | Promise<void>;
}

function bindingStatusLabel(value: string | null | undefined): string {
  return value?.trim() ? "已绑定" : "未绑定";
}

function pipelineStatusLabel(status: string | null | undefined): string {
  if (status === "queued") return "等待执行";
  if (status === "running") return "执行中";
  if (status === "succeeded") return "已完成";
  if (status === "failed") return "执行失败";
  if (status === "cancelled") return "已取消";
  return "未启动";
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

function metricTone(status: "pending" | "completed" | "running" | "blocked"): string {
  switch (status) {
    case "completed":
      return "border-success/30 bg-success/5 text-success";
    case "running":
      return "border-info/30 bg-info/5 text-info";
    case "blocked":
      return "border-warning/30 bg-warning/5 text-warning";
    default:
      return "border-border bg-muted/30 text-muted-foreground";
  }
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
      ].filter(Boolean),
      tone: "border-warning/30 bg-warning/5 text-foreground",
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
      tone: "border-destructive/30 bg-destructive/5 text-foreground",
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
      tone: "border-destructive/30 bg-destructive/5 text-foreground",
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
      tone: "border-info/30 bg-info/5 text-foreground",
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
    tone: "border-border bg-muted/20 text-foreground",
    actionLabel: input.latestTurnSummary?.nextSuggestion ? "按建议继续" : undefined,
    actionPrompt: input.latestTurnSummary?.nextSuggestion,
  };
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
      <span>{label}</span>
      <span className="max-w-[60%] break-all text-right text-foreground">{value}</span>
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
  actionDisabled = false,
  novelsLoading = false,
  novelsErrorMessage = "",
  novelsRetrying = false,
  onToggleRuntimeDetailsDefault,
  onRetryNovels,
  onNovelChange,
  onQuickAction,
  onCreateNovel,
  onStartProduction,
}: CreativeHubSidebarProps) {
  const [novelTitleDraft, setNovelTitleDraft] = useState("");
  const [isBindingNovel, setIsBindingNovel] = useState(false);
  const [isCreatingNovel, setIsCreatingNovel] = useState(false);
  const creatingNovelInFlightRef = useRef(false);
  const selectedNovel = novels.find((item) => item.id === bindings.novelId);
  const currentNovelTitle = selectedNovel?.title
    ?? productionStatus?.title
    ?? novelSetup?.title
    ?? null;
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
  const latestRunId = latestTurnSummary?.runId ?? thread?.latestRunId ?? null;
  const blockerActionPrompt = blocker.actionPrompt ?? "";
  const resourceActionDisabled = actionDisabled || isBindingNovel || isCreatingNovel;

  useEffect(() => {
    setNovelTitleDraft("");
  }, [thread?.id]);

  return (
    <Card
      className="flex h-full min-h-0 flex-col rounded-lg shadow-none"
      aria-busy={isBindingNovel || isCreatingNovel || novelsRetrying}
    >
      <CardHeader className="pb-4">
        <CardTitle className="text-base">当前小说与状态</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 text-sm">
        <div className="rounded-md border border-border bg-muted/20 p-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">当前小说与资源</div>
          <div className="space-y-3 text-xs text-muted-foreground">
            <div className="space-y-1">
              <label htmlFor="creative-hub-novel" className="text-xs font-medium text-muted-foreground">当前小说</label>
              <SelectControl
                id="creative-hub-novel"
                className="w-full rounded-md border border-input bg-background p-2 text-base text-foreground disabled:cursor-not-allowed disabled:opacity-60 md:text-sm"
                value={bindings.novelId ?? ""}
                disabled={resourceActionDisabled || novelsLoading || Boolean(novelsErrorMessage)}
                onChange={(event) => {
                  const novelId = event.target.value;
                  setIsBindingNovel(true);
                  void Promise.resolve(onNovelChange(novelId))
                    .catch((error: unknown) => {
                      toast.error(error instanceof Error ? error.message : "小说工作区切换失败，请重试。");
                    })
                    .finally(() => setIsBindingNovel(false));
                }}
              >
                <option value="">未绑定小说</option>
                {bindings.novelId && !selectedNovel ? (
                  <option value={bindings.novelId}>{currentNovelTitle ?? "当前已绑定小说"}</option>
                ) : null}
                {novels.map((novel) => (
                  <option key={novel.id} value={novel.id}>
                    {novel.title}
                  </option>
                ))}
              </SelectControl>
              {novelsLoading ? (
                <div className="text-xs leading-5 text-muted-foreground" role="status">
                  正在读取可用小说，完成前不能切换工作区。
                </div>
              ) : novelsErrorMessage ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs leading-5 text-foreground">
                  <div>小说列表读取失败，现有线程不会受影响。</div>
                  {onRetryNovels ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={novelsRetrying}
                      onClick={onRetryNovels}
                    >
                      {novelsRetrying ? "正在重新读取..." : "重新读取小说"}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {!bindings.novelId ? (
                <div className="mt-2 space-y-2 rounded-md border border-dashed border-border bg-background p-2">
                  <label htmlFor="creative-hub-new-novel" className="text-xs font-medium text-muted-foreground">新小说标题</label>
                  <input
                    id="creative-hub-new-novel"
                    className="w-full rounded-md border border-input bg-muted/20 px-2 py-2 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 md:text-sm"
                    value={novelTitleDraft}
                    disabled={resourceActionDisabled}
                    onChange={(event) => setNovelTitleDraft(event.target.value)}
                    placeholder="输入新小说标题"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={resourceActionDisabled}
                      onClick={() => onQuickAction?.("列出当前可用的小说工作区")}
                    >
                      查看小说
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={resourceActionDisabled || !novelTitleDraft.trim()}
                      onClick={async () => {
                        if (creatingNovelInFlightRef.current) {
                          return;
                        }
                        const title = novelTitleDraft.trim();
                        if (!title) {
                          return;
                        }
                        creatingNovelInFlightRef.current = true;
                        setIsCreatingNovel(true);
                        try {
                          await onCreateNovel?.(title);
                          setNovelTitleDraft("");
                        } catch (error) {
                          toast.error(error instanceof Error ? error.message : "小说创建失败，请重试。");
                        } finally {
                          creatingNovelInFlightRef.current = false;
                          setIsCreatingNovel(false);
                        }
                      }}
                    >
                      {isCreatingNovel ? "正在创建..." : "创建并接入"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>章节: {bindingStatusLabel(bindings.chapterId)}</div>
              <div>世界观: {bindingStatusLabel(bindings.worldId)}</div>
              <div>任务: {bindingStatusLabel(bindings.taskId)}</div>
              <div>拆书分析: {bindingStatusLabel(bindings.bookAnalysisId)}</div>
              <div>写作公式: {bindingStatusLabel(bindings.formulaId)}</div>
              <div>基础角色: {bindingStatusLabel(bindings.baseCharacterId)}</div>
            </div>
            <div>知识文档: {bindings.knowledgeDocumentIds?.length ?? 0} 份</div>
          </div>
        </div>

        {novelSetup ? (
          <details className="rounded-md border border-border bg-background p-3">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">开书准备</summary>
            <div className="mt-3">
              <CreativeHubNovelSetupCard
                setup={novelSetup}
                actionDisabled={actionDisabled}
                onQuickAction={onQuickAction}
              />
            </div>
          </details>
        ) : null}

        {novelSetup?.stage === "setup_in_progress" || novelSetup?.stage === "ready_for_planning" ? null : (
          <details className="rounded-md border border-border bg-background p-3">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">整本生产设置</summary>
            <div className="mt-3">
              <NovelProductionStarterCard
                key={bindings.novelId ?? "new-novel"}
                currentNovelId={bindings.novelId ?? null}
                currentNovelTitle={currentNovelTitle}
                productionStatus={productionStatus}
                actionDisabled={actionDisabled}
                onQuickAction={onQuickAction}
                onSubmit={(prompt) => onStartProduction?.(prompt)}
              />
            </div>
          </details>
        )}

        <div className={cn("rounded-md border p-3", blocker.tone)}>
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
                className="border-current bg-background/80"
                disabled={actionDisabled}
                onClick={() => onQuickAction?.(blockerActionPrompt)}
              >
                {blocker.actionLabel}
              </Button>
            </div>
          ) : null}
        </div>

        <div className="rounded-md border border-border bg-background p-3">
          <div className="mb-3 text-xs font-medium text-muted-foreground">创作阶段</div>
          {productionStatus ? (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">当前阶段</div>
                  <div className="mt-2 text-sm font-medium text-foreground">{productionStatus.currentStage}</div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">章节进度</div>
                  <div className="mt-2 text-sm font-medium text-foreground">
                    {productionStatus.chapterCount}/{productionStatus.targetChapterCount}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">资产完成</div>
                  <div className="mt-2 text-sm font-medium text-foreground">
                    {completedAssets}/{productionStatus.assetStages.length}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <div className="text-xs text-muted-foreground">生产流水线</div>
                  <div className="mt-2 text-sm font-medium text-foreground">
                    {pipelineStatusLabel(productionStatus.pipelineStatus)}
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
            <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
              选择小说并发起整本创作后，这里会显示阶段与进度。
            </div>
          )}
        </div>

        <details className="rounded-md border border-border bg-background p-3">
          <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground">
            运行与调试信息
          </summary>
          <div className="mt-3 space-y-3">
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                运行细节显示
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
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

            <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
              <div className="text-xs font-medium text-muted-foreground">线程状态</div>
              <DebugRow label="线程 ID" value={thread?.id ?? "-"} />
              <DebugRow label="线程状态" value={threadStatusLabel(thread?.status)} />
              <DebugRow label="最新 Run" value={latestRunId ?? "-"} />
              <DebugRow label="当前 Checkpoint" value={currentCheckpointId ?? "-"} />
            </div>

            <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
              <div className="text-xs font-medium text-muted-foreground">资源绑定 ID</div>
              <DebugRow label="小说" value={bindings.novelId ?? "-"} />
              <DebugRow label="章节" value={bindings.chapterId ?? "-"} />
              <DebugRow label="世界观" value={bindings.worldId ?? "-"} />
              <DebugRow label="任务" value={bindings.taskId ?? "-"} />
              <DebugRow label="拆书分析" value={bindings.bookAnalysisId ?? "-"} />
              <DebugRow label="写作公式" value={bindings.formulaId ?? "-"} />
              <DebugRow label="写法档案" value={bindings.styleProfileId ?? "-"} />
              <DebugRow label="基础角色" value={bindings.baseCharacterId ?? "-"} />
              <DebugRow label="知识文档" value={bindings.knowledgeDocumentIds?.join(", ") || "-"} />
              {interrupt ? <DebugRow label="待确认目标" value={interrupt.targetId ?? "-"} /> : null}
            </div>

            <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
              <div className="text-xs font-medium text-muted-foreground">模型路由</div>
              <DebugRow label="Provider" value={modelSummary.provider} />
              <DebugRow label="Model" value={modelSummary.model} />
              <DebugRow label="Temperature" value={String(modelSummary.temperature)} />
              <DebugRow label="Max tokens" value={modelSummary.maxTokens != null ? String(modelSummary.maxTokens) : "默认"} />
            </div>

            {latestTurnSummary ? (
              <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
                <div className="text-xs font-medium text-muted-foreground">最近回合</div>
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
