import type {
  AutoDirectorChannelType,
  AutoDirectorFollowUpAvailableFilters,
  AutoDirectorFollowUpItem,
  AutoDirectorFollowUpPagination,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { TaskStatus } from "@ai-novel/shared/types/task";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface AutoDirectorFollowUpListPanelProps {
  items: AutoDirectorFollowUpItem[];
  pagination: AutoDirectorFollowUpPagination | null;
  filters: AutoDirectorFollowUpAvailableFilters | null;
  activeReason: string;
  activeStatus: string;
  activeSupportsBatch: string;
  activeChannelType: string;
  selectedTaskId: string;
  selectedTaskIds: string[];
  loading: boolean;
  actionLoading: boolean;
  onSelectTask: (taskId: string) => void;
  onFilterChange: (key: "reason" | "status" | "supportsBatch" | "channelType", value: string) => void;
  onToggleSelected: (taskId: string, checked: boolean) => void;
  onPageChange: (page: number) => void;
}

function formatPriority(priority: AutoDirectorFollowUpItem["priority"]): string {
  return priority;
}

function formatStatus(status: TaskStatus): string {
  if (status === "waiting_approval") return "等待审批";
  if (status === "failed") return "失败";
  if (status === "cancelled") return "已取消";
  if (status === "running") return "运行中";
  if (status === "queued") return "排队中";
  return "已完成";
}

function formatChannelType(channelType: AutoDirectorChannelType): string {
  return channelType === "dingtalk" ? "钉钉" : "企微";
}

function buildChannelBadges(item: AutoDirectorFollowUpItem): string[] {
  const labels: string[] = [];
  if (item.channelCapabilities.dingtalk) {
    labels.push("钉钉可直达");
  }
  if (item.channelCapabilities.wecom) {
    labels.push("企微可直达");
  }
  return labels;
}

export function AutoDirectorFollowUpListPanel(props: AutoDirectorFollowUpListPanelProps) {
  const totalPages = props.pagination ? Math.max(1, Math.ceil(props.pagination.total / props.pagination.pageSize)) : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">导演跟进列表</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Select value={props.activeReason || "__all__"} onValueChange={(value) => props.onFilterChange("reason", value === "__all__" ? "" : value)}>
            <SelectTrigger>
              <SelectValue placeholder="全部原因" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部原因</SelectItem>
              {(props.filters?.reasons ?? []).map((reason) => (
                <SelectItem key={reason} value={reason}>{reason}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={props.activeStatus || "__all__"} onValueChange={(value) => props.onFilterChange("status", value === "__all__" ? "" : value)}>
            <SelectTrigger>
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部状态</SelectItem>
              {(props.filters?.statuses ?? []).map((status) => (
                <SelectItem key={status} value={status}>{formatStatus(status)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={props.activeSupportsBatch || "__all__"} onValueChange={(value) => props.onFilterChange("supportsBatch", value === "__all__" ? "" : value)}>
            <SelectTrigger>
              <SelectValue placeholder="批量能力" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部</SelectItem>
              <SelectItem value="true">仅可批量</SelectItem>
              <SelectItem value="false">仅不可批量</SelectItem>
            </SelectContent>
          </Select>

          <Select value={props.activeChannelType || "__all__"} onValueChange={(value) => props.onFilterChange("channelType", value === "__all__" ? "" : value)}>
            <SelectTrigger>
              <SelectValue placeholder="通道能力" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部通道</SelectItem>
              {(props.filters?.channelTypes ?? []).map((channelType) => (
                <SelectItem key={channelType} value={channelType}>{formatChannelType(channelType)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          {props.loading ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">正在加载跟进项...</div>
          ) : null}

          {!props.loading && props.items.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">当前没有符合条件的导演跟进项。</div>
          ) : null}

          {props.items.map((item) => {
            const checked = props.selectedTaskIds.includes(item.taskId);
            const selected = props.selectedTaskId === item.taskId;
            return (
              <button
                key={item.taskId}
                type="button"
                className={cn(
                  "w-full rounded-xl border p-4 text-left transition-colors",
                  selected ? "border-primary bg-primary/5" : "hover:bg-muted/40",
                )}
                onClick={() => props.onSelectTask(item.taskId)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-medium">{item.novelTitle}</div>
                    <div className="text-sm text-muted-foreground">{item.followUpSummary}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.supportsBatch ? (
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => props.onToggleSelected(item.taskId, event.target.checked)}
                        onClick={(event) => event.stopPropagation()}
                        disabled={props.actionLoading}
                      />
                    ) : null}
                    <Badge variant={item.priority === "P0" ? "destructive" : item.priority === "P1" ? "secondary" : "outline"}>
                      {formatPriority(item.priority)}
                    </Badge>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{formatStatus(item.status)}</Badge>
                  <Badge variant="outline">{item.reasonLabel}</Badge>
                  {item.executionScope ? <Badge variant="outline">{item.executionScope}</Badge> : null}
                  {item.supportsBatch ? <Badge variant="secondary">可批量</Badge> : null}
                  {buildChannelBadges(item).map((label) => (
                    <Badge key={`${item.taskId}:${label}`} variant="secondary">{label}</Badge>
                  ))}
                </div>

                <div className="mt-2 text-xs text-muted-foreground">
                  当前阶段：{item.currentStage ?? "暂无"} | 当前模型：{item.currentModel ?? "暂无"} | 更新时间：{new Date(item.updatedAt).toLocaleString()}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            第 {props.pagination?.page ?? 1} / {totalPages} 页，共 {props.pagination?.total ?? 0} 条
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={(props.pagination?.page ?? 1) <= 1}
              onClick={() => props.onPageChange((props.pagination?.page ?? 1) - 1)}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(props.pagination?.page ?? 1) >= totalPages}
              onClick={() => props.onPageChange((props.pagination?.page ?? 1) + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
