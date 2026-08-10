import i18next from "i18next";
import type { CreativeHubNovelSetupStatus } from "@ai-novel/shared/types/creativeHub";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CreativeHubNovelSetupCardProps {
  setup: CreativeHubNovelSetupStatus;
  actionDisabled?: boolean;
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
      return "border-success/30 bg-success/5 text-success";
    case "partial":
      return "border-warning/30 bg-warning/5 text-warning";
    default:
      return "border-border bg-muted/20 text-muted-foreground";
  }
}

export default function CreativeHubNovelSetupCard({
  setup,
  actionDisabled = false,
  onQuickAction,
}: CreativeHubNovelSetupCardProps) {
  const pendingItems = setup.checklist.filter((item) => item.status !== "ready");

  return (
    <div className="space-y-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground">{i18next.t("creativeHub.setupInfo", "开书信息")}</div>
        <Badge variant="outline">{stageLabel(setup.stage)}</Badge>
      </div>

      <div className="rounded-md border border-border bg-muted/20 p-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">{setup.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              已就绪 {setup.completedCount}/{setup.totalCount} 项
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold text-foreground">{setup.completionRatio}%</div>
            <div className="text-[11px] text-muted-foreground">{i18next.t("creativeHub.completion", "完成度")}</div>
          </div>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={i18next.t("creativeHub.creativeHubNovelSetupCard.eqabqq")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={setup.completionRatio}
          aria-valuetext={`开书信息完成 ${setup.completionRatio}%`}
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${setup.completionRatio}%` }}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        {setup.checklist.map((item) => (
          <div
            key={item.key}
            className={cn("rounded-md border px-3 py-2", itemTone(item.status))}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">{item.label}</div>
              <div className="flex items-center gap-2 text-[11px]">
                {item.requiredForProduction ? (
                  <span className="rounded-md border border-current/20 bg-background/70 px-2 py-0.5">{i18next.t("creativeHub.creativeHubNovelSetupCard.t0565h")}</span>
                ) : null}
                <span>
                  {item.status === "ready" ? "已就绪" : item.status === "partial" ? "待补充" : "缺失"}
                </span>
              </div>
            </div>
            {item.currentValue ? (
              <div className="mt-1 text-[11px] text-muted-foreground">当前：{item.currentValue}</div>
            ) : null}
            <div className="mt-1 text-xs leading-5">{item.summary}</div>
            {item.status !== "ready" && (item.recommendedAction || item.optionPrompt) ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {item.recommendedAction ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={actionDisabled}
                    onClick={() => onQuickAction?.(item.recommendedAction!)}
                  >{i18next.t("creativeHub.creativeHubNovelSetupCard.koicl")}</Button>
                ) : null}
                {item.optionPrompt ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={actionDisabled}
                    onClick={() => onQuickAction?.(item.optionPrompt!)}
                  >{i18next.t("creativeHub.creativeHubNovelSetupCard.gerube")}</Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {pendingItems.length > 0 ? (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
          <div className="text-xs font-medium text-warning">{i18next.t("creativeHub.creativeHubNovelSetupCard.o6akae")}</div>
          <div className="mt-2 text-sm leading-6 text-foreground">
            {pendingItems.slice(0, 4).map((item) => item.label).join("、")}
            {pendingItems.length > 4 ? " 等" : ""}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={actionDisabled}
              onClick={() => onQuickAction?.("总结当前小说进入整本生产前仍需确认的条件，并按优先级给出补齐顺序。")}
            >{i18next.t("creativeHub.creativeHubNovelSetupCard.y0ve7r")}</Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={actionDisabled}
              onClick={() => onQuickAction?.("根据当前小说信息，为生产前缺失的关键条件各给出 3 个备选答案，方便我逐项选择。")}
            >{i18next.t("creativeHub.creativeHubNovelSetupCard.kvp4ts")}</Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-md border border-info/30 bg-info/5 p-3">
        <div className="text-xs font-medium text-info">{i18next.t("creativeHub.creativeHubNovelSetupCard.vhpgmq")}</div>
        <div className="mt-2 text-sm leading-6 text-foreground">{setup.nextQuestion}</div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={actionDisabled}
          onClick={() => onQuickAction?.(setup.recommendedAction)}
        >{i18next.t("creativeHub.creativeHubNovelSetupCard.qkqtai")}</Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={actionDisabled}
          onClick={() => onQuickAction?.("总结当前这本书的初始化完成度，并告诉我还缺哪些关键信息。")}
        >{i18next.t("creativeHub.creativeHubNovelSetupCard.fyoy1h")}</Button>
      </div>
    </div>
  );
}
