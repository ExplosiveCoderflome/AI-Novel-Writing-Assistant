import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  PayoffLedgerItem,
  PayoffLedgerResponse,
  StoryStateSnapshot,
} from "@ai-novel/shared/types/novel";
import CollapsibleSummary from "./CollapsibleSummary";

interface BookPayoffLedgerCardProps {
  latestStateSnapshot?: StoryStateSnapshot | null;
  payoffLedger?: PayoffLedgerResponse | null;
}

function payoffStatusLabel(status: string): string {
  switch (status) {
    case "setup":
      return i18next.t("novels.bookPayoffLedgerCard.e72kl");
    case "hinted":
      return i18next.t("novels.bookPayoffLedgerCard.e90ik");
    case "pending_payoff":
      return i18next.t("novels.bookPayoffLedgerCard.ef04d");
    case "paid_off":
      return i18next.t("novels.bookPayoffLedgerCard.e6pai");
    case "failed":
      return i18next.t("novels.bookPayoffLedgerCard.e73jd");
    case "overdue":
      return i18next.t("novels.bookPayoffLedgerCard.egh03");
    default:
      return status || "未知";
  }
}

function payoffStatusVariant(status: string): "default" | "secondary" | "outline" {
  switch (status) {
    case "paid_off":
      return "default";
    case "failed":
      return "secondary";
    default:
      return "outline";
  }
}

function payoffStatusTone(status: string): string {
  if (status === "overdue") {
    return "border-amber-300 bg-amber-50 text-amber-900";
  }
  if (status === "paid_off") {
    return "border-emerald-300 bg-emerald-50 text-emerald-900";
  }
  if (status === "failed") {
    return "border-slate-300 bg-slate-100 text-slate-700";
  }
  return "";
}

function formatWindow(item: PayoffLedgerItem): string {
  if (
    typeof item.targetStartChapterOrder === "number"
    && typeof item.targetEndChapterOrder === "number"
  ) {
    return i18next.t("novels.bookPayoffLedgerCard.mv5rga", { val1: item.targetStartChapterOrder, val2: item.targetEndChapterOrder });
  }
  if (typeof item.targetEndChapterOrder === "number") {
    return i18next.t("novels.bookPayoffLedgerCard.avv58i", { val1: item.targetEndChapterOrder });
  }
  if (typeof item.targetStartChapterOrder === "number") {
    return i18next.t("novels.bookPayoffLedgerCard.dg7q7x", { val1: item.targetStartChapterOrder });
  }
  return i18next.t("novels.bookPayoffLedgerCard.fu1v8");
}

function scopeLabel(scopeType: PayoffLedgerItem["scopeType"]): string {
  if (scopeType === "book") {
    return i18next.t("dict.gen_3df555d4");
  }
  if (scopeType === "volume") {
    return i18next.t("novels.bookPayoffLedgerCard.ew40");
  }
  return i18next.t("dict.gen_9290b644");
}

function sourceSummary(item: PayoffLedgerItem): string {
  const labels = item.sourceRefs
    .map((source) => source.refLabel?.trim())
    .filter(Boolean)
    .slice(0, 3);
  return labels.length > 0 ? labels.join(" / ") : "暂无来源摘要";
}

