import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type {
  AutoDirectorFollowUpAvailableFilters,
  AutoDirectorFollowUpItem,
  AutoDirectorFollowUpPagination,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { AutoDirectorFollowUpSection } from "@ai-novel/shared/types/autoDirectorValidation";
import type { TaskStatus } from "@ai-novel/shared/types/task";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

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
  if (status === "waiting_approval") return t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_3ced7e48");
  if (status === "failed") return t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_acd5cb84");
  if (status === "cancelled") return t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_2111ccbb");
  if (status === "running") return t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_d679aea3");
  if (status === "queued") return t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_e5ac1d20");
  return t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_fad5222c");
}

function formatSection(section: AutoDirectorFollowUpSection): string {
  if (section === "needs_validation") return t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_f781ac23");
  if (section === "exception") return t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_c195df63");
  if (section === "pending") return t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_047109de");
  if (section === "auto_progress") return t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_0eac0fc9");
  return t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_5d7c27b7");
}

function formatActiveSection(section: AutoDirectorFollowUpSection | ""): string {
  return section ? formatSection(section) : t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_fb291d9d");
}

function buildChannelBadges(item: AutoDirectorFollowUpItem): string[] {
  const labels: string[] = [];
  if (item.channelCapabilities.dingtalk) {
    labels.push(t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_9595f74a"));
  }
  if (item.channelCapabilities.wecom) {
    labels.push(t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.microDirectlyReachable"));
  }
  return labels;
}

function formatItemType(item: AutoDirectorFollowUpItem): string {
  return item.itemType === "auto_approval_record" ? t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_c3a95b77") : t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_93792aa2");
}

export function AutoDirectorFollowUpListPanel(props: AutoDirectorFollowUpListPanelProps) {
  const totalPages = props.pagination ? Math.max(1, Math.ceil(props.pagination.total / props.pagination.pageSize)) : 1;

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle className={`${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText} text-base`}>{formatActiveSection(props.activeSection)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpFilterGrid}>
          <Select value={props.activeReason || "__all__"} onValueChange={(value) => props.onFilterChange("reason", value === "__all__" ? "" : value)}>
            <SelectTrigger className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpFilterTrigger}>
              <SelectValue placeholder={t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_2e51c1e9")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_2e51c1e9")}</SelectItem>
              {(props.filters?.reasons ?? []).map((reason) => (
                <SelectItem key={reason} value={reason}>{reason}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={props.activeStatus || "__all__"} onValueChange={(value) => props.onFilterChange("status", value === "__all__" ? "" : value)}>
            <SelectTrigger className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpFilterTrigger}>
              <SelectValue placeholder={t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_443483c9")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_443483c9")}</SelectItem>
              {(props.filters?.statuses ?? []).map((status) => (
                <SelectItem key={status} value={status}>{formatStatus(status)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={props.activeSupportsBatch || "__all__"} onValueChange={(value) => props.onFilterChange("supportsBatch", value === "__all__" ? "" : value)}>
            <SelectTrigger className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpFilterTrigger}>
              <SelectValue placeholder={t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_4db4c06a")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_a8b0c204")}</SelectItem>
              <SelectItem value="true">{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.onlyBulk")}</SelectItem>
              <SelectItem value="false">{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.onlyNonBulk")}</SelectItem>
            </SelectContent>
          </Select>

        </div>

        <div className="space-y-3">
          {props.loading ? (
            <div className={`rounded-md border border-dashed p-6 text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_06c7d9c9")}</div>
          ) : null}

          {!props.loading && props.items.length === 0 ? (
            <div className={`rounded-md border border-dashed p-6 text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              {props.activeSection === "auto_progress"
                ? t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_821503ca")
                : props.activeSection === "replaced"
                  ? t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_07c6d69e")
                  : t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_358ef436")}
            </div>
          ) : null}

          {props.items.map((item) => {
            const itemKey = item.autoApprovalRecordId ?? item.directorTaskId;
            const checked = props.selectedTaskIds.includes(item.directorTaskId);
            const selected = props.selectedTaskId === item.directorTaskId;
            return (
              <button
                key={itemKey}
                type="button"
                className={cn(
                  "w-full min-w-0 rounded-xl border p-4 text-left transition-colors",
                  selected ? "border-primary bg-primary/5" : "hover:bg-muted/40",
                )}
                onClick={() => props.onSelectTask(item.directorTaskId)}
              >
                <div className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpListHeader}>
                  <div className="min-w-0 space-y-1">
                    <div className={`${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText} font-medium`}>{item.novelTitle}</div>
                    <div className={`${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText} text-sm text-muted-foreground`}>{item.followUpSummary}</div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {item.supportsBatch ? (
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => props.onToggleSelected(item.directorTaskId, event.target.checked)}
                        onClick={(event) => event.stopPropagation()}
                        disabled={props.actionLoading}
                      />
                    ) : null}
                    <Badge variant={item.priority === "P0" ? "destructive" : item.priority === "P1" ? "secondary" : "outline"}>
                      {formatSection(item.section)}
                    </Badge>
                  </div>
                </div>

                <div className="mt-3 flex min-w-0 flex-wrap gap-2 text-xs text-muted-foreground">
                  {item.section === "auto_progress" ? <Badge variant="secondary">{formatItemType(item)}</Badge> : null}
                  <Badge variant="outline">{formatStatus(item.status)}</Badge>
                  <Badge variant="outline">{item.reasonLabel}</Badge>
                  <Badge variant="outline">{formatPriority(item.priority)}</Badge>
                  {item.executionScope ? <Badge variant="outline" className={`max-w-full whitespace-normal text-left ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{item.executionScope}</Badge> : null}
                  {item.supportsBatch ? <Badge variant="secondary">{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_07945f54")}</Badge> : null}
                  {buildChannelBadges(item).map((label) => (
                    <Badge key={`${item.directorTaskId}:${label}`} variant="secondary">{label}</Badge>
                  ))}
                </div>

                <div className={`mt-2 text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                  当前阶段：{item.currentStage ?? t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_f61f4cf6")} · 当前模型：{item.currentModel ?? t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpList.gen_f61f4cf6")} · 更新时间：{new Date(item.updatedAt).toLocaleString()}
                </div>
              </button>
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
      </CardContent>
    </Card>
  );
}
