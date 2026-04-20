import type {
  DirectorAutoExecutionMode,
  DirectorAutoExecutionPlan,
} from "@ai-novel/shared/types/novelDirector";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export interface DirectorAutoExecutionDraftState {
  mode: DirectorAutoExecutionMode;
  startOrder: string;
  endOrder: string;
  volumeOrder: string;
  autoReview: boolean;
  autoRepair: boolean;
}

const DEFAULT_DIRECTOR_AUTO_EXECUTION_DRAFT: DirectorAutoExecutionDraftState = {
  mode: "front10",
  startOrder: "1",
  endOrder: "10",
  volumeOrder: "1",
  autoReview: true,
  autoRepair: true,
};

const AUTO_EXECUTION_SCOPE_OPTIONS: Array<{
  value: DirectorAutoExecutionMode;
  label: string;
  description: string;
}> = [
  {
    value: "front10",
    label: "默认前 10 章",
    description: "适合新书起盘，AI 会直接把前 10 章写作、审校和修复跑完。",
  },
  {
    value: "chapter_range",
    label: "指定章节范围",
    description: "适合你只想让 AI 接手某一段，比如第 11-20 章。",
  },
  {
    value: "volume",
    label: "按卷执行",
    description: "适合你想让 AI 一口气接管某一卷的章节批次。",
  },
];

function normalizePositiveInteger(value: string | number | undefined, fallback: number): number {
  const numericValue = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(numericValue) || numericValue < 1) {
    return fallback;
  }
  return Math.max(1, Math.round(numericValue));
}

export function createDefaultDirectorAutoExecutionDraftState(): DirectorAutoExecutionDraftState {
  return { ...DEFAULT_DIRECTOR_AUTO_EXECUTION_DRAFT };
}

export function normalizeDirectorAutoExecutionDraftState(
  plan: DirectorAutoExecutionPlan | null | undefined,
): DirectorAutoExecutionDraftState {
  if (plan?.mode === "chapter_range") {
    const startOrder = normalizePositiveInteger(plan.startOrder, 1);
    const endOrder = normalizePositiveInteger(plan.endOrder, Math.max(startOrder, 10));
      return {
        mode: "chapter_range",
        startOrder: String(startOrder),
        endOrder: String(Math.max(startOrder, endOrder)),
        volumeOrder: DEFAULT_DIRECTOR_AUTO_EXECUTION_DRAFT.volumeOrder,
        autoReview: plan.autoReview ?? true,
        autoRepair: plan.autoReview === false ? false : (plan.autoRepair ?? true),
      };
    }
  if (plan?.mode === "volume") {
    return {
      mode: "volume",
      startOrder: DEFAULT_DIRECTOR_AUTO_EXECUTION_DRAFT.startOrder,
      endOrder: DEFAULT_DIRECTOR_AUTO_EXECUTION_DRAFT.endOrder,
      volumeOrder: String(normalizePositiveInteger(plan.volumeOrder, 1)),
      autoReview: plan.autoReview ?? true,
      autoRepair: plan.autoReview === false ? false : (plan.autoRepair ?? true),
    };
  }
  return {
    ...createDefaultDirectorAutoExecutionDraftState(),
    autoReview: plan?.autoReview ?? true,
    autoRepair: plan?.autoReview === false ? false : (plan?.autoRepair ?? true),
  };
}

export function buildDirectorAutoExecutionPlanFromDraft(
  draft: DirectorAutoExecutionDraftState,
): DirectorAutoExecutionPlan {
  if (draft.mode === "chapter_range") {
    const startOrder = normalizePositiveInteger(draft.startOrder, 1);
    const endOrder = Math.max(startOrder, normalizePositiveInteger(draft.endOrder, 10));
    return {
      mode: "chapter_range",
      startOrder,
      endOrder,
      autoReview: draft.autoReview,
      autoRepair: draft.autoReview ? draft.autoRepair : false,
    };
  }
  if (draft.mode === "volume") {
    return {
      mode: "volume",
      volumeOrder: normalizePositiveInteger(draft.volumeOrder, 1),
      autoReview: draft.autoReview,
      autoRepair: draft.autoReview ? draft.autoRepair : false,
    };
  }
  return {
    mode: "front10",
    autoReview: draft.autoReview,
    autoRepair: draft.autoReview ? draft.autoRepair : false,
  };
}

