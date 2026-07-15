import type {
  AutoDirectorFollowUpAvailableFilters,
  AutoDirectorFollowUpItem,
  AutoDirectorFollowUpPagination,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { AutoDirectorFollowUpSection } from "@ai-novel/shared/types/autoDirectorValidation";
import type { TaskStatus } from "@ai-novel/shared/types/task";
import { Button } from "@/components/ui/button";
import {
  TaskQueueEmptyState,
  TaskQueueItem,
  TaskQueueSection,
  TaskQueueSeverityBadge,
  TaskQueueStatusBadge,
} from "@/components/taskQueue";
import { WorkspaceStateNotice } from "@/components/workspace";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";
import {
  getFollowUpLevelLabel,
  getFollowUpPriorityLabel,
  getFollowUpSeverity,
  getFollowUpTone,
} from "../followUpPresentation";

interface AutoDirectorFollowUpListPanelProps {
  items: AutoDirectorFollowUpItem[];
  pagination: AutoDirectorFollowUpPagination | null;
  filters: AutoDirectorFollowUpAvailableFilters | null;
  activeReason: string;
  activeSection: AutoDirectorFollowUpSection | "";
  activeStatus: string;
  activeSupportsBatch: string;
  selectedTaskId: string;
  selectedTaskIds: string[];
  loading: boolean;
  errorMessage?: string | null;
  actionLoading: boolean;
  onSelectTask: (taskId: string) => void;
  onFilterChange: (key: "reason" | "status" | "supportsBatch" | "channelType", value: string) => void;
  onToggleSelected: (taskId: string, checked: boolean) => void;
  onPageChange: (page: number) => void;
  onRetry: () => void;
}

function formatStatus(status: TaskStatus): string {
  if (status === "waiting_approval") return "等待审批";
  if (status === "failed") return "失败";
  if (status === "cancelled") return "已取消";
  if (status === "running") return "运行中";
  if (status === "queued") return "排队中";
  return "已完成";
}

function formatReason(reason: AutoDirectorFollowUpItem["reason"]): string {
  const labels: Record<AutoDirectorFollowUpItem["reason"], string> = {
    manual_recovery_required: "人工恢复待处理",
    runtime_failed: "失败待重试",
    candidate_selection_required: "待确认书级方向",
    replan_required: "待处理重规划",
    runtime_cancelled: "已取消待恢复",
    chapter_batch_execution_pending: "自动执行待继续",
    quality_repair_pending: "质量修复待继续",
    auto_progress_running: "自动推进中",
    auto_approval_completed: "最近自动通过",
    runtime_replaced: "任务已替代",
    validation_required: "需要重新校验",
  };
  return labels[reason];
}

function formatSection(section: AutoDirectorFollowUpSection): string {
  if (section === "needs_validation") return "需校验";
  if (section === "exception") return "异常";
  if (section === "pending") return "待处理";
  if (section === "auto_progress") return "自动推进";
  return "已替代";
}

function formatActiveSection(section: AutoDirectorFollowUpSection | ""): string {
  return section ? formatSection(section) : "全部分区";
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

function formatItemType(item: AutoDirectorFollowUpItem): string {
  return item.itemType === "auto_approval_record" ? "最近自动通过" : "正在推进";
}

export function AutoDirectorFollowUpListPanel(props: AutoDirectorFollowUpListPanelProps) {
  const totalPages = props.pagination ? Math.max(1, Math.ceil(props.pagination.total / props.pagination.pageSize)) : 1;

  return (
    <TaskQueueSection
      title={formatActiveSection(props.activeSection)}
      description="按结构化原因和状态筛选；质量提醒与阻塞任务使用不同等级。"
      className="min-w-0 overflow-hidden"
    >
      <div className="space-y-4">
        <div className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpFilterGrid}>
          <Select value={props.activeReason || "__all__"} onValueChange={(value) => props.onFilterChange("reason", value === "__all__" ? "" : value)}>
            <SelectTrigger aria-label="按跟进原因筛选" className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpFilterTrigger}>
              <SelectValue placeholder="全部原因" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部原因</SelectItem>
              {(props.filters?.reasons ?? []).map((reason) => (
                <SelectItem key={reason} value={reason}>{formatReason(reason)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={props.activeStatus || "__all__"} onValueChange={(value) => props.onFilterChange("status", value === "__all__" ? "" : value)}>
            <SelectTrigger aria-label="按任务状态筛选" className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpFilterTrigger}>
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
            <SelectTrigger aria-label="按批量操作能力筛选" className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpFilterTrigger}>
              <SelectValue placeholder="批量能力" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">全部</SelectItem>
              <SelectItem value="true">仅可批量</SelectItem>
              <SelectItem value="false">仅不可批量</SelectItem>
            </SelectContent>
          </Select>

        </div>

        <div className="space-y-3">
          {props.loading ? (
            <WorkspaceStateNotice compact loading title="正在读取跟进项" description="正在同步导演任务和最近自动通过记录。" />
          ) : null}

          {props.errorMessage ? (
            <WorkspaceStateNotice
              compact
              tone="danger"
              title="跟进列表读取失败"
              description={props.errorMessage}
              action={<Button size="sm" variant="outline" onClick={props.onRetry}>重新读取</Button>}
            />
          ) : null}

          {!props.loading && !props.errorMessage && props.items.length === 0 ? (
            <TaskQueueEmptyState
              title="当前没有符合条件的跟进项"
              description={props.activeSection === "auto_progress"
                ? "当前没有正在推进的任务或最近自动通过记录。"
                : props.activeSection === "replaced"
                  ? "当前没有被新任务替代的旧任务。"
                  : "可以切换分区或清除筛选条件查看其他导演任务。"}
            />
          ) : null}

          {props.items.map((item) => {
            const itemKey = item.autoApprovalRecordId ?? item.directorTaskId;
            const checked = props.selectedTaskIds.includes(item.directorTaskId);
            const selected = props.selectedTaskId === item.directorTaskId;
            const tone = getFollowUpTone(item);
            return (
              <div key={itemKey} className="relative">
                <TaskQueueItem
                  selected={selected}
                  tone={tone}
                  className={item.supportsBatch ? "p-4 pr-12" : "p-4"}
                  onClick={() => props.onSelectTask(item.directorTaskId)}
                >
                <div className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpListHeader}>
                  <div className="min-w-0 space-y-1">
                    <div className={`${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText} font-medium`}>{item.novelTitle}</div>
                    <div className={`${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText} text-sm text-muted-foreground`}>{item.followUpSummary}</div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <TaskQueueSeverityBadge severity={getFollowUpSeverity(item)} label={getFollowUpLevelLabel(item)} />
                  </div>
                </div>

                <div className="mt-3 flex min-w-0 flex-wrap gap-2 text-xs text-muted-foreground">
                  {item.section === "auto_progress" ? <TaskQueueStatusBadge label={formatItemType(item)} tone={tone} /> : null}
                  <TaskQueueStatusBadge label={formatStatus(item.status)} tone="neutral" />
                  <TaskQueueStatusBadge label={item.reasonLabel} tone="neutral" />
                  <TaskQueueStatusBadge label={getFollowUpPriorityLabel(item.priority, item.reason)} tone={tone} />
                  {item.executionScope ? <TaskQueueStatusBadge label={item.executionScope} tone="neutral" className={`max-w-full whitespace-normal text-left ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`} /> : null}
                  {item.supportsBatch ? <TaskQueueStatusBadge label="可批量" tone="info" /> : null}
                  {buildChannelBadges(item).map((label) => (
                    <TaskQueueStatusBadge key={`${item.directorTaskId}:${label}`} label={label} tone="info" />
                  ))}
                </div>

                <div className={`mt-2 text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                  当前阶段：{item.currentStage ?? "暂无"} · 当前模型：{item.currentModel ?? "暂无"} · 更新时间：{new Date(item.updatedAt).toLocaleString()}
                </div>
                </TaskQueueItem>
                {item.supportsBatch ? (
                  <label className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center">
                    <span className="sr-only">选择 {item.novelTitle} 进行批量操作</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => props.onToggleSelected(item.directorTaskId, event.target.checked)}
                      disabled={props.actionLoading}
                    />
                  </label>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            第 {props.pagination?.page ?? 1} / {totalPages} 页，共 {props.pagination?.total ?? 0} 条
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button
              variant="outline"
              size="sm"
              className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}
              disabled={(props.pagination?.page ?? 1) <= 1}
              onClick={() => props.onPageChange((props.pagination?.page ?? 1) - 1)}
            >
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}
              disabled={(props.pagination?.page ?? 1) >= totalPages}
              onClick={() => props.onPageChange((props.pagination?.page ?? 1) + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      </div>
    </TaskQueueSection>
  );
}
