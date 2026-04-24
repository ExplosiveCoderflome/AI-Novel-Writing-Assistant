import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { VolumePlan, VolumeStrategyPlan } from "@ai-novel/shared/types/novel";
import VolumePayoffOverviewCard from "./VolumePayoffOverviewCard";
import { formatMobileOutlineVolumeOptionLabel } from "./outlineMobileUi";

type VolumeField = keyof Pick<
  VolumePlan,
  | "title"
  | "summary"
  | "openingHook"
  | "mainPromise"
  | "primaryPressureSource"
  | "coreSellingPoint"
  | "escalationMode"
  | "protagonistChange"
  | "midVolumeRisk"
  | "climax"
  | "payoffType"
  | "nextVolumeHook"
  | "resetPoint"
>;

interface MobileOutlineVolumeWorkspaceProps {
  volumes: VolumePlan[];
  selectedVolume: VolumePlan | undefined;
  selectedVolumeId: string;
  strategyPlan: VolumeStrategyPlan | null;
  onSelectVolume: (volumeId: string) => void;
  onAddVolume: () => void;
  onRemoveVolume: (volumeId: string) => void;
  onMoveVolume: (volumeId: string, direction: -1 | 1) => void;
  onVolumeFieldChange: (volumeId: string, field: VolumeField, value: string) => void;
  onOpenPayoffsChange: (volumeId: string, value: string) => void;
}

const primaryFields: Array<{ field: VolumeField; label: string; multiline?: boolean }> = [
  { field: "title", label: "卷标题" },
  { field: "summary", label: "卷摘要", multiline: true },
  { field: "openingHook", label: "开卷抓手", multiline: true },
  { field: "mainPromise", label: "主承诺", multiline: true },
];

const advancedFields: Array<{ field: VolumeField; label: string }> = [
  { field: "primaryPressureSource", label: "主压迫源" },
  { field: "coreSellingPoint", label: "核心卖点" },
  { field: "escalationMode", label: "升级方式" },
  { field: "protagonistChange", label: "主角变化" },
  { field: "midVolumeRisk", label: "中段风险" },
  { field: "climax", label: "卷末高潮" },
  { field: "payoffType", label: "兑现类型" },
  { field: "nextVolumeHook", label: "下卷钩子" },
  { field: "resetPoint", label: "卷间重置点" },
];

function planningModeLabel(mode: "hard" | "soft" | undefined): string | null {
  if (!mode) {
    return null;
  }
  return mode === "hard" ? "硬规划" : "软规划";
}

function renderTextField(params: {
  volume: VolumePlan;
  field: VolumeField;
  label: string;
  multiline?: boolean;
  onVolumeFieldChange: MobileOutlineVolumeWorkspaceProps["onVolumeFieldChange"];
}) {
  const { volume, field, label, multiline, onVolumeFieldChange } = params;
  const value = String(volume[field] ?? "");

  return (
    <label key={field} className="space-y-1 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea
          className="min-h-[76px] w-full rounded-xl border bg-background p-3 text-sm"
          value={value}
          onChange={(event) => onVolumeFieldChange(volume.id, field, event.target.value)}
        />
      ) : (
        <input
          className="w-full rounded-xl border bg-background p-3 text-sm"
          value={value}
          onChange={(event) => onVolumeFieldChange(volume.id, field, event.target.value)}
        />
      )}
    </label>
  );
}

