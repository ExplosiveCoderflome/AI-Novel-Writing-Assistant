import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
          {volume?.planningMode === "hard" ? t("gen.components.tensionCurve.TensionCurveVolumeContextBar.gen_d916b0ab") : t("gen.components.tensionCurve.TensionCurveVolumeContextBar.gen_095a2ee3")}
        </Badge>
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{t("gen.components.tensionCurve.TensionCurveVolumeContextBar.gen_5d7cba14")}</div>
        <div className="mt-1 line-clamp-2 text-foreground">{t("gen.components.tensionCurve.TensionCurveVolumeContextBar.gen_4df8b60a")}</div>
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{t("gen.components.tensionCurve.TensionCurveVolumeContextBar.gen_362ff30e")}</div>
        <div className="mt-1 line-clamp-2 text-foreground">{t("gen.components.tensionCurve.TensionCurveVolumeContextBar.gen_5ed222b7")}</div>
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{t("gen.components.tensionCurve.TensionCurveVolumeContextBar.gen_c3d70e9e")}</div>
        <div className="mt-1 line-clamp-2 text-foreground">{t("gen.components.tensionCurve.TensionCurveVolumeContextBar.gen_660b87b7")}</div>
      </div>
    </div>
  );
}