export function buildDirectorAutoExecutionPlanLabel(
  plan: DirectorAutoExecutionPlan | null | undefined,
): string {
  if (plan?.mode === "chapter_range") {
    const startOrder = normalizePositiveInteger(plan.startOrder, 1);
    const endOrder = Math.max(startOrder, normalizePositiveInteger(plan.endOrder, startOrder));
    if (startOrder === endOrder) {
      return `第 ${startOrder} 章`;
    }
    return `第 ${startOrder}-${endOrder} 章`;
  }
  if (plan?.mode === "volume") {
    return `第 ${normalizePositiveInteger(plan.volumeOrder, 1)} 卷`;
  }
  return "前 10 章";
}

interface DirectorAutoExecutionPlanFieldsProps {
  draft: DirectorAutoExecutionDraftState;
  onChange: (patch: Partial<DirectorAutoExecutionDraftState>) => void;
}

export function DirectorAutoExecutionPlanFields({
  draft,
  onChange,
}: DirectorAutoExecutionPlanFieldsProps) {
  const plan = buildDirectorAutoExecutionPlanFromDraft(draft);
  const scopeLabel = buildDirectorAutoExecutionPlanLabel(plan);
  const reviewLabel = draft.autoReview
    ? draft.autoRepair
      ? "正文后自动审核 + 自动修复"
      : "正文后自动审核，不自动修复"
    : "正文后不做自动审核与修复";

  return (
    <div className="mt-3 rounded-md border border-primary/15 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium text-foreground">自动执行范围</div>
        <div className="text-xs text-muted-foreground">当前将执行：{scopeLabel}</div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {AUTO_EXECUTION_SCOPE_OPTIONS.map((option) => {
          const active = option.value === draft.mode;
          return (
            <button
              key={option.value}
              type="button"
              className={`rounded-xl border px-3 py-3 text-left transition ${
                active
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border bg-background hover:border-primary/40"
              }`}
              onClick={() => onChange({ mode: option.value })}
            >
              <div className="text-sm font-medium text-foreground">{option.label}</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{option.description}</div>
            </button>
          );
        })}
      </div>

      {draft.mode === "chapter_range" ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-xs font-medium text-foreground">起始章节</div>
            <Input
              className="mt-2"
              type="number"
              min={1}
              value={draft.startOrder}
              onChange={(event) => onChange({ startOrder: event.target.value })}
              placeholder="例如 11"
            />
          </div>
          <div>
            <div className="text-xs font-medium text-foreground">结束章节</div>
            <Input
              className="mt-2"
              type="number"
              min={1}
              value={draft.endOrder}
              onChange={(event) => onChange({ endOrder: event.target.value })}
              placeholder="例如 20"
            />
          </div>
        </div>
      ) : null}

      {draft.mode === "volume" ? (
        <div className="mt-4 max-w-xs">
          <div className="text-xs font-medium text-foreground">卷序号</div>
          <Input
            className="mt-2"
            type="number"
            min={1}
            value={draft.volumeOrder}
            onChange={(event) => onChange({ volumeOrder: event.target.value })}
            placeholder="例如 2"
          />
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border bg-background/80 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">正文生成后自动审核</div>
            <div className="text-xs leading-5 text-muted-foreground">
              关闭后，正文生成完成就直接结束当前章节，不再自动做质量校验。
            </div>
          </div>
          <Switch
            checked={draft.autoReview}
            onCheckedChange={(checked) => onChange({
              autoReview: checked,
              autoRepair: checked ? draft.autoRepair : false,
            })}
            aria-label="切换正文生成后是否自动审核"
          />
        </div>

        <div className="mt-4 flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">审核不通过时自动修复</div>
            <div className="text-xs leading-5 text-muted-foreground">
              只在开启自动审核后生效；关闭时会保留问题，等待你手动处理或重跑。
            </div>
          </div>
          <Switch
            checked={draft.autoReview && draft.autoRepair}
            disabled={!draft.autoReview}
            onCheckedChange={(checked) => onChange({ autoRepair: checked })}
            aria-label="切换审核后是否自动修复"
          />
        </div>
      </div>

      <div className="mt-3 text-xs leading-5 text-muted-foreground">
        系统会按你选定的章节范围或卷，自动准备节奏板、拆章和章节执行资源，再继续写作。
        当前质量策略：{reviewLabel}。
      </div>
    </div>
  );
}
