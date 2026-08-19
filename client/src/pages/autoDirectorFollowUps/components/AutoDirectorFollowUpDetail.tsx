import i18next from "i18next";
import type {
  AutoDirectorAction,
  AutoDirectorFollowUpDetail,
  AutoDirectorFollowUpItem,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import { Button } from "@/components/ui/button";
import {
  TaskQueueActionRow,
  TaskQueueImpactNotice,
  TaskQueueSection,
  TaskQueueStatusBadge,
} from "@/components/taskQueue";
import { WorkspaceStateNotice } from "@/components/workspace";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";
import {
  getFollowUpActionConsequence,
  getFollowUpActionRiskDescription,
  getFollowUpActionTone,
  getFollowUpLevelLabel,
  getFollowUpPriorityLabel,
  getFollowUpSeverity,
  getFollowUpTone,
} from "../followUpPresentation";

interface AutoDirectorFollowUpDetailPanelProps {
  detail: AutoDirectorFollowUpDetail | null;
  selectedItem: AutoDirectorFollowUpItem | null;
  loading: boolean;
  errorMessage?: string | null;
  actionLoading: boolean;
  onExecuteAction: (item: AutoDirectorFollowUpItem, action: AutoDirectorAction) => void | Promise<void>;
  onRefreshValidation: () => void | Promise<void>;
  onSafeFix: () => void | Promise<void>;
  onRetry: () => void | Promise<void>;
}

export function AutoDirectorFollowUpDetailPanel({
  detail,
  selectedItem,
  loading,
  errorMessage,
  actionLoading,
  onExecuteAction,
  onRefreshValidation,
  onSafeFix,
  onRetry,
}: AutoDirectorFollowUpDetailPanelProps) {
  const deliveryStatusLabels = {
    delivered: i18next.t("dict.gen_f87f48f2"),
    pending: i18next.t("dict.gen_cc59b89d"),
    failed: i18next.t("dict.gen_eed9797b"),
  } as const;
  const eventTypeLabels = {
    "auto_director.approval_required": "需要处理",
    "auto_director.auto_approved": "AI 已自动通过",
    "auto_director.exception": "任务异常",
    "auto_director.recovered": "已恢复",
    "auto_director.completed": "已完成",
    "auto_director.progress_changed": "进度变化",
  } as const;
  const tone = selectedItem ? getFollowUpTone(selectedItem) : "neutral";

  return (
    <TaskQueueSection
      title={i18next.t("dict.gen_e8146ae5")}
      description={i18next.t("autoDirectorFollowUps.autoDirectorFollowUpDetail.nun2xt")}
      className="min-w-0 overflow-hidden"
    >
      <div className="space-y-4">
        {loading ? (
          <WorkspaceStateNotice loading title={i18next.t("autoDirectorFollowUps.autoDirectorFollowUpDetail.wr7k9x")} description={i18next.t("autoDirectorFollowUps.autoDirectorFollowUpDetail.3aj1og")} />
        ) : null}

        {errorMessage ? (
          <WorkspaceStateNotice
            tone="danger"
            title={i18next.t("autoDirectorFollowUps.autoDirectorFollowUpDetail.mvab92")}
            description={errorMessage}
            action={<Button size="sm" variant="outline" onClick={() => void onRetry()}>{i18next.t("autoDirectorFollowUps.autoDirectorFollowUpCenterPage.itle66")}</Button>}
          />
        ) : null}

        {!loading && !errorMessage && (!detail || !selectedItem) ? (
          <WorkspaceStateNotice title={i18next.t("autoDirectorFollowUps.autoDirectorFollowUpDetail.c91wfw")} description={i18next.t("autoDirectorFollowUps.autoDirectorFollowUpDetail.rrl6i5")} />
        ) : null}

        {detail && selectedItem ? (
          <>
            <div className="space-y-1">
              <div className={`${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText} font-medium`}>{selectedItem.novelTitle}</div>
              <div className={`${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText} text-sm text-muted-foreground`}>{selectedItem.reasonLabel}</div>
              <div className="flex flex-wrap gap-2 pt-2">
                <TaskQueueStatusBadge label={getFollowUpLevelLabel(selectedItem)} tone={tone} />
                <TaskQueueStatusBadge label={getFollowUpPriorityLabel(selectedItem.priority, selectedItem.reason)} tone={tone} />
              </div>
            </div>

            <TaskQueueImpactNotice
              severity={getFollowUpSeverity(selectedItem)}
              title={getFollowUpLevelLabel(selectedItem)}
              description={detail.blockingReason ?? detail.followUpSummary}
            />

            {detail.riskNote ? (
              <WorkspaceStateNotice
                compact
                tone={tone === "danger" ? "danger" : tone === "warning" ? "warning" : "info"}
                title={i18next.t("autoDirectorFollowUps.autoDirectorFollowUpDetail.jwj9yt")}
                description={detail.riskNote}
              />
            ) : null}

            <div className={`grid gap-2 text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              <div>下一步建议：{detail.nextStepSuggestion ?? "查看任务详情后再继续。"}</div>
              <div>检查点摘要：{detail.checkpointSummary ?? "暂无"}</div>
              <div>当前模型：{detail.currentModel ?? "暂无"}</div>
            </div>

            {selectedItem.section === "needs_validation" ? (
              <div className={`space-y-3 rounded-md border border-warning/25 bg-warning/5 p-3 text-sm text-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div>
                    <div className="font-medium">{i18next.t("dict.gen_f1f37123")}</div>
                    <div className="mt-1 text-xs">{i18next.t("autoDirectorFollowUps.autoDirectorFollowUpDetail.j8b16u")}</div>
                  </div>
                </div>
                {(detail.validationSummary?.blockingReasons.length ?? 0) > 0 ? (
                  <div className="space-y-1 text-xs">
                    {detail.validationSummary?.blockingReasons.map((reason) => (
                      <div key={reason}>阻塞：{reason}</div>
                    ))}
                  </div>
                ) : null}
                {(detail.validationSummary?.warnings.length ?? 0) > 0 ? (
                  <div className="space-y-1 text-xs">
                    {detail.validationSummary?.warnings.map((warning) => (
                      <div key={warning}>提示：{warning}</div>
                    ))}
                  </div>
                ) : null}
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}
                    disabled={actionLoading}
                    onClick={() => void onRefreshValidation()}
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />{i18next.t("autoDirectorFollowUps.autoDirectorFollowUpDetail.tyfy4k")}</Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionLoading}
                    className={`${AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction} border-warning/40 bg-warning/10 text-warning hover:bg-warning/15 hover:text-warning`}
                    title={i18next.t("dict.onlyFixLowRiskItems")}
                    onClick={() => void onSafeFix()}
                  >
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />{i18next.t("autoDirectorFollowUps.autoDirectorFollowUpDetail.y56b0s")}</Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="text-sm font-medium">{i18next.t("dict.gen_bdd966d4")}</div>
              {detail.availableActions.map((action) => (
                <TaskQueueActionRow
                  key={action.code}
                  title={action.label}
                  consequence={i18next.t("autoDirectorFollowUps.autoDirectorFollowUpDetail.wqc63k", { val1: getFollowUpActionConsequence(action), val2: getFollowUpActionRiskDescription(action) })}
                  tone={getFollowUpActionTone(action)}
                  action={(
                    <Button
                      variant={action.kind === "mutation" && action.riskLevel === "low" ? "default" : "outline"}
                      size="sm"
                      className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}
                      disabled={actionLoading}
                      onClick={() => void onExecuteAction(selectedItem, action)}
                    >
                      {action.label}
                    </Button>
                  )}
                />
              ))}
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">{i18next.t("dict.gen_0fcd32a9")}</div>
              <div className="space-y-2">
                {detail.milestones.length === 0 ? (
                  <div className="text-sm text-muted-foreground">{i18next.t("dict.gen_c6e96697")}</div>
                ) : detail.milestones.map((milestone) => (
                  <div key={`${milestone.at}:${milestone.label}`} className={`rounded-md border p-3 text-sm ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                    <div className="font-medium">{milestone.label}</div>
                    <div className="text-xs text-muted-foreground">{new Date(milestone.at).toLocaleString()}</div>
                    {milestone.summary ? (
                      <div className="mt-1 text-xs text-muted-foreground">{milestone.summary}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">{i18next.t("dict.gen_cb36d263")}</div>
              <div className="space-y-2">
                {(detail.channelDeliveries?.length ?? 0) === 0 ? (
                  <div className="text-sm text-muted-foreground">{i18next.t("dict.gen_ede22761")}</div>
                ) : detail.channelDeliveries?.map((delivery) => (
                  <div key={`${delivery.channelType}:${delivery.eventType}`} className={`rounded-md border p-3 text-sm ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <TaskQueueStatusBadge label={delivery.channelType === "dingtalk" ? "钉钉" : "企微"} tone="neutral" />
                      <TaskQueueStatusBadge
                        label={deliveryStatusLabels[delivery.status]}
                        tone={delivery.status === "delivered" ? "success" : delivery.status === "failed" ? "danger" : "info"}
                      />
                      <span className="text-xs text-muted-foreground">{eventTypeLabels[delivery.eventType]}</span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      目标：{delivery.target ?? "未记录"} | 响应码：{delivery.responseStatus ?? "未记录"} | 时间：{delivery.deliveredAt ? new Date(delivery.deliveredAt).toLocaleString() : "未送达"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </TaskQueueSection>
  );
}
