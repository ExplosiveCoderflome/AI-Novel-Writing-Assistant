import { useEffect, useMemo, useRef, useState } from "react";

const SLOT_KIND_LABELS: Record<string, string> = {
  replace: "改写",
  append: "追加约束",
  choice: "选项",
  toggle: "开关",
  token: "内联值",
};
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { getNovelList } from "@/api/novel/core";
import {
  adoptSlots,
  deleteSlotOverride,
  getSlotOverrides,
  getSlotReconcile,
  keepMySlots,
  saveSlotOverride,
  type PromptCatalogItem,
  type PromptSlotDef,
  type PromptSlotDefChoice,
  type PromptSlotDefToggle,
  type PromptSlotOverrideEntry,
  type PromptSlotOverrideScope,
  type PromptSlotOverrideView,
  type PromptSlotReconcileItem,
  type PromptSlotReconcileResult,
} from "@/api/promptWorkbench";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildOverrideParamsKey(promptId: string, novelId: string): string {
  return JSON.stringify({ promptId, novelId: novelId || undefined });
}

function buildReconcileParamsKey(promptId: string, scope: PromptSlotOverrideScope, novelId: string): string {
  return JSON.stringify({ promptId, scope, novelId: novelId || undefined });
}

function getSlotDefault(def: PromptSlotDef): string | boolean {
  return def.default;
}

function getEffectiveValue(
  def: PromptSlotDef,
  overrideEntry: PromptSlotOverrideEntry | undefined,
): string | boolean {
  if (overrideEntry !== undefined) return overrideEntry.value;
  return getSlotDefault(def);
}

function isDefaultValue(def: PromptSlotDef, value: string | boolean): boolean {
  return value === getSlotDefault(def);
}

// ─── Kind-specific controls ───────────────────────────────────────────────────

function SlotControlReplace({
  def,
  value,
  disabled,
  onChange,
}: {
  def: PromptSlotDef & { kind: "replace" };
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  const remaining = (def.maxLength ?? 2000) - value.length;
  return (
    <div className="space-y-1.5">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={def.maxLength ?? 2000}
        rows={3}
        className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{remaining < 0 ? <span className="text-destructive">{remaining}</span> : remaining} 字剩余</span>
        {def.requiredTokens && def.requiredTokens.length > 0 && (
          <span>需保留：{def.requiredTokens.join("、")}</span>
        )}
      </div>
    </div>
  );
}

function SlotControlAppend({
  def,
  value,
  disabled,
  onChange,
}: {
  def: PromptSlotDef & { kind: "append" };
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  const remaining = (def.maxLength ?? 4000) - value.length;
  return (
    <div className="space-y-1.5">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={def.maxLength ?? 4000}
        rows={4}
        placeholder={def.placeholderHint ?? "追加到提示词末尾的自定义约束，留空则不追加任何内容。"}
        className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
      <div className="text-right text-xs text-muted-foreground">
        {remaining < 0 ? <span className="text-destructive">{remaining}</span> : remaining} 字剩余
      </div>
    </div>
  );
}

function SlotControlChoice({
  def,
  value,
  disabled,
  onChange,
}: {
  def: PromptSlotDefChoice;
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {def.options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
            value === opt.value
              ? "border-primary bg-primary/8 text-foreground ring-1 ring-primary"
              : "border-border bg-background hover:bg-muted/50",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <div className="font-medium">{opt.label}</div>
          <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{opt.copy}</div>
        </button>
      ))}
    </div>
  );
}

function SlotControlToggle({
  def,
  value,
  disabled,
  onChange,
}: {
  def: PromptSlotDefToggle;
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={value}
          disabled={disabled}
          onClick={() => onChange(!value)}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
            value ? "bg-primary" : "bg-input",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition-transform",
              value ? "translate-x-5" : "translate-x-0.5",
            )}
          />
        </button>
        <span className="text-sm font-medium text-foreground">{value ? "已启用" : "已关闭"}</span>
      </div>
      {value && (
        <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          启用后追加：{def.copy}
        </div>
      )}
    </div>
  );
}

function SlotControlToken({
  def,
  value,
  disabled,
  onChange,
}: {
  def: PromptSlotDef & { kind: "token" };
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        maxLength={def.maxLength ?? 80}
        placeholder={def.patternHint ? `格式：${def.patternHint}` : ""}
        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
      {def.patternHint && (
        <div className="text-xs text-muted-foreground">期望格式：{def.patternHint}</div>
      )}
    </div>
  );
}

