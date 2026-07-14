import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpenText,
  Braces,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Database,
  Globe2,
  House,
  LayoutDashboard,
  ListTodo,
  MonitorPlay,
  Route,
  SquareStack,
  ScanSearch,
  Settings2,
  ShieldCheck,
  SquarePen,
  Tags,
  UsersRound,
  Video,
  WandSparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { listKnowledgeDocuments } from "@/api/knowledge";
import { queryKeys } from "@/api/queryKeys";
import { getAutoDirectorFollowUpOverview } from "@/api/autoDirectorFollowUps";
import { getTaskOverview } from "@/api/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  disabled?: boolean;
}

interface NavGroup {
  titleKey: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    titleKey: "sidebar.groupCreative",
    items: [
      { to: "/", labelKey: "sidebar.home", icon: House },
      { to: "/help", labelKey: "sidebar.help", icon: CircleHelp },
      { to: "/novels", labelKey: "sidebar.novels", icon: BookOpenText },
      { to: "/drama", labelKey: "sidebar.drama", icon: MonitorPlay, disabled: true },
      { to: "/comic", labelKey: "sidebar.comic", icon: SquareStack },
      { to: "/video", labelKey: "sidebar.video", icon: Video },
      { to: "/creative-hub", labelKey: "sidebar.creativeHub", icon: LayoutDashboard },
      { to: "/book-analysis", labelKey: "sidebar.bookAnalysis", icon: ScanSearch },
      { to: "/tasks", labelKey: "sidebar.tasks", icon: ListTodo },
      { to: "/auto-director/follow-ups", labelKey: "sidebar.autoDirector", icon: Workflow },
    ],
  },
  {
    titleKey: "sidebar.groupAssets",
    items: [
      { to: "/genres", labelKey: "sidebar.genres", icon: Tags },
      { to: "/story-modes", labelKey: "sidebar.storyModes", icon: Workflow },
      { to: "/titles", labelKey: "sidebar.titles", icon: SquarePen },
      { to: "/knowledge", labelKey: "sidebar.knowledge", icon: Database },
      { to: "/worlds", labelKey: "sidebar.worlds", icon: Globe2 },
      { to: "/style-engine", labelKey: "sidebar.styleEngine", icon: WandSparkles },
      { to: "/anti-ai-rules", labelKey: "sidebar.antiAiRules", icon: ShieldCheck },
      { to: "/base-characters", labelKey: "sidebar.baseCharacters", icon: UsersRound },
    ],
  },
  {
    titleKey: "sidebar.groupSystem",
    items: [
      { to: "/prompt-workbench", labelKey: "sidebar.prompts", icon: Braces },
      { to: "/settings/model-routes", labelKey: "sidebar.modelRoutes", icon: Route },
      { to: "/settings", labelKey: "sidebar.settings", icon: Settings2 },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { t } = useTranslation();
  const [badgeQueriesEnabled, setBadgeQueriesEnabled] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setBadgeQueriesEnabled(true), 500);
    return () => window.clearTimeout(timer);
  }, []);

  const taskQuery = useQuery({
    queryKey: queryKeys.tasks.overview,
    queryFn: getTaskOverview,
    enabled: badgeQueriesEnabled,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const overview = query.state.data?.data;
      return (overview?.queuedCount ?? 0) > 0 || (overview?.runningCount ?? 0) > 0 ? 4000 : false;
    },
  });

  const knowledgeQuery = useQuery({
    queryKey: queryKeys.knowledge.documents("sidebar"),
    queryFn: () => listKnowledgeDocuments(),
    enabled: badgeQueriesEnabled,
    staleTime: 30_000,
  });

  const autoDirectorFollowUpQuery = useQuery({
    queryKey: queryKeys.autoDirectorFollowUps.overview,
    queryFn: getAutoDirectorFollowUpOverview,
    enabled: badgeQueriesEnabled,
    refetchInterval: (query) => {
      const totalCount = query.state.data?.data?.totalCount ?? 0;
      return totalCount > 0 ? 4000 : false;
    },
  });

  const runningTaskCount = taskQuery.data?.data?.runningCount ?? 0;
  const failedTaskCount = taskQuery.data?.data?.failedCount ?? 0;
  const autoDirectorFollowUpCount = autoDirectorFollowUpQuery.data?.data?.totalCount ?? 0;
  const knowledgeDocuments = knowledgeQuery.data?.data ?? [];
  const failedIndexCount = knowledgeDocuments.filter((item) => item.latestIndexStatus === "failed").length;

  const renderBadge = (to: string) => {
    if (to === "/comic") {
      if (collapsed) {
        return null;
      }
      return (
        <Badge
          variant="outline"
          className="ml-auto h-5 border-amber-300 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700"
          title={t("gen.components.layout.Sidebar.gen_2729e0da")}
        >
          Beta
        </Badge>
      );
    }

    if (to === "/tasks") {
      if (runningTaskCount <= 0 && failedTaskCount <= 0) {
        return null;
      }
      return (
        <div className={cn("flex items-center gap-1", collapsed ? "absolute right-1 top-1" : "ml-auto")}>
          {runningTaskCount > 0 ? (
            <Badge
              variant="secondary"
              className={cn("h-5 px-1.5 text-[10px]", collapsed && "h-4 min-w-4 px-1 text-[9px]")}
            >
              {collapsed ? runningTaskCount : `R${runningTaskCount}`}
            </Badge>
          ) : null}
          {failedTaskCount > 0 ? (
            <Badge
              variant="destructive"
              className={cn("h-5 px-1.5 text-[10px]", collapsed && "h-4 min-w-4 px-1 text-[9px]")}
            >
              {collapsed ? failedTaskCount : `F${failedTaskCount}`}
            </Badge>
          ) : null}
        </div>
      );
    }

    if (to === "/auto-director/follow-ups" && autoDirectorFollowUpCount > 0) {
      return (
        <Badge
          variant="destructive"
          className={cn(
            "h-5 px-1.5 text-[10px]",
            collapsed ? "absolute right-1 top-1 h-4 min-w-4 px-1 text-[9px]" : "ml-auto",
          )}
        >
          {autoDirectorFollowUpCount}
        </Badge>
      );
    }

    if (to === "/knowledge" && failedIndexCount > 0) {
      return (
        <Badge
          variant="destructive"
          className={cn(
            "h-5 px-1.5 text-[10px]",
            collapsed ? "absolute right-1 top-1 h-4 min-w-4 px-1 text-[9px]" : "ml-auto",
          )}
        >
          {collapsed ? failedIndexCount : `F${failedIndexCount}`}
        </Badge>
      );
    }

    return null;
  };

  return (
    <aside
      className={cn(
        "border-r bg-muted/20 p-3 transition-[width] duration-200",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      <div className={cn("mb-4 flex items-center", collapsed ? "justify-center" : "justify-end")}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={onToggle}
          aria-label={collapsed ? t("sidebar.expandNavigation") : t("sidebar.collapseNavigation")}
          title={collapsed ? t("sidebar.expandNavigation") : t("sidebar.collapseNavigation")}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <nav className="space-y-4">
        {navGroups.map((group) => {
          const groupTitle = t(group.titleKey);
          return (
            <div key={group.titleKey} className="space-y-1">
              {!collapsed ? (
                <div className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
                  {groupTitle}
                </div>
              ) : (
                <div className="mx-auto h-px w-8 bg-border/70" />
              )}

              {group.items.map((item) => {
                const Icon = item.icon;
                const isNovelEntry = item.to === "/novels";
                const itemLabel = t(item.labelKey);

                if (item.disabled) {
                  return (
                    <div
                      key={item.to}
                      title={collapsed ? itemLabel : t("sidebar.comingSoon")}
                      className={cn(
                        "relative flex cursor-not-allowed items-center rounded-md text-sm opacity-40",
                        collapsed ? "justify-center px-2 py-2.5" : "py-2 pl-4 pr-2",
                      )}
                    >
                      <Icon className={cn("h-[18px] w-[18px] shrink-0", collapsed ? "mx-auto" : "mr-3")} />
                      {!collapsed ? (
                        <span className="truncate">{itemLabel}</span>
                      ) : null}
                      {!collapsed ? (
                        <span className="ml-auto text-[10px] text-muted-foreground/60">{t("sidebar.comingSoon")}</span>
                      ) : null}
                    </div>
                  );
                }

                return (
                  <NavLink key={item.to} to={item.to} title={collapsed ? itemLabel : undefined}>
                    {({ isActive }) => (
                      <div
                        className={cn(
                          "relative flex items-center rounded-md text-sm transition-colors",
                          collapsed ? "justify-center px-2 py-2.5" : "py-2 pl-4 pr-2",
                          isActive
                            ? "bg-accent/90 font-semibold text-accent-foreground"
                            : "text-foreground hover:bg-accent hover:text-accent-foreground",
                          isNovelEntry && !collapsed && (isActive ? "ring-1 ring-primary/20" : "bg-primary/5 hover:bg-primary/10"),
                        )}
                      >
                        <span
                          className={cn(
                            "absolute left-1 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-transparent",
                            isActive && "bg-primary",
                            collapsed && "left-0.5 h-6",
                          )}
                        />

                        <Icon
                          className={cn(
                            "h-[18px] w-[18px] shrink-0",
                            collapsed ? "mx-auto" : "mr-3",
                            isNovelEntry && "text-primary",
                          )}
                        />

                        {!collapsed ? (
                          <span className={cn("truncate", isNovelEntry && "font-semibold")}>
                            {itemLabel}
                          </span>
                        ) : null}

                        {renderBadge(item.to)}
                      </div>
                    )}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
