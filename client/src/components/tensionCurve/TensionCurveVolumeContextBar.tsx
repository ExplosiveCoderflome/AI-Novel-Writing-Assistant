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
          {volume?.planningMode === "hard" ? "hard planning" : "volume-level positioning"}
        </Badge>
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">The function of this volume</div>
        <div className="mt-1 line-clamp-2 text-foreground">{contextText(volume?.roleLabel, "First refer to the current volume title and chapter direction.")}</div>
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">Readers should get</div>
        <div className="mt-1 line-clamp-2 text-foreground">{contextText(volume?.coreReward, "When adjusting the curve, prioritize preserving the core returns of this volume.")}</div>
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">Upgrade focus</div>
        <div className="mt-1 line-clamp-2 text-foreground">{contextText(volume?.escalationFocus, "Let the high points serve the most important thrust of the volume.")}</div>
      </div>
    </div>
  );
}
