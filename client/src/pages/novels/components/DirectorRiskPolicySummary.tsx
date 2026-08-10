import type { DirectorRiskPolicy } from "@/api/directorRiskPolicy";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function DirectorRiskPolicySummary(props: {
  policy: DirectorRiskPolicy;
  source?: "global" | "novel";
  compact?: boolean;
  className?: string;
}) {
  const { policy, source, compact = false, className } = props;
  return (
    <div className={cn("rounded-lg border bg-muted/15 p-3", className)}>
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
        <span>本次风险规则</span>
        {source ? <Badge variant="outline">{source === "novel" ? "本书覆盖" : "全局默认"}</Badge> : null}
      </div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">
        达到 {policy.noticeThreshold} 分会提醒；达到 {policy.pauseThreshold} 分且影响全书时，会在当前安全节点后暂停。
      </div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">
        运行开始后，可在导演进度卡展开“风险事件记录”，查看每个问题的分数、原因、影响章节和处理动作。
      </div>
      {!compact ? <div className="mt-1 text-xs leading-5 text-muted-foreground">局部质量债会继续推进，并保留后续处理建议。</div> : null}
    </div>
  );
}