// ─── Reconcile overlay ────────────────────────────────────────────────────────

function ReconcileStateBadge({ state }: { state: PromptSlotReconcileItem["state"] }) {
  if (state === "unchanged") return null;
  const configs = {
    drifted: { label: "原文已更新", className: "bg-amber-100 text-amber-800 border-amber-200" },
    new: { label: "新增槽位", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    orphaned: { label: "槽位已移除", className: "bg-red-100 text-red-800 border-red-200" },
  };
  const config = configs[state];
  return (
    <span className={cn("rounded border px-1.5 py-0.5 text-xs font-medium", config.className)}>
      {config.label}
    </span>
  );
}

function DriftedDetail({
  item,
  onAdopt,
  onKeep,
  pending,
}: {
  item: PromptSlotReconcileItem;
  onAdopt: () => void;
  onKeep: () => void;
  pending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-amber-900">
          提示词出厂文案已更新，你的覆盖值基于旧版本。
          {item.changelog && <span className="ml-1 text-amber-700">更新说明：{item.changelog}</span>}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-xs text-amber-700 hover:underline"
        >
          {expanded ? "收起" : "查看对比"}
        </button>
      </div>
      {expanded && (
        <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
          <div className="rounded border border-amber-200 bg-white/60 p-2">
            <div className="mb-1 font-semibold text-muted-foreground">官方新版</div>
            <pre className="whitespace-pre-wrap text-foreground">{String(item.defaultCurrent)}</pre>
          </div>
          <div className="rounded border border-amber-200 bg-white/60 p-2">
            <div className="mb-1 font-semibold text-muted-foreground">我的值</div>
            <pre className="whitespace-pre-wrap text-foreground">{String(item.overrideValue ?? "")}</pre>
          </div>
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onAdopt} disabled={pending}>
          采用官方新版
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onKeep} disabled={pending}>
          保留我的，消提醒
        </Button>
      </div>
    </div>
  );
}

// ─── Reconcile banner ────────────────────────────────────────────────────────

function ReconcileBanner({
  reconcile,
  onAdoptAll,
  onKeepAll,
  pending,
}: {
  reconcile: PromptSlotReconcileResult;
  onAdoptAll: () => void;
  onKeepAll: () => void;
  pending: boolean;
}) {
  if (!reconcile.hasDrift) return null;
  const parts: string[] = [];
  if (reconcile.driftedCount > 0) parts.push(`${reconcile.driftedCount} 处文案已更新`);
  if (reconcile.newCount > 0) parts.push(`${reconcile.newCount} 个新槽位`);
  if (reconcile.orphanedCount > 0) parts.push(`${reconcile.orphanedCount} 个槽位已移除`);

  return (
    <div className="flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm text-amber-900">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>{parts.join("；")}，需要你确认处理方式。</span>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" className="h-7 border-amber-300 text-xs hover:bg-amber-100" onClick={onAdoptAll} disabled={pending}>
          全部采用官方
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onKeepAll} disabled={pending}>
          全部保留我的
        </Button>
      </div>
    </div>
  );
}

// ─── Single slot row ──────────────────────────────────────────────────────────

