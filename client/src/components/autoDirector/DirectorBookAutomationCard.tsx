import type {
  DirectorBookAutomationAction,
  DirectorBookAutomationProjection,
} from "@ai-novel/shared/types/directorRuntime";
import { LayoutDashboard } from "lucide-react";
import AICockpit from "./AICockpit";
import { Button } from "@/components/ui/button";

interface DirectorBookAutomationCardProps {
  projection: DirectorBookAutomationProjection | null | undefined;
  fallbackSummary?: string | null;
  fallbackStatusLabel?: string | null;
  compact?: boolean;
  onOpenProgress?: () => void;
  onOpenTaskCenter: () => void;
  onSwitchToProjectNav?: () => void;
}

export default function DirectorBookAutomationCard({
  projection,
  fallbackSummary,
  fallbackStatusLabel,
  compact = false,
  onOpenProgress,
  onOpenTaskCenter,
  onSwitchToProjectNav,
}: DirectorBookAutomationCardProps) {
  const effectiveProjection = projection?.status === "cancelled" ? null : projection;
  const handleAction = (_projection: DirectorBookAutomationProjection, action: DirectorBookAutomationAction) => {
    if (action.type === "open_details") {
      onOpenTaskCenter();
      return;
    }
    onOpenProgress?.();
  };

  return (
    <div className="space-y-2">
      <AICockpit
        projection={effectiveProjection}
        mode={compact ? "compact" : "focusedNovel"}
        fallbackSummary={fallbackSummary}
        fallbackStatusLabel={fallbackStatusLabel}
        onAction={handleAction}
        onOpenDetails={effectiveProjection?.latestTask ? () => onOpenTaskCenter() : undefined}
        onOpenNovel={() => onOpenProgress?.()}
        onOpenFallbackDetails={onOpenProgress ?? onOpenTaskCenter}
      />
      {onSwitchToProjectNav ? (
        <Button type="button" size="sm" variant="ghost" className="w-full" onClick={onSwitchToProjectNav}>
          <LayoutDashboard className="h-4 w-4" />
          项目导航
        </Button>
      ) : null}
    </div>
  );
}
