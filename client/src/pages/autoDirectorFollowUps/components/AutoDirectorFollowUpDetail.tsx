import type {
  AutoDirectorAction,
  AutoDirectorFollowUpDetail,
  AutoDirectorFollowUpItem,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AutoDirectorFollowUpDetailPanelProps {
  detail: AutoDirectorFollowUpDetail | null;
  selectedItem: AutoDirectorFollowUpItem | null;
  loading: boolean;
  actionLoading: boolean;
  onExecuteAction: (item: AutoDirectorFollowUpItem, action: AutoDirectorAction) => void | Promise<void>;
}

export function AutoDirectorFollowUpDetailPanel({
  detail,
  selectedItem,
  loading,
  actionLoading,
  onExecuteAction,
}: AutoDirectorFollowUpDetailPanelProps) {
  const deliveryStatusLabels = {
    delivered: "已送达",
    pending: "投递中",
    failed: "投递失败",
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
              <div>检查点摘要：{detail.checkpointSummary ?? "暂无"}</div>
              <div>当前模型：{detail.currentModel ?? "暂无"}</div>
              <div>来源页：{detail.originDetailUrl}</div>
            </div>

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
                      <span className="text-xs text-muted-foreground">{delivery.eventType}</span>
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
