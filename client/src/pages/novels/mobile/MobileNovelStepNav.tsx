import {
  NOVEL_WORKSPACE_FLOW_STEPS,
  NOVEL_WORKSPACE_TOOL_TABS,
  normalizeNovelWorkspaceTab,
  type NovelWorkspaceTab,
} from "../novelWorkspaceNavigation";
import { cn } from "@/lib/utils";
import { buildMobileNovelWorkspaceSteps } from "./mobileNovelWorkspaceUtils";

interface MobileNovelStepNavProps {
  activeTab: string;
  workflowCurrentTab?: string | null;
  onSelectTab: (tab: NovelWorkspaceTab) => void;
}

export default function MobileNovelStepNav(props: MobileNovelStepNavProps) {
  const { activeTab, workflowCurrentTab, onSelectTab } = props;
  const normalizedActiveTab = normalizeNovelWorkspaceTab(activeTab);
  const normalizedWorkflowTab = normalizeNovelWorkspaceTab(workflowCurrentTab ?? normalizedActiveTab);
  const steps = buildMobileNovelWorkspaceSteps({
    activeTab: normalizedActiveTab,
    workflowCurrentTab: normalizedWorkflowTab,
    steps: [...NOVEL_WORKSPACE_FLOW_STEPS, ...NOVEL_WORKSPACE_TOOL_TABS],
  });

  return (
    <nav className="-mx-3 overflow-x-auto px-3 pb-1" aria-label="小说创作步骤">
      <div className="flex min-w-max gap-2">
        {steps.map((step) => (
          <button
            key={step.key}
            type="button"
            onClick={() => onSelectTab(step.key)}
            aria-current={step.isActive ? "page" : undefined}
            className={cn(
              "relative rounded-full border px-3 py-2 text-xs font-medium transition-colors",
              step.isActive
                ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                : step.isRecommended
                  ? "border-sky-200 bg-sky-50 text-sky-800"
                  : "border-border/80 bg-background text-muted-foreground",
            )}
          >
            {step.label}
            {step.isRecommended ? (
              <span className="ml-1 rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] text-white">建议</span>
            ) : null}
          </button>
        ))}
      </div>
    </nav>
  );
}
