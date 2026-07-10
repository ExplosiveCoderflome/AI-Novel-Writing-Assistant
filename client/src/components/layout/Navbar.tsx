import { useLocation } from "react-router-dom";
import { PanelsTopLeft } from "lucide-react";
import LLMSelector from "@/components/common/LLMSelector";
import AppVersionBadge from "@/components/layout/AppVersionBadge";
import DesktopBrandMark from "@/components/layout/DesktopBrandMark";
import { Button } from "@/components/ui/button";
import {
  AUTO_DIRECTOR_MOBILE_CLASSES,
  shouldUseAutoDirectorMobileFullWidthContent,
} from "@/mobile/autoDirector";

interface NavbarProps {
  workspaceNavMode?: "workspace" | "project";
  onWorkspaceNavModeChange?: (mode: "workspace" | "project") => void;
}

export default function Navbar(props: NavbarProps) {
  const { workspaceNavMode, onWorkspaceNavModeChange } = props;
  const location = useLocation();
  const isHome = location.pathname === "/";
  const showWorkspaceToggle = Boolean(workspaceNavMode && onWorkspaceNavModeChange);
  const useMobileAutoDirectorShell = shouldUseAutoDirectorMobileFullWidthContent(location.pathname);

  return (
    <header className="novel-console-topbar flex h-16 min-w-0 items-center justify-between gap-3 border-b border-border/80 px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <DesktopBrandMark className="h-9 w-9 shrink-0 drop-shadow-none" />
        <div className="flex min-w-0 flex-col leading-tight">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-sm font-semibold text-foreground">宫寒小说导演控制台</span>
            <AppVersionBadge />
          </div>
          <span className="hidden truncate text-[11px] font-medium text-muted-foreground sm:block">
            Long-form Novel Production Console
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {!isHome && showWorkspaceToggle ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={
              useMobileAutoDirectorShell
                ? AUTO_DIRECTOR_MOBILE_CLASSES.navbarWorkspaceToggle
                : "border-primary/25 bg-card/80 text-primary shadow-sm hover:bg-accent/60"
            }
            onClick={() => onWorkspaceNavModeChange?.(workspaceNavMode === "workspace" ? "project" : "workspace")}
          >
            <PanelsTopLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {workspaceNavMode === "workspace" ? "项目导航" : "创作导航"}
          </Button>
        ) : null}
        <div className={useMobileAutoDirectorShell ? AUTO_DIRECTOR_MOBILE_CLASSES.navbarModelSelector : undefined}>
          <LLMSelector compact showBadge={false} showHelperText={false} />
        </div>
      </div>
    </header>
  );
}
