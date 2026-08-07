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
  if (status === "waiting_approval") return "Waiting for approval";
  if (status === "failed") return "fail";
  if (status === "cancelled") return "Canceled";
  if (status === "running") return "Running";
  if (status === "queued") return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
}

function formatReason(reason: AutoDirectorFollowUpItem["reason"]): string {
  const labels: Record<AutoDirectorFollowUpItem["reason"], string> = {
    manual_recovery_required: "Manual recovery pending",
    runtime_failed: "Failed to try again",
    candidate_selection_required: "Book level direction to be confirmed",
    replan_required: "Pending re-planning",
    runtime_cancelled: "Canceled pending restoration",
    chapter_batch_execution_pending: "Automatic execution to be continued",
    quality_repair_pending: "Quality fixes to be continued",
    auto_progress_running: "Automatically advancing",
    auto_approval_completed: "Recently passed automatically",
    runtime_replaced: "Task has been replaced",
    validation_required: "Need to recheck",
  };
  return labels[reason];
}

function formatSection(section: AutoDirectorFollowUpSection): string {
  if (section === "needs_validation") return "Need to verify";
  if (section === "exception") return "abnormal";
  if (section === "pending") return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  if (section === "auto_progress") return "automatic advance";
  return "replaced";
}

function formatActiveSection(section: AutoDirectorFollowUpSection | ""): string {
  return section ? formatSection(section) : "All partitions";
}

function buildChannelBadges(item: AutoDirectorFollowUpItem): string[] {
  const labels: string[] = [];
  if (item.channelCapabilities.dingtalk) {
    labels.push("Direct access to DingTalk");
  }
  if (item.channelCapabilities.wecom) {
    labels.push("Direct access to Qiwei");
  }
  return labels;
}

function formatItemType(item: AutoDirectorFollowUpItem): string {
  return item.itemType === "auto_approval_record" ? "Recently passed automatically" : "Advancing";
}

export function AutoDirectorFollowUpListPanel(props: AutoDirectorFollowUpListPanelProps) {
  const totalPages = props.pagination ? Math.max(1, Math.ceil(props.pagination.total / props.pagination.pageSize)) : 1;

  return (
    <TaskQueueSection
      title={formatActiveSection(props.activeSection)}
      description="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
      className="min-w-0 overflow-hidden"
    >
      <div className="space-y-4">
        <div className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpFilterGrid}>
          <Select value={props.activeReason || "__all__"} onValueChange={(value) => props.onFilterChange("reason", value === "__all__" ? "" : value)}>
            <SelectTrigger aria-label="Filter by reason for follow-up" className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpFilterTrigger}>
              <SelectValue placeholder="all reasons" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">all reasons</SelectItem>
              {(props.filters?.reasons ?? []).map((reason) => (
                <SelectItem key={reason} value={reason}>{formatReason(reason)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={props.activeStatus || "__all__"} onValueChange={(value) => props.onFilterChange("status", value === "__all__" ? "" : value)}>
            <SelectTrigger aria-label="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpFilterTrigger}>
              <SelectValue placeholder="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</SelectItem>
              {(props.filters?.statuses ?? []).map((status) => (
                <SelectItem key={status} value={status}>{formatStatus(status)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={props.activeSupportsBatch || "__all__"} onValueChange={(value) => props.onFilterChange("supportsBatch", value === "__all__" ? "" : value)}>
            <SelectTrigger aria-label="Filter by batch operation capability" className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpFilterTrigger}>
              <SelectValue placeholder="Batch capacity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</SelectItem>
              <SelectItem value="true">Batch only</SelectItem>
              <SelectItem value="false">Not available in batches only</SelectItem>
            </SelectContent>
          </Select>

        </div>

        <div className="space-y-3">
          {props.loading ? (
            <WorkspaceStateNotice compact loading title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." description="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." />
          ) : null}

          {props.errorMessage ? (
            <WorkspaceStateNotice
              compact
              tone="danger"
              title="Failed to read follow-up list"
              description={props.errorMessage}
              action={<Button size="sm" variant="outline" onClick={props.onRetry}>reread</Button>}
            />
          ) : null}

          {!props.loading && !props.errorMessage && props.items.length === 0 ? (
            <TaskQueueEmptyState
              title="There are currently no eligible follow-up items"
              description={props.activeSection === "auto_progress"
                ? "There are currently no tasks in progress or recent automatic passes recorded."
                : props.activeSection === "replaced"
                  ? "There are old tasks that are not currently replaced by new tasks."
                  : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}
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
                  {item.supportsBatch ? <TaskQueueStatusBadge label="Available in batches" tone="info" /> : null}
                  {buildChannelBadges(item).map((label) => (
                    <TaskQueueStatusBadge key={`${item.directorTaskId}:${label}`} label={label} tone="info" />
                  ))}
                </div>

                <div className={`mt-2 text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                  Current stage:{item.currentStage ?? "None yet"} · Current model:{item.currentModel ?? "None yet"} · Update time:{new Date(item.updatedAt).toLocaleString()}
                </div>
                </TaskQueueItem>
                {item.supportsBatch ? (
                  <label className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center">
                    <span className="sr-only">choose {item.novelTitle} Perform batch operations</span>
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
            Section {props.pagination?.page ?? 1} / {totalPages} Pages, total {props.pagination?.total ?? 0} strip
                                </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button
              variant="outline"
              size="sm"
              className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}
              disabled={(props.pagination?.page ?? 1) <= 1}
              onClick={() => props.onPageChange((props.pagination?.page ?? 1) - 1)}
            >
              Previous page
                                      </Button>
            <Button
              variant="outline"
              size="sm"
              className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}
              disabled={(props.pagination?.page ?? 1) >= totalPages}
              onClick={() => props.onPageChange((props.pagination?.page ?? 1) + 1)}
            >
              Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.
                                      </Button>
          </div>
        </div>
      </div>
    </TaskQueueSection>
  );
}