export default function BookPayoffLedgerCard(props: BookPayoffLedgerCardProps) {
  const { t } = useTranslation();
  const { latestStateSnapshot, payoffLedger } = props;
  const ledgerItems = payoffLedger?.items ?? [];
  const ledgerSummary = payoffLedger?.summary;
  const snapshotForeshadows = latestStateSnapshot?.foreshadowStates ?? [];
  const pendingForeshadows = snapshotForeshadows.filter(
    (item) => item.status !== "paid_off" && item.status !== "failed",
  );
  const paidOffForeshadows = snapshotForeshadows.filter((item) => item.status === "paid_off");
  const failedForeshadows = snapshotForeshadows.filter((item) => item.status === "failed");
  const hasCanonicalLedgerContent = ledgerItems.length > 0;
  const hasSnapshotContent = snapshotForeshadows.length > 0 || Boolean(latestStateSnapshot?.summary?.trim());

  return (
    <Card>
      <CardContent className="p-0">
        <details className="group">
          <summary className="cursor-pointer list-none p-5">
            <CollapsibleSummary
              title={i18next.t("novels.bookPayoffLedgerCard.kn3m3d")}
              description={i18next.t("novels.bookPayoffLedgerCard.4zk6c9")}
              collapsedLabel="展开全书账本"
              expandedLabel="收起全书账本"
              meta={(
                <>
                  <Badge variant="outline">待兑现 {ledgerSummary?.pendingCount ?? 0}</Badge>
                  <Badge variant={ledgerSummary?.urgentCount ? "secondary" : "outline"}>
                    紧急 {ledgerSummary?.urgentCount ?? 0}
                  </Badge>
                  <Badge variant={ledgerSummary?.overdueCount ? "secondary" : "outline"}>
                    逾期 {ledgerSummary?.overdueCount ?? 0}
                  </Badge>
                  <Badge variant="outline">已回收 {ledgerSummary?.paidOffCount ?? 0}</Badge>
                </>
              )}
            />
          </summary>

          <div className="space-y-3 border-t border-border/70 px-5 pb-5 pt-4">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-foreground">Canonical 伏笔账本</div>
                <Badge variant="outline">{ledgerItems.length}</Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{i18next.t("novels.bookPayoffLedgerCard.hux4st")}</div>
              <div className="mt-3 space-y-2 text-sm">
                {hasCanonicalLedgerContent ? (
                  ledgerItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-border/70 bg-background p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-foreground">{item.title}</div>
                        <Badge
                          variant={payoffStatusVariant(item.currentStatus)}
                          className={cn(payoffStatusTone(item.currentStatus))}
                        >
                          {payoffStatusLabel(item.currentStatus)}
                        </Badge>
                        <Badge variant="outline">{scopeLabel(item.scopeType)}</Badge>
                        <Badge variant="outline">{formatWindow(item)}</Badge>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">{item.summary}</div>
                      <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                        <div>
                          最近触碰：
                          {typeof item.lastTouchedChapterOrder === "number"
                            ? i18next.t("autoDirector.directorRuntimeProjectionCard.vms598", { val1: item.lastTouchedChapterOrder })
                            : "暂无"}
                        </div>
                        <div>来源摘要：{sourceSummary(item)}</div>
                        <div>
                          风险信号：
                          {item.riskSignals.length > 0
                            ? ` ${item.riskSignals
                              .slice(0, 2)
                              .map((signal) => signal.summary)
                              .join("；")}`
                            : " 暂无"}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border/70 bg-background p-3 text-xs text-muted-foreground">{i18next.t("novels.bookPayoffLedgerCard.2qll7d")}</div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-foreground">{i18next.t("novels.bookPayoffLedgerCard.h931at")}</div>
                <Badge variant="outline">{snapshotForeshadows.length}</Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{i18next.t("novels.bookPayoffLedgerCard.gavhnc")}</div>
              {latestStateSnapshot?.summary ? (
                <div className="mt-3 rounded-lg border border-border/70 bg-background p-3 text-xs text-muted-foreground">
                  {latestStateSnapshot.summary}
                </div>
              ) : null}
              <div className="mt-3 space-y-3 text-sm">
                {hasSnapshotContent ? (
                  <>
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">{i18next.t("novels.bookPayoffLedgerCard.eolcx")}</div>
                      {pendingForeshadows.length > 0 ? (
                        pendingForeshadows.slice(0, 5).map((item) => (
                          <div
                            key={item.id}
                            className="rounded-lg border border-border/70 bg-background p-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-medium text-foreground">{item.title}</div>
                              <Badge variant={payoffStatusVariant(item.status)}>
                                {payoffStatusLabel(item.status)}
                              </Badge>
                            </div>
                            {item.summary ? (
                              <div className="mt-1 text-xs text-muted-foreground">{item.summary}</div>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-lg border border-dashed border-border/70 bg-background p-3 text-xs text-muted-foreground">{i18next.t("novels.bookPayoffLedgerCard.2tec25")}</div>
                      )}
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-border/70 bg-background p-3">
                        <div className="text-xs text-muted-foreground">{i18next.t("novels.bookPayoffLedgerCard.e6pai")}</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">
                          {paidOffForeshadows.length}
                        </div>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-background p-3">
                        <div className="text-xs text-muted-foreground">{i18next.t("novels.bookPayoffLedgerCard.e73jd")}</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">
                          {failedForeshadows.length}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-border/70 bg-background p-3 text-xs text-muted-foreground">{i18next.t("novels.bookPayoffLedgerCard.y722x")}</div>
                )}
              </div>
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
