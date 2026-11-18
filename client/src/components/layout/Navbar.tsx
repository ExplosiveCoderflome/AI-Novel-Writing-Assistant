import { useLocation } from "react-router-dom";
import { useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import LLMSelector from "@/components/common/LLMSelector";
import { useCreationSetup } from "@/components/onboarding/CreationSetupContext";
import AppVersionBadge from "@/components/layout/AppVersionBadge";
import BlgCelebration from "@/components/layout/BlgCelebration";
import DesktopBrandMark from "@/components/layout/DesktopBrandMark";
import LiveExecutionDialog from "@/components/liveExecution/LiveExecutionDialog";
import ProjectHomepageLink from "@/components/layout/ProjectHomepageLink";
import ThemeToggle from "@/components/theme/ThemeToggle";
import DesktopReleaseNotesDialog from "@/components/layout/DesktopReleaseNotesDialog";
import { Button } from "@/components/ui/button";
import {
  AUTO_DIRECTOR_MOBILE_CLASSES,
  shouldUseAutoDirectorMobileFullWidthContent,
} from "@/mobile/autoDirector";

interface NavbarProps {
  onOpenProjectNav?: () => void;
  workspaceNavMode?: "workspace" | "project";
  onWorkspaceNavModeChange?: (mode: "workspace" | "project") => void;
}

export default function Navbar(props: NavbarProps) {
  const { workspaceNavMode, onWorkspaceNavModeChange } = props;
  const { openModelSettings } = useCreationSetup();
  const location = useLocation();
  const isHome = location.pathname === "/";
  const showWorkspaceToggle = Boolean(workspaceNavMode && onWorkspaceNavModeChange);
  const useMobileAutoDirectorShell = shouldUseAutoDirectorMobileFullWidthContent(location.pathname);
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const brandClickTimesRef = useRef<number[]>([]);
  const handleBrandClick = () => {
    const now = Date.now();
    brandClickTimesRef.current = [...brandClickTimesRef.current.filter((time) => now - time < 2000), now];
    if (brandClickTimesRef.current.length >= 5) {
      brandClickTimesRef.current = [];
      setCelebrationOpen(true);
    }
  };

  return (
    <>
    <header className="flex h-16 min-w-0 items-center justify-between gap-3 border-b bg-background px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button type="button" aria-label="工作台标识" onClick={handleBrandClick} className="shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <DesktopBrandMark className="h-8 w-8 shrink-0 drop-shadow-none" />
        </button>
        <div className="flex min-w-0 flex-col leading-tight">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-sm font-semibold">AI 小说创作工作台</span>
            <AppVersionBadge />
            <DesktopReleaseNotesDialog />
            <ProjectHomepageLink />
          </div>
          <span className="hidden truncate text-[11px] text-muted-foreground sm:block">Biz Novel Studio</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {props.onOpenProjectNav ? <Button type="button" size="sm" variant="ghost" onClick={props.onOpenProjectNav}>全局菜单</Button> : null}
        {!isHome && showWorkspaceToggle ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={useMobileAutoDirectorShell ? AUTO_DIRECTOR_MOBILE_CLASSES.navbarWorkspaceToggle : undefined}
            onClick={() => onWorkspaceNavModeChange?.(workspaceNavMode === "workspace" ? "project" : "workspace")}
          >
            {workspaceNavMode === "workspace" ? "项目导航" : "创作导航"}
          </Button>
        ) : null}
        <LiveExecutionDialog />
        <ThemeToggle />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={openModelSettings}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden lg:inline">模型设置</span>
        </Button>
        <div className={useMobileAutoDirectorShell ? AUTO_DIRECTOR_MOBILE_CLASSES.navbarModelSelector : undefined}>
          <LLMSelector
            compact
            showBadge={false}
            showHelperText={false}
            showCompactTemperature
          />
        </div>
      </div>
    </header>
    <BlgCelebration open={celebrationOpen} onClose={() => setCelebrationOpen(false)} />
    </>
  );
}
