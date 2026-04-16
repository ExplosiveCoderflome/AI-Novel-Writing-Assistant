import { Suspense, useEffect, useMemo, useState } from "react";
import { matchPath, Outlet, useLocation } from "react-router-dom";
import AppRouteFallback from "./AppRouteFallback";
import Navbar from "./Navbar";
import NovelWorkspaceRail from "./NovelWorkspaceRail";
import Sidebar from "./Sidebar";
import TaskRecoveryDialog from "./TaskRecoveryDialog";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "ai-novel.sidebar.collapsed";
const WORKSPACE_RAIL_COLLAPSED_STORAGE_KEY = "ai-novel.workspace-rail.collapsed";

export default function AppLayout() {
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isWorkspaceRailCollapsed, setIsWorkspaceRailCollapsed] = useState(false);
  const [workspaceNavMode, setWorkspaceNavMode] = useState<"workspace" | "project">("project");

  const workspaceRoute = useMemo(() => {
    const editMatch = matchPath("/novels/:id/edit", location.pathname);
    if (editMatch?.params.id) {
      return {
        novelId: editMatch.params.id,
        chapterId: "",
      };
    }
    const chapterMatch = matchPath("/novels/:id/chapters/:chapterId", location.pathname);
    if (chapterMatch?.params.id) {
      return {
        novelId: chapterMatch.params.id,
        chapterId: chapterMatch.params.chapterId ?? "",
      };
    }
    return null;
  }, [location.pathname]);

  const isNovelWorkspace = Boolean(workspaceRoute?.novelId);

  useEffect(() => {
    const storedValue = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    setIsSidebarCollapsed(storedValue === "true");
    const workspaceRailValue = window.localStorage.getItem(WORKSPACE_RAIL_COLLAPSED_STORAGE_KEY);
    setIsWorkspaceRailCollapsed(workspaceRailValue === "true");
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(WORKSPACE_RAIL_COLLAPSED_STORAGE_KEY, String(isWorkspaceRailCollapsed));
  }, [isWorkspaceRailCollapsed]);

  useEffect(() => {
    setWorkspaceNavMode(isNovelWorkspace ? "workspace" : "project");
  }, [isNovelWorkspace, location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        workspaceNavMode={isNovelWorkspace ? workspaceNavMode : undefined}
        onWorkspaceNavModeChange={isNovelWorkspace ? setWorkspaceNavMode : undefined}
      />
      <div className="flex min-h-[calc(100vh-4rem)]">
        {isNovelWorkspace && workspaceNavMode === "workspace" && workspaceRoute ? (
          <NovelWorkspaceRail
            novelId={workspaceRoute.novelId}
            chapterId={workspaceRoute.chapterId}
            collapsed={isWorkspaceRailCollapsed}
            onToggle={() => setIsWorkspaceRailCollapsed((current) => !current)}
            onSwitchToProjectNav={() => setWorkspaceNavMode("project")}
          />
        ) : (
          <Sidebar
            collapsed={isSidebarCollapsed}
            onToggle={() => setIsSidebarCollapsed((current) => !current)}
          />
        )}
        <main className="h-[calc(100vh-4rem)] flex-1 overflow-y-auto p-6">
          <Suspense fallback={<AppRouteFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <TaskRecoveryDialog />
    </div>
  );
}
