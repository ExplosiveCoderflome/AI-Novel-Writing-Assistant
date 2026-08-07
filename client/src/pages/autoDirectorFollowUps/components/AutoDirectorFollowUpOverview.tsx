import type { AutoDirectorFollowUpListResponse, AutoDirectorFollowUpOverview } from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { AutoDirectorFollowUpSection } from "@ai-novel/shared/types/autoDirectorValidation";
import { TaskQueueSection } from "@/components/taskQueue";
import { workspaceToneSurfaceClass, type WorkspaceTone } from "@/components/workspace";
import { cn } from "@/lib/utils";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

interface OverviewCardConfig {
  section: AutoDirectorFollowUpSection | "";
  label: string;
  description: string;
  count: number;
  tone: WorkspaceTone;
}

interface AutoDirectorFollowUpOverviewCardsProps {
  overview: AutoDirectorFollowUpOverview | null;
  list: AutoDirectorFollowUpListResponse | null;
  activeSection: AutoDirectorFollowUpSection | "";
  onSectionChange: (section: AutoDirectorFollowUpSection | "") => void;
}

export function AutoDirectorFollowUpOverviewCards({
  overview,
  list,
  activeSection,
  onSectionChange,
}: AutoDirectorFollowUpOverviewCardsProps) {
  const counters = list?.countersBySection ?? overview?.countersBySection;
  const reasonCounters = overview?.countersByReason ?? list?.countersByReason;
  const blockingExceptionCount = (reasonCounters?.manual_recovery_required ?? 0)
    + (reasonCounters?.runtime_failed ?? 0);
  const pendingIncludesReplan = (reasonCounters?.replan_required ?? 0) > 0;
  const cards: OverviewCardConfig[] = [
    {
      section: "",
      label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      description: "View all directing tasks that require follow-up",
      count: overview?.totalCount ?? list?.pagination.total ?? 0,
      tone: "neutral",
    },
    {
      section: "needs_validation",
      label: "Need to verify",
      description: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      count: counters?.needs_validation ?? 0,
      tone: "danger",
    },
    {
      section: "exception",
      label: "Exception and recovery",
      description: blockingExceptionCount > 0 ? "Failure or manual recovery needs to be dealt with first" : "Canceled records can be restored on demand",
      count: counters?.exception ?? 0,
      tone: blockingExceptionCount > 0 ? "danger" : "neutral", }, { section: "pending", label: "pending", description: pendingIncludesReplan ? "Contains replanning that must be processed first" : "Nodes that need confirmation or continuation", count: counters?.pending ?? 0, tone: pendingIncludesReplan ? "danger" : "info", }, { section: "auto_progress", label: "auto-progress", description: "Tasks currently progressing and recent auto-progress records", count: counters?.auto_progress ?? 0, tone: "info", }, { section: "replaced", label: "replaced", description: "Old task taken over by new task", count: counters?.replaced ?? 0, tone: "neutral", }, ]; return (
    <div className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpOverviewGrid}>
      <TaskQueueSection
        title="Follow up partition"
        description={`今日恢复 ${list?.summaryCounters.recoveredToday ?? 0} 项，今日完成 ${list?.summaryCounters.completedToday ?? 0} 项；阻塞、待操作与自动推进分开处理。`}
        className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpOverviewCard}
      >
          <div className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpOverviewSectionGrid}>
            {cards.map((card) => (
              <button
                key={card.section || "all"}
                type="button"
                aria-pressed={activeSection === card.section}
                onClick={() => onSectionChange(card.section)}
                className={cn(
                  "h-full min-w-0 rounded-md border p-3 text-left transition hover:border-primary/50",
                  workspaceToneSurfaceClass[card.tone],
                  activeSection === card.section && "border-primary bg-primary/5",
                )}
              >
                <div className="text-sm font-medium">{card.label}</div>
                <div className="mt-1 text-xl font-semibold leading-none">{card.count}</div>
                <div className={`mt-1 text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                  {card.description}
                </div>
              </button>
            ))}
          </div>
      </TaskQueueSection>
    </div>
  );
}
