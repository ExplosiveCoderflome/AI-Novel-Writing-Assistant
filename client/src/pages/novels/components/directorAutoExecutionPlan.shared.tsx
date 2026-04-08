import type {
  DirectorAutoExecutionMode,
  DirectorAutoExecutionPlan,
} from "@ai-novel/shared/types/novelDirector";
import { Input } from "@/components/ui/input";

export interface DirectorAutoExecutionDraftState {
  mode: DirectorAutoExecutionMode;
  startOrder: string;
  endOrder: string;
  volumeOrder: string;
}

const DEFAULT_DIRECTOR_AUTO_EXECUTION_DRAFT: DirectorAutoExecutionDraftState = {
  mode: "front10",
  startOrder: "1",
  endOrder: "10",
  volumeOrder: "1",
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
    };
  }
  if (plan?.mode === "volume") {
    return {
      mode: "volume",
      startOrder: DEFAULT_DIRECTOR_AUTO_EXECUTION_DRAFT.startOrder,
      endOrder: DEFAULT_DIRECTOR_AUTO_EXECUTION_DRAFT.endOrder,
      volumeOrder: String(normalizePositiveInteger(plan.volumeOrder, 1)),
    };
  }
  return createDefaultDirectorAutoExecutionDraftState();
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
    };
  }
  if (draft.mode === "volume") {
    return {
      mode: "volume",
      volumeOrder: normalizePositiveInteger(draft.volumeOrder, 1),
    };
  }
  return {
    mode: "front10",
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

      <div className="mt-3 text-xs leading-5 text-muted-foreground">
        系统会按你选定的章节范围或卷，自动准备节奏板、拆章和章节执行资源，再继续写作、审校与修复。
      </div>
    </div>
  );
}
