import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type {
  AutoDirectorAction,
  AutoDirectorFollowUpDetail,
  AutoDirectorFollowUpItem,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

interface AutoDirectorFollowUpDetailPanelProps {
  detail: AutoDirectorFollowUpDetail | null;
  selectedItem: AutoDirectorFollowUpItem | null;
  loading: boolean;
  actionLoading: boolean;
  onExecuteAction: (item: AutoDirectorFollowUpItem, action: AutoDirectorAction) => void | Promise<void>;
  onRefreshValidation: () => void | Promise<void>;
  onSafeFix: () => void | Promise<void>;
}

export function AutoDirectorFollowUpDetailPanel({
  detail,
  selectedItem,
  loading,
  actionLoading,
  onExecuteAction,
  onRefreshValidation,
  onSafeFix,
}: AutoDirectorFollowUpDetailPanelProps) {
  const deliveryStatusLabels = {
    delivered: t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_f87f48f2"),
    pending: t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_cc59b89d"),
    failed: t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_eed9797b"),
  } as const;
  const eventTypeLabels = {
    "auto_director.approval_required": t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_54dc8247"),
    "auto_director.auto_approved": t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.aiAutoPassed"),
    "auto_director.exception": t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.taskException"),
    "auto_director.recovered": t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_b70e8e43"),
    "auto_director.completed": t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_fad5222c"),
    "auto_director.progress_changed": t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_9a392ae5"),
  } as const;

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className="text-base">{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_e8146ae5")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className={`rounded-md border border-dashed p-6 text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_82b03b76")}</div>
        ) : null}

        {!loading && (!detail || !selectedItem) ? (
          <div className={`rounded-md border border-dashed p-6 text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_80523156")}</div>
        ) : null}

        {detail && selectedItem ? (
          <>
            <div className="space-y-1">
              <div className={`${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText} font-medium`}>{selectedItem.novelTitle}</div>
              <div className={`${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText} text-sm text-muted-foreground`}>{selectedItem.reasonLabel}</div>
            </div>

            <div className={`space-y-2 text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              <div>{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_1d886b33")}</div>
              <div>{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.nextStepSuggestion")}</div>
              <div>{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_ae4e888b")}</div>
              <div>{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_29e0f826")}</div>
              <div>{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_b36d9694")}</div>
            </div>

            {selectedItem.section === "needs_validation" ? (
              <div className={`space-y-3 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-950 ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div>
                    <div className="font-medium">{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_f1f37123")}</div>
                    <div className="mt-1 text-xs">
                      安全修复只处理状态对账，不会清除正文、重写规划、确认候选、切换模型或替你做创作选择。
                    </div>
                  </div>
                </div>
                {(detail.validationSummary?.blockingReasons.length ?? 0) > 0 ? (
                  <div className="space-y-1 text-xs">
                    {detail.validationSummary?.blockingReasons.map((reason) => (
                      <div key={reason}>{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_8016de68")}</div>
                    ))}
                  </div>
                ) : null}
                {(detail.validationSummary?.warnings.length ?? 0) > 0 ? (
                  <div className="space-y-1 text-xs">
                    {detail.validationSummary?.warnings.map((warning) => (
                      <div key={warning}>{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_05be2ad3")}</div>
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
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    一键重新校验
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionLoading}
                    className={`${AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction} border-yellow-400 bg-yellow-100 text-yellow-950 hover:bg-yellow-200 hover:text-yellow-950`}
                    title={t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.onlyFixLowRiskItems")}
                    onClick={() => void onSafeFix()}
                  >
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    一键安全修复
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="text-sm font-medium">{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_bdd966d4")}</div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {detail.availableActions.map((action) => (
                  <Button
                    key={action.code}
                    variant={action.kind === "mutation" ? "default" : "outline"}
                    size="sm"
                    className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}
                    disabled={actionLoading}
                    onClick={() => void onExecuteAction(selectedItem, action)}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_0fcd32a9")}</div>
              <div className="space-y-2">
                {detail.milestones.length === 0 ? (
                  <div className="text-sm text-muted-foreground">{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_c6e96697")}</div>
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
              <div className="text-sm font-medium">{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_cb36d263")}</div>
              <div className="space-y-2">
                {(detail.channelDeliveries?.length ?? 0) === 0 ? (
                  <div className="text-sm text-muted-foreground">{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_ede22761")}</div>
                ) : detail.channelDeliveries?.map((delivery) => (
                  <div key={`${delivery.channelType}:${delivery.eventType}`} className={`rounded-md border p-3 text-sm ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={delivery.status === "delivered" ? "secondary" : (delivery.status === "failed" ? "destructive" : "outline")}>
                        {delivery.channelType === "dingtalk" ? t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_4a0e9142") : t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.micro")}
                      </Badge>
                      <Badge variant="outline">{deliveryStatusLabels[delivery.status]}</Badge>
                      <span className="text-xs text-muted-foreground">{eventTypeLabels[delivery.eventType]}</span>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      目标：{delivery.target ?? t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_38e1bd74")} | 响应码：{delivery.responseStatus ?? t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_38e1bd74")} | 时间：{delivery.deliveredAt ? new Date(delivery.deliveredAt).toLocaleString() : t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpDetail.gen_e7b46ab3")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
