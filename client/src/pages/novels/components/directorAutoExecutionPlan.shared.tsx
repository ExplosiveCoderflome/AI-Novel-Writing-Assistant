import i18next from "i18next";
import { useTranslation } from "react-i18next";
import type {
  DirectorAutoExecutionMode,
  DirectorAutoExecutionPlan,
  DirectorTakeoverExecutableRangeSnapshot,
  DirectorTakeoverStrategy,
} from "@ai-novel/shared/types/novelDirector";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

export interface DirectorAutoExecutionDraftState {
  mode: DirectorAutoExecutionMode;
  startOrder: string;
  endOrder: string;
  volumeOrder: string;
  autoReview: boolean;
  autoRepair: boolean;
}

const DEFAULT_DIRECTOR_AUTO_EXECUTION_DRAFT: DirectorAutoExecutionDraftState = {
  mode: "chapter_range",
  startOrder: "1",
  endOrder: "10",
  volumeOrder: "1",
  autoReview: true,
  autoRepair: true,
};

type DirectorAutoExecutionPlanUsage = "new_book" | "takeover";

const NEW_BOOK_SCOPE_OPTIONS: Array<{
  value: DirectorAutoExecutionMode;
  label: string;
  description: string;
}> = [
  {
    value: "book",
    label: i18next.t("dict.gen_3df555d4"),
    description: i18next.t("novels.directorAutoExecutionPlan.shared.k3nuzv"),
  },
  {
    value: "chapter_range",
    label: i18next.t("novels.directorAutoExecutionPlan.shared.4ligoy"),
    description: i18next.t("novels.directorAutoExecutionPlan.shared.qvbrl4"),
  },
  {
    value: "volume",
    label: i18next.t("novels.directorAutoExecutionPlan.shared.xcd34b"),
    description: i18next.t("novels.directorAutoExecutionPlan.shared.pg2u8i"),
  },
];

const TAKEOVER_SCOPE_OPTIONS: Array<{
  value: DirectorAutoExecutionMode;
  label: string;
  description: string;
}> = [
  {
    value: "book",
    label: i18next.t("dict.gen_3df555d4"),
    description: i18next.t("novels.directorAutoExecutionPlan.shared.nuj1rw"),
  },
  {
    value: "chapter_range",
    label: i18next.t("novels.directorAutoExecutionPlan.shared.g1ocqb"),
    description: i18next.t("novels.directorAutoExecutionPlan.shared.mq7ayr"),
  },
  {
    value: "volume",
    label: i18next.t("novels.directorAutoExecutionPlan.shared.cuvbc"),
    description: i18next.t("novels.directorAutoExecutionPlan.shared.a4hh4h"),
  },
];

function normalizePositiveInteger(value: string | number | undefined, fallback: number): number {
  const numericValue = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(numericValue) || numericValue < 1) {
    return fallback;
  }
  return Math.max(1, Math.round(numericValue));
}

function clampChapterOrder(value: number, maxChapterCount?: number | null): number {
  if (!maxChapterCount || maxChapterCount < 1) {
    return Math.max(1, value);
  }
  return Math.min(Math.max(1, value), Math.max(1, Math.round(maxChapterCount)));
}

export function createDefaultDirectorAutoExecutionDraftState(
  usage: DirectorAutoExecutionPlanUsage = "new_book",
): DirectorAutoExecutionDraftState {
  return {
    ...DEFAULT_DIRECTOR_AUTO_EXECUTION_DRAFT,
    mode: usage === "takeover" ? "book" : DEFAULT_DIRECTOR_AUTO_EXECUTION_DRAFT.mode,
  };
}

export function normalizeDirectorAutoExecutionDraftState(
  plan: DirectorAutoExecutionPlan | null | undefined,
): DirectorAutoExecutionDraftState {
  if (plan?.mode === "book") {
    return {
      mode: "book",
      startOrder: DEFAULT_DIRECTOR_AUTO_EXECUTION_DRAFT.startOrder,
      endOrder: DEFAULT_DIRECTOR_AUTO_EXECUTION_DRAFT.endOrder,
      volumeOrder: DEFAULT_DIRECTOR_AUTO_EXECUTION_DRAFT.volumeOrder,
      autoReview: plan.autoReview ?? true,
      autoRepair: plan.autoReview === false ? false : (plan.autoRepair ?? true),
    };
  }
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
    endOrder: String(normalizePositiveInteger(plan?.endOrder, 10)),
    autoReview: plan?.autoReview ?? true,
    autoRepair: plan?.autoReview === false ? false : (plan?.autoRepair ?? true),
  };
}

