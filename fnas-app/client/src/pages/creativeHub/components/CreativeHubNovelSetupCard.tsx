import type { CreativeHubNovelSetupStatus } from "@ai-novel/shared/types/creativeHub";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CreativeHubNovelSetupCardProps {
  setup: CreativeHubNovelSetupStatus;
  onQuickAction?: (prompt: string) => void;
}

function stageLabel(stage: CreativeHubNovelSetupStatus["stage"]): string {
  switch (stage) {
    case "ready_for_production":
      return "可进入生产";
    case "ready_for_planning":
      return "可进入规划";
    default:
      return "初始化中";
  }
}

function itemTone(status: "missing" | "partial" | "ready"): string {
  switch (status) {
    case "ready":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "partial":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

export default function CreativeHubNovelSetupCard({
  setup,
  onQuickAction,
}: CreativeHubNovelSetupCardProps) {
  const pendingItems = setup.checklist.filter((item) => item.status !== "ready");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-slate-500">新书初始化</div>
        <Badge variant="outline">{stageLabel(setup.stage)}</Badge>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-slate-900">{setup.title}</div>
            <div className="mt-1 text-xs text-slate-500">
              已就绪 {setup.completedCount}/{setup.totalCount} 项
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold text-slate-900">{setup.completionRatio}%</div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-slate-500">progress</div>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-slate-900 transition-all"
            style={{ width: `${setup.completionRatio}%` }}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        {setup.checklist.map((item) => (
          <div
            key={item.key}
            className={cn("rounded-xl border px-3 py-2", itemTone(item.status))}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">{item.label}</div>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em]">
                {item.requiredForProduction ? (
                  <span className="rounded-full border border-current/20 bg-white/70 px-2 py-0.5 tracking-normal">
                    生产前确认
                  </span>
                ) : null}
                <span>
                  {item.status === "ready" ? "ready" : item.status === "partial" ? "partial" : "missing"}
                </span>
              </div>
            </div>
            {item.currentValue ? (
              <div className="mt-1 text-[11px] text-slate-500">当前：{item.currentValue}</div>
            ) : null}
            <div className="mt-1 text-xs leading-5">{item.summary}</div>
            {item.status !== "ready" && (item.recommendedAction || item.optionPrompt) ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {item.recommendedAction ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onQuickAction?.(item.recommendedAction!)}
                  >
                    补这项
                  </Button>
                ) : null}
                {item.optionPrompt ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onQuickAction?.(item.optionPrompt!)}
                  >
                    给我备选
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {pendingItems.length > 0 ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-amber-700">生产前待确认</div>
          <div className="mt-2 text-sm leading-6 text-slate-900">
            {pendingItems.slice(0, 4).map((item) => item.label).join("、")}
            {pendingItems.length > 4 ? " 等" : ""}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => onQuickAction?.("总结当前小说进入整本生产前仍需确认的条件，并按优先级给出补齐顺序。")}
            >
              生成确认清单
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onQuickAction?.("根据当前小说信息，为生产前缺失的关键条件各给出 3 个备选答案，方便我逐项选择。")}
            >
              批量给我备选
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-sky-700">下一问</div>
        <div className="mt-2 text-sm leading-6 text-slate-900">{setup.nextQuestion}</div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => onQuickAction?.(setup.recommendedAction)}
        >
          按引导继续
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onQuickAction?.("总结当前这本书的初始化完成度，并告诉我还缺哪些关键信息。")}
        >
          查看初始化摘要
        </Button>
      </div>
    </div>
  );
}