export default function MobileOutlineVolumeWorkspace(props: MobileOutlineVolumeWorkspaceProps) {
  const {
    volumes,
    selectedVolume,
    selectedVolumeId,
    strategyPlan,
    onSelectVolume,
    onAddVolume,
    onRemoveVolume,
    onMoveVolume,
    onVolumeFieldChange,
    onOpenPayoffsChange,
  } = props;

  if (volumes.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed bg-background p-4 text-xs leading-5 text-muted-foreground md:hidden">
        当前还没有卷骨架。先生成卷战略建议，再点击“生成全书卷骨架”。
      </section>
    );
  }

  if (!selectedVolume) {
    return null;
  }

  const selectedStrategyVolume = strategyPlan?.volumes.find((item) => item.sortOrder === selectedVolume.sortOrder) ?? null;
  const selectedPlanningModeLabel = planningModeLabel(selectedStrategyVolume?.planningMode);

  return (
    <div className="space-y-3 md:hidden">
      <section className="rounded-2xl border border-border/70 bg-background p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-base font-semibold text-foreground">当前编辑卷</div>
            <div className="mt-1 text-xs text-muted-foreground">先选卷，再直接编辑下方主字段。</div>
          </div>
          <Button size="sm" variant="outline" onClick={onAddVolume}>新增卷</Button>
        </div>

        <select
          className="mt-3 w-full min-w-0 rounded-xl border bg-background p-3 text-sm"
          value={selectedVolumeId}
          onChange={(event) => onSelectVolume(event.target.value)}
        >
          {volumes.map((volume) => {
            const strategyVolume = strategyPlan?.volumes.find((item) => item.sortOrder === volume.sortOrder) ?? null;
            return (
              <option key={volume.id} value={volume.id}>
                {formatMobileOutlineVolumeOptionLabel({
                  sortOrder: volume.sortOrder,
                  title: volume.title || strategyVolume?.roleLabel,
                  planningModeLabel: planningModeLabel(strategyVolume?.planningMode),
                  chapterCount: volume.chapters.length,
                })}
              </option>
            );
          })}
        </select>

        <div className="mt-3 flex min-w-0 flex-wrap gap-2">
          <Badge variant="outline">第{selectedVolume.sortOrder}卷</Badge>
          {selectedPlanningModeLabel ? <Badge variant={selectedStrategyVolume?.planningMode === "hard" ? "secondary" : "outline"}>{selectedPlanningModeLabel}</Badge> : null}
          <Badge variant="outline">{selectedVolume.chapters.length > 0 ? `${selectedVolume.chapters.length}章` : "未拆章"}</Badge>
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-background p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-base font-semibold text-foreground">卷骨架编辑</div>
            <div className="mt-1 text-xs text-muted-foreground">手机端先保留核心字段，高级字段可展开补充。</div>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="outline" onClick={() => onMoveVolume(selectedVolume.id, -1)} disabled={selectedVolume.sortOrder === 1}>上移</Button>
            <Button size="sm" variant="outline" onClick={() => onMoveVolume(selectedVolume.id, 1)} disabled={selectedVolume.sortOrder === volumes.length}>下移</Button>
          </div>
        </div>

        <div className="mt-3 space-y-3">
          {primaryFields.map((item) => renderTextField({
            volume: selectedVolume,
            field: item.field,
            label: item.label,
            multiline: item.multiline,
            onVolumeFieldChange,
          }))}
        </div>

        <details className="group mt-3 rounded-2xl border border-border/70 bg-muted/20 p-3">
          <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
            高级卷设定
            <span className="ml-2 text-xs font-normal text-muted-foreground group-open:hidden">展开补压迫源、高潮和钩子</span>
            <span className="ml-2 hidden text-xs font-normal text-muted-foreground group-open:inline">收起高级字段</span>
          </summary>
          <div className="mt-3 space-y-3">
            {advancedFields.map((item) => renderTextField({
              volume: selectedVolume,
              field: item.field,
              label: item.label,
              multiline: true,
              onVolumeFieldChange,
            }))}
            <label className="space-y-1 text-sm">
              <span className="text-xs text-muted-foreground">本卷未兑现事项</span>
              <textarea
                className="min-h-[84px] w-full rounded-xl border bg-background p-3 text-sm"
                placeholder="每行一个，或用中文逗号分隔。"
                value={selectedVolume.openPayoffs.join("\n")}
                onChange={(event) => onOpenPayoffsChange(selectedVolume.id, event.target.value)}
              />
            </label>
            <Button size="sm" variant="outline" onClick={() => onRemoveVolume(selectedVolume.id)} disabled={volumes.length <= 1}>
              删除当前卷
            </Button>
          </div>
        </details>
      </section>

      <details className="group rounded-2xl border border-border/70 bg-background p-3 shadow-sm">
        <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
          当前卷伏笔 / 回收参考
          <span className="ml-2 text-xs font-normal text-muted-foreground group-open:hidden">展开核对</span>
          <span className="ml-2 hidden text-xs font-normal text-muted-foreground group-open:inline">收起参考</span>
        </summary>
        <div className="mt-3">
          <VolumePayoffOverviewCard selectedVolume={selectedVolume} />
        </div>
      </details>
    </div>
  );
}