export function buildDirectorAutoExecutionPlanFromDraft(
  draft: DirectorAutoExecutionDraftState,
  options?: {
    usage?: DirectorAutoExecutionPlanUsage;
    maxChapterCount?: number | null;
  },
): DirectorAutoExecutionPlan {
  if (draft.mode === "book") {
    return {
      mode: "book",
      autoReview: draft.autoReview,
      autoRepair: draft.autoReview ? draft.autoRepair : false,
    };
  }
  if (draft.mode === "chapter_range") {
    const startOrder = clampChapterOrder(normalizePositiveInteger(draft.startOrder, 1), options?.maxChapterCount);
    const endOrder = Math.max(
      startOrder,
      clampChapterOrder(normalizePositiveInteger(draft.endOrder, 10), options?.maxChapterCount),
    );
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
      volumeOrder: options?.usage === "new_book" ? 1 : normalizePositiveInteger(draft.volumeOrder, 1),
      autoReview: draft.autoReview,
      autoRepair: draft.autoReview ? draft.autoRepair : false,
    };
  }
  const endOrder = clampChapterOrder(normalizePositiveInteger(draft.endOrder, 10), options?.maxChapterCount);
  return {
    mode: "chapter_range",
    startOrder: 1,
    endOrder,
    autoReview: draft.autoReview,
    autoRepair: draft.autoReview ? draft.autoRepair : false,
  };
}

export function buildDirectorAutoExecutionPlanLabel(
  plan: DirectorAutoExecutionPlan | null | undefined,
): string {
  if (plan?.mode === "book") {
    return i18next.t("dict.gen_3df555d4");
  }
  if (plan?.mode === "chapter_range") {
    const startOrder = normalizePositiveInteger(plan.startOrder, 1);
    const endOrder = Math.max(startOrder, normalizePositiveInteger(plan.endOrder, startOrder));
    if (startOrder === endOrder) {
      return i18next.t("autoDirector.directorRuntimeProjectionCard.vms598", { val1: startOrder });
    }
    return i18next.t("novels.bookPayoffLedgerCard.mv5rga", { val1: startOrder, val2: endOrder });
  }
  if (plan?.mode === "volume") {
    return i18next.t("novels.directorAutoExecutionPlan.shared.vmsd1h", { val1: normalizePositiveInteger(plan.volumeOrder, 1) });
  }
  return i18next.t("novels.directorAutoExecutionPlan.shared.7rlj0g", { val1: normalizePositiveInteger(plan?.endOrder, 10) });
}

export function buildTakeoverAutoExecutionDraftFromExecutableRange(
  executableRange: DirectorTakeoverExecutableRangeSnapshot | null | undefined,
  strategy: DirectorTakeoverStrategy = "continue_existing",
): DirectorAutoExecutionDraftState | null {
  if (!executableRange) {
    return null;
  }
  const preferredStartOrder = strategy === "continue_existing"
    ? executableRange.nextChapterOrder ?? executableRange.startOrder
    : executableRange.startOrder;
  const startOrder = Math.max(1, Math.round(preferredStartOrder));
  const endOrder = Math.max(startOrder, Math.round(executableRange.endOrder));
  return {
    ...createDefaultDirectorAutoExecutionDraftState("takeover"),
    mode: "chapter_range",
    startOrder: String(startOrder),
    endOrder: String(endOrder),
  };
}

interface DirectorAutoExecutionPlanFieldsProps {
  draft: DirectorAutoExecutionDraftState;
  onChange: (patch: Partial<DirectorAutoExecutionDraftState>) => void;
  usage?: DirectorAutoExecutionPlanUsage;
  maxChapterCount?: number | null;
}

