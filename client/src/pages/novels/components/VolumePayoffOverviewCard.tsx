import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PayoffLedgerItem, PayoffLedgerResponse, StoryStateSnapshot, VolumePlan } from "@ai-novel/shared/types/novel";

interface VolumePayoffOverviewCardProps {
  selectedVolume: VolumePlan;
  latestStateSnapshot?: StoryStateSnapshot | null;
  payoffLedger?: PayoffLedgerResponse | null;
}

function normalizePayoffText(value: string): string {
  return value.trim().toLowerCase().replace(/[\s，,。、“”"'：:；;！!？?\-—_()（）]/g, "");
}

function isLikelySamePayoff(left: string, right: string): boolean {
  const normalizedLeft = normalizePayoffText(left);
  const normalizedRight = normalizePayoffText(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  return normalizedLeft === normalizedRight
    || normalizedLeft.includes(normalizedRight)
    || normalizedRight.includes(normalizedLeft);
}

function payoffStatusLabel(status: string): string {
  switch (status) {
    case "setup":
      return "已埋设";
    case "hinted":
      return "已提示";
    case "pending_payoff":
      return "待回收";
    case "paid_off":
      return "已回收";
    case "failed":
      return "已失效";
    case "overdue":
      return "已逾期";
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
  if (typeof item.targetStartChapterOrder === "number" && typeof item.targetEndChapterOrder === "number") {
    return `第 ${item.targetStartChapterOrder}-${item.targetEndChapterOrder} 章`;
  }
  if (typeof item.targetEndChapterOrder === "number") {
    return `最晚第 ${item.targetEndChapterOrder} 章`;
  }
  if (typeof item.targetStartChapterOrder === "number") {
    return `从第 ${item.targetStartChapterOrder} 章开始`;
  }
  return "未限定";
}

function sourceSummary(item: PayoffLedgerItem): string {
  const labels = item.sourceRefs
    .map((source) => source.refLabel?.trim())
    .filter(Boolean)
    .slice(0, 3);
  return labels.length > 0 ? labels.join(" / ") : "暂无来源摘要";
}

export default function VolumePayoffOverviewCard(props: VolumePayoffOverviewCardProps) {
  const { selectedVolume, latestStateSnapshot, payoffLedger } = props;
  const chapterPayoffGroups = selectedVolume.chapters
    .map((chapter) => ({
      chapterId: chapter.id,
      chapterOrder: chapter.chapterOrder,
      chapterTitle: chapter.title?.trim() || "未命名章节",
      refs: chapter.payoffRefs.map((item) => item.trim()).filter(Boolean),
    }))
    .filter((chapter) => chapter.refs.length > 0);
  const chapterPayoffEntries = chapterPayoffGroups.flatMap((chapter) => (
    chapter.refs.map((ref) => ({
      ref,
      chapterOrder: chapter.chapterOrder,
      chapterTitle: chapter.chapterTitle,
    }))
  ));
  const openPayoffRows = selectedVolume.openPayoffs
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => ({
      item,
      linkedChapters: chapterPayoffEntries.filter((entry) => isLikelySamePayoff(item, entry.ref)),
    }));
  const unplannedOpenPayoffs = openPayoffRows.filter((item) => item.linkedChapters.length === 0);
  const snapshotForeshadows = latestStateSnapshot?.foreshadowStates ?? [];
  const pendingForeshadows = snapshotForeshadows.filter((item) => item.status !== "paid_off" && item.status !== "failed");
  const paidOffForeshadows = snapshotForeshadows.filter((item) => item.status === "paid_off");
  const failedForeshadows = snapshotForeshadows.filter((item) => item.status === "failed");

  const ledgerItems = payoffLedger?.items ?? [];
  const ledgerSummary = payoffLedger?.summary;
  const hasCanonicalLedgerContent = ledgerItems.length > 0;
  const hasChapterPayoffContent = chapterPayoffGroups.length > 0;
  const hasOpenPayoffContent = openPayoffRows.length > 0;
  const hasSnapshotContent = snapshotForeshadows.length > 0 || Boolean(latestStateSnapshot?.summary?.trim());
  const shouldHighlightChapterPayoffs = !hasCanonicalLedgerContent && hasChapterPayoffContent && !hasOpenPayoffContent && !hasSnapshotContent;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="text-base">伏笔 / 回收概览</CardTitle>
            <div className="text-sm text-muted-foreground">
              顶部主视图优先看 canonical 账本，下面三块只作为原始来源参考，帮助核对卷战略、拆章安排和状态快照有没有脱节。
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">待兑现 {ledgerSummary?.pendingCount ?? openPayoffRows.length}</Badge>
            <Badge variant={ledgerSummary?.urgentCount ? "secondary" : "outline"}>紧急 {ledgerSummary?.urgentCount ?? 0}</Badge>
            <Badge variant={ledgerSummary?.overdueCount ? "secondary" : "outline"}>逾期 {ledgerSummary?.overdueCount ?? 0}</Badge>
            <Badge variant="outline">已回收 {ledgerSummary?.paidOffCount ?? paidOffForeshadows.length}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium text-foreground">Canonical 伏笔账本</div>
            <Badge variant="outline">{ledgerItems.length}</Badge>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            这里只有系统已经归并过的 canonical 伏笔项，后续规划、写作、审查和修复会优先消费这里，不再只盯某一处原始字段。
          </div>
          <div className="mt-3 space-y-2 text-sm">
            {hasCanonicalLedgerContent ? ledgerItems.map((item) => (
              <div key={item.id} className="rounded-lg border border-border/70 bg-background p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium text-foreground">{item.title}</div>
                  <Badge variant={payoffStatusVariant(item.currentStatus)} className={cn(payoffStatusTone(item.currentStatus))}>
                    {payoffStatusLabel(item.currentStatus)}
                  </Badge>
                  <Badge variant="outline">{formatWindow(item)}</Badge>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">{item.summary}</div>
                <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                  <div>最近触碰: {item.lastTouchedChapterOrder ? `第 ${item.lastTouchedChapterOrder} 章` : "暂无"}</div>
                  <div>来源摘要: {sourceSummary(item)}</div>
                  <div>
                    风险信号:
                    {item.riskSignals.length > 0
                      ? ` ${item.riskSignals.slice(0, 2).map((signal) => signal.summary).join("；")}`
                      : " 暂无"}
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-lg border border-dashed border-border/70 bg-background p-3 text-xs text-muted-foreground">
                当前还没有生成可用的 canonical 伏笔账本。首次进入老项目时，系统会懒同步这份账本；如果现在仍为空，说明相关规划 / 状态材料还不够。
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">原始来源参考</div>
          <div
            className={cn(
              "grid gap-3",
              shouldHighlightChapterPayoffs
                ? "xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.9fr)]"
                : "xl:grid-cols-3",
            )}
          >
            <div
              className={cn(
                "rounded-xl border border-border/70 bg-muted/20 p-4",
                shouldHighlightChapterPayoffs && "xl:order-2",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-foreground">本卷未兑现事项</div>
                <Badge variant="outline">{openPayoffRows.length}</Badge>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                {openPayoffRows.length > 0 ? openPayoffRows.map((item) => (
                  <div key={item.item} className="rounded-lg border border-border/70 bg-background p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-foreground">{item.item}</div>
                      <Badge variant={item.linkedChapters.length > 0 ? "default" : "secondary"}>
                        {item.linkedChapters.length > 0 ? "已安排章节触碰" : "未安排具体章节"}
                      </Badge>
                    </div>
                    {item.linkedChapters.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {item.linkedChapters.map((entry) => (
                          <span key={`${item.item}-${entry.chapterOrder}-${entry.ref}`} className="rounded-full border border-border/70 px-2 py-1">
                            第{entry.chapterOrder}章 {entry.chapterTitle}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-muted-foreground">
                        这条未兑现事项还没有挂到本卷具体章节，建议在拆章时补上兑现关联。
                      </div>
                    )}
                  </div>
                )) : (
                  <div className="rounded-lg border border-dashed border-border/70 bg-background p-3 text-xs text-muted-foreground">
                    当前卷还没有填写未兑现事项。
                  </div>
                )}
              </div>
            </div>

            <div
              className={cn(
                "rounded-xl border border-border/70 bg-muted/20 p-4",
                shouldHighlightChapterPayoffs && "xl:order-1 xl:row-span-2",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-foreground">本卷章节兑现安排</div>
                <Badge variant="outline">{chapterPayoffGroups.length}</Badge>
              </div>
              <div className="mt-3 space-y-2 text-sm">
                {chapterPayoffGroups.length > 0 ? chapterPayoffGroups.map((chapter) => (
                  <div key={chapter.chapterId} className="rounded-lg border border-border/70 bg-background p-3">
                    <div className="font-medium text-foreground">
                      第{chapter.chapterOrder}章 {chapter.chapterTitle}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {chapter.refs.map((ref) => (
                        <span key={`${chapter.chapterId}-${ref}`} className="rounded-full border border-border/70 px-2 py-1">
                          {ref}
                        </span>
                      ))}
                    </div>
                  </div>
                )) : (
                  <div className="rounded-lg border border-dashed border-border/70 bg-background p-3 text-xs text-muted-foreground">
                    当前卷章节还没有填写兑现关联，后续拆章时会更难核对哪些铺垫该回收。
                  </div>
                )}
              </div>
            </div>

            <div
              className={cn(
                "rounded-xl border border-border/70 bg-muted/20 p-4",
                shouldHighlightChapterPayoffs && "xl:order-3",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-foreground">最新状态快照</div>
                <Badge variant="outline">{snapshotForeshadows.length}</Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                这里显示的是全书最新状态，不只限当前卷，用来辅助判断整体回收压力。
              </div>
              {latestStateSnapshot?.summary ? (
                <div className="mt-3 rounded-lg border border-border/70 bg-background p-3 text-xs text-muted-foreground">
                  {latestStateSnapshot.summary}
                </div>
              ) : null}
              <div className="mt-3 space-y-3 text-sm">
                {snapshotForeshadows.length > 0 ? (
                  <>
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">待跟进</div>
                      {pendingForeshadows.length > 0 ? pendingForeshadows.slice(0, 5).map((item) => (
                        <div key={item.id} className="rounded-lg border border-border/70 bg-background p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-medium text-foreground">{item.title}</div>
                            <Badge variant={payoffStatusVariant(item.status)}>{payoffStatusLabel(item.status)}</Badge>
                          </div>
                          {item.summary ? <div className="mt-1 text-xs text-muted-foreground">{item.summary}</div> : null}
                        </div>
                      )) : (
                        <div className="rounded-lg border border-dashed border-border/70 bg-background p-3 text-xs text-muted-foreground">
                          当前没有待跟进的伏笔状态。
                        </div>
                      )}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-border/70 bg-background p-3">
                        <div className="text-xs text-muted-foreground">已回收</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">{paidOffForeshadows.length}</div>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-background p-3">
                        <div className="text-xs text-muted-foreground">已失效</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">{failedForeshadows.length}</div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-border/70 bg-background p-3 text-xs text-muted-foreground">
                    还没有可用的伏笔状态快照，先执行章节生成 / 审计后，这里的状态会逐步充实。
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