function SlotRow({
  def,
  overrideEntry,
  reconcileItem,
  draftValue,
  disabled,
  onDraftChange,
  onResetToDefault,
  onAdopt,
  onKeep,
  reconcilePending,
}: {
  def: PromptSlotDef;
  overrideEntry: PromptSlotOverrideEntry | undefined;
  reconcileItem: PromptSlotReconcileItem | undefined;
  draftValue: string | boolean | undefined;
  disabled?: boolean;
  onDraftChange: (key: string, value: string | boolean) => void;
  onResetToDefault: (key: string) => void;
  onAdopt: (key: string) => void;
  onKeep: (key: string) => void;
  reconcilePending: boolean;
}) {
  const effectiveValue = draftValue !== undefined ? draftValue : getEffectiveValue(def, overrideEntry);
  const isDirty = draftValue !== undefined && draftValue !== getEffectiveValue(def, overrideEntry);
  const isSavedOverride = overrideEntry !== undefined;
  const isDefault = isDefaultValue(def, effectiveValue);
  const isDrifted = reconcileItem?.state === "drifted";
  const isOrphaned = reconcileItem?.state === "orphaned";

  return (
    <div className={cn(
      "rounded-md border p-4 transition-colors",
      isDrifted && "border-amber-300 bg-amber-50/40",
      isOrphaned && "border-red-200 bg-red-50/30 opacity-75",
    )}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{def.label}</span>
            <Badge variant="outline" className="text-xs font-normal text-muted-foreground" title={def.kind}>
              {SLOT_KIND_LABELS[def.kind] ?? def.kind}
            </Badge>
            {isSavedOverride && !isDefault && (
              <Badge variant="secondary" className="text-xs">已覆盖</Badge>
            )}
            {isDirty && (
              <Badge variant="secondary" className="border-blue-200 bg-blue-100 text-xs text-blue-700">
                未保存
              </Badge>
            )}
            {reconcileItem && <ReconcileStateBadge state={reconcileItem.state} />}
          </div>
          {def.description && (
            <p className="mt-1 text-xs text-muted-foreground">{def.description}</p>
          )}
          {def.anchor && (
            <p className="mt-0.5 text-xs text-muted-foreground">锚点：<code className="rounded bg-muted px-1">{def.anchor}</code></p>
          )}
        </div>
        {!isDefault && !isOrphaned && (
          <button
            type="button"
            onClick={() => onResetToDefault(def.key)}
            disabled={disabled}
            title="恢复为出厂默认值"
            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {!isOrphaned && (
        <>
          {def.kind === "replace" && (
            <SlotControlReplace
              def={def}
              value={effectiveValue as string}
              disabled={disabled}
              onChange={(v) => onDraftChange(def.key, v)}
            />
          )}
          {def.kind === "append" && (
            <SlotControlAppend
              def={def}
              value={effectiveValue as string}
              disabled={disabled}
              onChange={(v) => onDraftChange(def.key, v)}
            />
          )}
          {def.kind === "choice" && (
            <SlotControlChoice
              def={def as PromptSlotDefChoice}
              value={effectiveValue as string}
              disabled={disabled}
              onChange={(v) => onDraftChange(def.key, v)}
            />
          )}
          {def.kind === "toggle" && (
            <SlotControlToggle
              def={def as PromptSlotDefToggle}
              value={effectiveValue as boolean}
              disabled={disabled}
              onChange={(v) => onDraftChange(def.key, v)}
            />
          )}
          {def.kind === "token" && (
            <SlotControlToken
              def={def}
              value={effectiveValue as string}
              disabled={disabled}
              onChange={(v) => onDraftChange(def.key, v)}
            />
          )}
        </>
      )}

      {isOrphaned && (
        <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          该槽位已从提示词中移除。点击「采用官方新版」清除此覆盖。
          <Button size="sm" variant="outline" className="ml-3 h-6 text-xs" onClick={() => onAdopt(def.key)} disabled={reconcilePending}>
            采用官方（清除覆盖）
          </Button>
        </div>
      )}

      {isDrifted && reconcileItem && (
        <DriftedDetail
          item={reconcileItem}
          onAdopt={() => onAdopt(def.key)}
          onKeep={() => onKeep(def.key)}
          pending={reconcilePending}
        />
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

type ScopeTab = "global" | "novel";

export function PromptSlotPanel({ prompt }: { prompt: PromptCatalogItem }) {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<ScopeTab>("global");
  const [selectedNovelId, setSelectedNovelId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string | boolean>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showReconcile, setShowReconcile] = useState(false);
  const prevPromptId = useRef(prompt.id);

  // Reset drafts when prompt changes
  useEffect(() => {
    if (prevPromptId.current !== prompt.id) {
      prevPromptId.current = prompt.id;
      setDrafts({});
      setSaveError(null);
      setShowReconcile(false);
    }
  }, [prompt.id]);

  const activeNovelId = scope === "novel" ? selectedNovelId : "";

  const overrideParamsKey = useMemo(
    () => buildOverrideParamsKey(prompt.id, activeNovelId),
    [prompt.id, activeNovelId],
  );

  const reconcileParamsKey = useMemo(
    () => buildReconcileParamsKey(prompt.id, scope, activeNovelId),
    [prompt.id, scope, activeNovelId],
  );

  const novelsQuery = useQuery({
    queryKey: queryKeys.novels.list(1, 50),
    queryFn: () => getNovelList({ page: 1, limit: 50 }),
    staleTime: 60_000,
  });

  const overrideQuery = useQuery({
    queryKey: queryKeys.promptWorkbench.slotOverrides(overrideParamsKey),
    queryFn: () => getSlotOverrides({ promptId: prompt.id, novelId: activeNovelId || undefined }),
    enabled: prompt.slotSupported,
    staleTime: 15_000,
  });

  const reconcileQuery = useQuery({
    queryKey: queryKeys.promptWorkbench.slotReconcile(reconcileParamsKey),
    queryFn: () => getSlotReconcile({
      promptId: prompt.id,
      scope,
      novelId: activeNovelId || undefined,
    }),
    enabled: prompt.slotSupported && showReconcile,
    staleTime: 30_000,
  });

  const overrides: PromptSlotOverrideView[] = overrideQuery.data?.data ?? [];
  const scopeOverride = overrides.find((row) => {
    if (scope === "global") return row.scope === "global";
    return row.scope === "novel" && row.novelId === activeNovelId;
  });
  const slotMap: Record<string, PromptSlotOverrideEntry> = scopeOverride?.slots ?? {};

  const reconcile: PromptSlotReconcileResult | null = reconcileQuery.data?.data ?? null;
  const reconcileMap: Record<string, PromptSlotReconcileItem> = useMemo(() => {
    if (!reconcile) return {};
    return Object.fromEntries(reconcile.items.map((item) => [item.key, item]));
  }, [reconcile]);

  const hasDrift = reconcile?.hasDrift ?? false;
  const driftCount = (reconcile?.driftedCount ?? 0) + (reconcile?.newCount ?? 0) + (reconcile?.orphanedCount ?? 0);

  const invalidateOverride = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.promptWorkbench.slotOverrides(overrideParamsKey) });
  };
  const invalidateReconcile = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.promptWorkbench.slotReconcile(reconcileParamsKey) });
  };

  const saveMutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) =>
      saveSlotOverride({
        scope,
        novelId: scope === "novel" ? activeNovelId : null,
        promptId: prompt.id,
        slotUpdates: updates,
      }),
    onSuccess: () => {
      setSaveError(null);
      setDrafts({});
      invalidateOverride();
      invalidateReconcile();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "保存失败，请重试。";
      setSaveError(message);
    },
  });

  const resetMutation = useMutation({
    mutationFn: (slotKeys: string[]) =>
      deleteSlotOverride({
        scope,
        novelId: scope === "novel" ? activeNovelId : null,
        promptId: prompt.id,
        slotKeys,
      }),
    onSuccess: () => {
      invalidateOverride();
      invalidateReconcile();
    },
  });

  const adoptMutation = useMutation({
    mutationFn: (slotKeys: string[]) =>
      adoptSlots({
        promptId: prompt.id,
        scope,
        novelId: scope === "novel" ? activeNovelId : null,
        slotKeys,
      }),
    onSuccess: () => {
      invalidateOverride();
      invalidateReconcile();
    },
  });

  const keepMutation = useMutation({
    mutationFn: (slotKeys: string[]) =>
      keepMySlots({
        promptId: prompt.id,
        scope,
        novelId: scope === "novel" ? activeNovelId : null,
        slotKeys,
      }),
    onSuccess: () => {
      invalidateReconcile();
    },
  });

  const reconcilePending = adoptMutation.isPending || keepMutation.isPending;
  const novels = novelsQuery.data?.data?.items ?? [];
  const slotDefs = prompt.slots ?? [];
  const hasDirtyDrafts = Object.keys(drafts).length > 0;

  function handleDraftChange(key: string, value: string | boolean) {
    setDrafts((prev) => ({ ...prev, [key]: value }));
    setSaveError(null);
  }

  function handleResetToDefault(key: string) {
    // Remove draft for this key; if there's a saved override, delete it
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (slotMap[key] !== undefined) {
      resetMutation.mutate([key]);
    }
  }

  function handleSave() {
    if (!hasDirtyDrafts) return;
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(drafts)) {
      updates[key] = value;
    }
    saveMutation.mutate(updates);
  }

  function handleAdoptAll() {
    if (!reconcile) return;
    const keys = reconcile.items
      .filter((item) => item.state === "drifted" || item.state === "orphaned")
      .map((item) => item.key);
    if (keys.length > 0) adoptMutation.mutate(keys);
  }

  function handleKeepAll() {
    if (!reconcile) return;
    const keys = reconcile.items
      .filter((item) => item.state === "drifted")
      .map((item) => item.key);
    if (keys.length > 0) keepMutation.mutate(keys);
  }

  if (!prompt.slotSupported) {
    return (
      <div className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">
        这个提示词暂未声明可编辑槽位，尚不支持细节定制。
      </div>
    );
  }

  const isNovelScopeDisabled = scope === "novel" && !activeNovelId;

  return (
    <div className="space-y-4">
      {/* Scope banner */}
      <div className="rounded-md border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          生效优先级
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          出厂默认值 → 全局覆盖 → 本书覆盖（本书优先）。修改后即时预览，保存后下次真实生成时生效。
        </p>
      </div>

      {/* Scope tabs + novel picker */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex rounded-md border bg-muted/40 p-0.5">
          {(["global", "novel"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => { setScope(tab); setDrafts({}); setSaveError(null); }}
              className={cn(
                "rounded px-4 py-1.5 text-sm font-medium transition-colors",
                scope === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab === "global" ? "全局" : "本书"}
            </button>
          ))}
        </div>

        {scope === "novel" && (
          <select
            value={selectedNovelId}
            onChange={(e) => { setSelectedNovelId(e.target.value); setDrafts({}); setSaveError(null); }}
            className="h-9 min-w-52 rounded-md border bg-background px-3 text-sm"
          >
            <option value="">选择小说</option>
            {novels.map((novel) => (
              <option key={novel.id} value={novel.id}>
                {novel.title || novel.id}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Reconcile toggle */}
      {scope !== "novel" || activeNovelId ? (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowReconcile((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {showReconcile ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showReconcile ? "隐藏更新检测" : "检测是否有出厂文案更新"}
            {hasDrift && (
              <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                ⟳ {driftCount}
              </span>
            )}
          </button>
          {showReconcile && (
            <button
              type="button"
              onClick={() => { invalidateReconcile(); reconcileQuery.refetch(); }}
              disabled={reconcileQuery.isFetching}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", reconcileQuery.isFetching && "animate-spin")} />
            </button>
          )}
        </div>
      ) : null}

      {/* Reconcile banner */}
      {showReconcile && reconcile && (
        <ReconcileBanner
          reconcile={reconcile}
          onAdoptAll={handleAdoptAll}
          onKeepAll={handleKeepAll}
          pending={reconcilePending}
        />
      )}

      {/* Novel scope disabled hint */}
      {isNovelScopeDisabled && (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          选择小说后可设置本书独立的槽位覆盖。
        </div>
      )}

      {/* Slot list */}
      {!isNovelScopeDisabled && (
        <div className="space-y-3">
          {overrideQuery.isLoading ? (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">加载覆盖记录中...</div>
          ) : (
            slotDefs.map((def) => (
              <SlotRow
                key={def.key}
                def={def}
                overrideEntry={slotMap[def.key]}
                reconcileItem={reconcileMap[def.key]}
                draftValue={drafts[def.key]}
                disabled={saveMutation.isPending || resetMutation.isPending}
                onDraftChange={handleDraftChange}
                onResetToDefault={handleResetToDefault}
                onAdopt={(key) => adoptMutation.mutate([key])}
                onKeep={(key) => keepMutation.mutate([key])}
                reconcilePending={reconcilePending}
              />
            ))
          )}
        </div>
      )}

      {/* Save bar */}
      {!isNovelScopeDisabled && (
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            {saveError && (
              <div className="flex items-start gap-2 text-sm text-destructive">
                <X className="mt-0.5 h-4 w-4 shrink-0" />
                {saveError}
              </div>
            )}
            {saveMutation.isSuccess && (
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <Sparkles className="h-4 w-4" />
                保存成功，下次生成时生效。
              </div>
            )}
            {!saveError && !saveMutation.isSuccess && hasDirtyDrafts && (
              <div className="text-xs text-muted-foreground">
                {Object.keys(drafts).length} 个槽位有未保存改动。
              </div>
            )}
          </div>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!hasDirtyDrafts || saveMutation.isPending}
            className="shrink-0"
          >
            <Save className="mr-2 h-4 w-4" />
            {saveMutation.isPending ? "保存中..." : "保存覆盖"}
          </Button>
        </div>
      )}
    </div>
  );
}