export function DirectorAutoExecutionPlanFields({
  draft,
  onChange,
  usage = "new_book",
  maxChapterCount,
}: DirectorAutoExecutionPlanFieldsProps) {
  const { t } = useTranslation();
  const plan = buildDirectorAutoExecutionPlanFromDraft(draft, { usage, maxChapterCount });
  const scopeLabel = buildDirectorAutoExecutionPlanLabel(plan);
  const scopeOptions = usage === "takeover" ? TAKEOVER_SCOPE_OPTIONS : NEW_BOOK_SCOPE_OPTIONS;
  const canEditChapterCount = usage === "new_book" && draft.mode === "chapter_range";
  const canEditChapterRange = usage === "takeover" && draft.mode === "chapter_range";
  const canEditVolumeOrder = usage === "takeover" && draft.mode === "volume";
  const reviewLabel = draft.autoReview
    ? draft.autoRepair
      ? "正文后自动审核 + 自动修复"
      : "正文后自动审核，不自动修复"
    : "正文后不做自动审核与修复";

  return (
    <div className="mt-3 min-w-0 rounded-md border border-primary/15 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium text-foreground">{i18next.t("novels.directorAutoExecutionPlan.shared.tz39as")}</div>
        <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>当前将执行：{scopeLabel}</div>
      </div>

      <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-3">
        {scopeOptions.map((option) => {
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
              <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{option.description}</div>
            </button>
          );
        })}
      </div>

      {canEditChapterCount ? (
        <div className="mt-4 max-w-xs">
          <div className="text-xs font-medium text-foreground">{i18next.t("novels.directorAutoExecutionPlan.shared.g1jn9d")}</div>
          <Input
            className="mt-2"
            type="number"
            min={1}
            max={maxChapterCount ?? undefined}
            value={draft.endOrder}
            onChange={(event) => onChange({ endOrder: event.target.value })}
            placeholder={i18next.t("novels.directorAutoExecutionPlan.shared.wupwu0")}
          />
          {maxChapterCount ? (
            <div className="mt-1 text-xs text-muted-foreground">最多不超过全书规划的 {maxChapterCount} 章。</div>
          ) : null}
        </div>
      ) : null}

      {canEditChapterRange ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs font-medium text-foreground">{i18next.t("dict.gen_4f82436f")}</div>
            <Input
              className="mt-2"
              type="number"
              min={1}
              max={maxChapterCount ?? undefined}
              value={draft.startOrder}
              onChange={(event) => onChange({ startOrder: event.target.value })}
              placeholder={i18next.t("novels.directorAutoExecutionPlan.shared.wupwtz")}
            />
          </div>
          <div>
            <div className="text-xs font-medium text-foreground">{i18next.t("dict.gen_1024805a")}</div>
            <Input
              className="mt-2"
              type="number"
              min={1}
              max={maxChapterCount ?? undefined}
              value={draft.endOrder}
              onChange={(event) => onChange({ endOrder: event.target.value })}
              placeholder={i18next.t("novels.directorAutoExecutionPlan.shared.wupwt5")}
            />
          </div>
        </div>
      ) : null}

      {canEditVolumeOrder ? (
        <div className="mt-4 max-w-xs">
          <div className="text-xs font-medium text-foreground">{i18next.t("novels.directorAutoExecutionPlan.shared.coni7")}</div>
          <Input
            className="mt-2"
            type="number"
            min={1}
            value={draft.volumeOrder}
            onChange={(event) => onChange({ volumeOrder: event.target.value })}
            placeholder={i18next.t("novels.directorAutoExecutionPlan.shared.aea9pl")}
          />
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border bg-background/80 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="text-sm font-medium text-foreground">{i18next.t("novels.directorAutoExecutionPlan.shared.rjt1ce")}</div>
            <div className={`text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{i18next.t("novels.directorAutoExecutionPlan.shared.93nw9g")}</div>
          </div>
          <Switch
            checked={draft.autoReview}
            onCheckedChange={(checked) => onChange({
              autoReview: checked,
              autoRepair: checked ? draft.autoRepair : false,
            })}
            aria-label={i18next.t("novels.directorAutoExecutionPlan.shared.lcfoxi")}
          />
        </div>

        <div className="mt-4 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="text-sm font-medium text-foreground">{i18next.t("novels.directorAutoExecutionPlan.shared.4zx20g")}</div>
            <div className={`text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{i18next.t("novels.directorAutoExecutionPlan.shared.nv1nk9")}</div>
          </div>
          <Switch
            checked={draft.autoReview && draft.autoRepair}
            disabled={!draft.autoReview}
            onCheckedChange={(checked) => onChange({ autoRepair: checked })}
            aria-label={i18next.t("novels.directorAutoExecutionPlan.shared.lx07xs")}
          />
        </div>
      </div>

      <div className={`mt-3 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
        系统会按你选定的范围，自动准备节奏板、拆章和章节执行资源，再继续写作。
        当前质量策略：{reviewLabel}。
      </div>
    </div>
  );
}
