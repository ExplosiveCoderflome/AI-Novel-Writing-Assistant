import { Badge } from "@/components/ui/badge";

export interface TensionCurveVolumeContext {
  roleLabel?: string | null;
  coreReward?: string | null;
  escalationFocus?: string | null;
  planningMode?: "hard" | "soft" | null;
}

interface TensionCurveVolumeContextBarProps {
  volume?: TensionCurveVolumeContext | null;
}

function contextText(value: string | null | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

export function TensionCurveVolumeContextBar({ volume }: TensionCurveVolumeContextBarProps) {
  return (
    <div className="grid gap-3 rounded-xl border border-primary/15 bg-primary/5 p-3 text-sm lg:grid-cols-[auto_1fr_1fr_1fr] lg:items-start">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={volume?.planningMode === "hard" ? "secondary" : "outline"}>
          {volume?.planningMode === "hard" ? "硬规划" : "卷级定位"}
        </Badge>
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">这一卷的作用</div>
        <div className="mt-1 line-clamp-2 text-foreground">{contextText(volume?.roleLabel, "先参考当前卷标题和章节走向。")}</div>
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">读者应获得</div>
        <div className="mt-1 line-clamp-2 text-foreground">{contextText(volume?.coreReward, "调整曲线时优先保住本卷的核心回报。")}</div>
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">升级焦点</div>
        <div className="mt-1 line-clamp-2 text-foreground">{contextText(volume?.escalationFocus, "让高点服务于本卷最重要的推进。")}</div>
      </div>
    </div>
  );
}
