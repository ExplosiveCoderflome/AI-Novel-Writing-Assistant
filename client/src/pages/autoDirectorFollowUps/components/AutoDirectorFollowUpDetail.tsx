import type {
  AutoDirectorAction,
  AutoDirectorFollowUpDetail,
  AutoDirectorFollowUpItem,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RefreshCw } from "lucide-react";

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
    delivered: "已送达",
    pending: "投递中",
    failed: "投递失败",
  } as const;
  const eventTypeLabels = {
    "auto_director.approval_required": "需要处理",
    "auto_director.auto_approved": "AI 已自动通过",
    "auto_director.exception": "任务异常",
    "auto_director.recovered": "已恢复",
    "auto_director.completed": "已完成",
    "auto_director.progress_changed": "进度变化",
  } as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">跟进详情</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">正在加载详情...</div>
        ) : null}

        {!loading && (!detail || !selectedItem) ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">请选择一个导演跟进项查看详情。</div>
        ) : null}

        {detail && selectedItem ? (
          <>
            <div className="space-y-1">
              <div className="font-medium">{selectedItem.novelTitle}</div>
              <div className="text-sm text-muted-foreground">{selectedItem.reasonLabel}</div>
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              <div>阻塞原因：{detail.blockingReason ?? "暂无"}</div>
              <div>下一步建议：{detail.nextStepSuggestion ?? "查看任务详情后再继续。"}</div>
              <div>检查点摘要：{detail.checkpointSummary ?? "暂无"}</div>
              <div>当前模型：{detail.currentModel ?? "暂无"}</div>
              <div>来源页：{detail.originDetailUrl}</div>
            </div>

            {selectedItem.section === "needs_validation" ? (
              <div className="space-y-3 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-950">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div>
                    <div className="font-medium">先校验任务和资产状态</div>
                    <div className="mt-1 text-xs">
                      安全修复只处理状态对账，不会清除正文、重写规划、确认候选、切换模型或替你做创作选择。
                    </div>
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
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
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
                    className="border-yellow-400 bg-yellow-100 text-yellow-950 hover:bg-yellow-200 hover:text-yellow-950"
                    title="仅修复校验标记为低风险的状态、检查点、进度、恢复目标、自动执行对账、替代原因、审计和通知记录；不会清除正文、重写资产、重规划、确认候选、切换模型或生成内容。"
                    onClick={() => void onSafeFix()}
                  >
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    一键安全修复
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="text-sm font-medium">可执行动作</div>
              <div className="flex flex-wrap gap-2">
                {detail.availableActions.map((action) => (
                  <Button
                    key={action.code}
                    variant={action.kind === "mutation" ? "default" : "outline"}
                    size="sm"
                    disabled={actionLoading}
                    onClick={() => void onExecuteAction(selectedItem, action)}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">最近里程碑</div>
              <div className="space-y-2">
                {detail.milestones.length === 0 ? (
                  <div className="text-sm text-muted-foreground">暂无里程碑</div>
                ) : detail.milestones.map((milestone) => (
                  <div key={`${milestone.at}:${milestone.label}`} className="rounded-md border p-3 text-sm">
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
              <div className="text-sm font-medium">通道触达</div>
              <div className="space-y-2">
                {(detail.channelDeliveries?.length ?? 0) === 0 ? (
                  <div className="text-sm text-muted-foreground">暂无通道投递记录</div>
                ) : detail.channelDeliveries?.map((delivery) => (
                  <div key={`${delivery.channelType}:${delivery.eventType}`} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant={delivery.status === "delivered" ? "secondary" : (delivery.status === "failed" ? "destructive" : "outline")}>
                        {delivery.channelType === "dingtalk" ? "钉钉" : "企微"}
                      </Badge>
                      <Badge variant="outline">{deliveryStatusLabels[delivery.status]}</Badge>
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
      </CardContent>
    </Card>
  );
}
