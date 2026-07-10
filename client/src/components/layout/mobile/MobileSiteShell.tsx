import type { ReactNode } from "react";
import { useState } from "react";
import {
  BookOpenText,
  ChevronRight,
  Home,
  LayoutGrid,
  ListTodo,
  Menu,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AppVersionBadge from "../AppVersionBadge";
import DesktopBrandMark from "../DesktopBrandMark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getMobileMoreNavGroups,
  getMobileNavGroupForPath,
  getMobilePageTitle,
  getMobilePrimaryNavItems,
  getMobileRouteClassName,
  type MobilePrimaryNavKey,
} from "./mobileSiteNavigation";

const primaryIcons: Record<MobilePrimaryNavKey, typeof Home> = {
  home: Home,
  novels: BookOpenText,
  creation: Sparkles,
  tasks: ListTodo,
  more: Menu,
};

interface MobileSiteShellProps {
  children: ReactNode;
}

export default function MobileSiteShell({ children }: MobileSiteShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const activeGroup = getMobileNavGroupForPath(location.pathname);
  const pageTitle = getMobilePageTitle(location.pathname);
  const primaryNavItems = getMobilePrimaryNavItems();
  const moreNavGroups = getMobileMoreNavGroups();

  const openPrimaryItem = (key: MobilePrimaryNavKey, to: string) => {
    if (key === "more") {
      setMoreOpen((current) => !current);
      return;
    }
    setMoreOpen(false);
    navigate(to);
  };

  return (
    <div className={cn("novel-console-shell min-h-dvh text-foreground", moreOpen && "overflow-hidden")}>
      <header className="novel-console-topbar sticky top-0 z-40 border-b border-border/80 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/88">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-2" onClick={() => setMoreOpen(false)}>
            <DesktopBrandMark className="h-8 w-8 shrink-0 drop-shadow-none" />
            <div className="min-w-0 leading-tight">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate text-sm font-semibold">宫寒导演控制台</span>
                <AppVersionBadge />
              </div>
              <div className="truncate text-[11px] text-muted-foreground">{pageTitle}</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" className="h-8 px-3 shadow-sm">
              <Link to="/novels/create?mode=director" onClick={() => setMoreOpen(false)}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                开书
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 border-primary/20 bg-card/80 shadow-sm"
              onClick={() => setMoreOpen((current) => !current)}
              aria-label={moreOpen ? "关闭更多入口" : "打开更多入口"}
            >
              {moreOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <LayoutGrid className="h-4 w-4" aria-hidden="true" />}
            </Button>
          </div>
        </div>
      </header>

      <main className={cn("mobile-site-main mobile-safe-bottom", getMobileRouteClassName(location.pathname))}>
        {children}
      </main>

      {moreOpen ? (
        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] top-14 z-50 bg-[hsl(var(--console-ink)/0.32)] px-3 pb-3 backdrop-blur-sm">
          <div className="novel-console-panel max-h-full overflow-y-auto rounded-xl border p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-base font-semibold">更多入口</div>
                <div className="truncate text-xs text-muted-foreground">选择要继续处理的工作区。</div>
              </div>
              <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => setMoreOpen(false)}>
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="space-y-4">
              {moreNavGroups.map((group) => (
                <section key={group.title} className="space-y-2">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                    {group.title}
                  </div>
                  <div className="grid gap-2">
                    {group.items.map((item) => (
                      <Link
                        key={item.key}
                        to={item.to}
                        className={cn(
                          "flex min-w-0 items-center justify-between gap-3 rounded-lg border bg-card/75 px-3 py-3 text-sm transition hover:border-primary/40 hover:bg-accent/35",
                          location.pathname === item.to && "border-primary/45 bg-primary/10 font-semibold text-primary",
                        )}
                        onClick={() => setMoreOpen(false)}
                      >
                        <span className="min-w-0 truncate">{item.label}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-card/96 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-14px_34px_hsl(var(--console-ink)/0.08)] backdrop-blur supports-[backdrop-filter]:bg-card/86">
        <div className="grid grid-cols-5 gap-1">
          {primaryNavItems.map((item) => {
            const Icon = primaryIcons[item.key as MobilePrimaryNavKey];
            const isActive = item.key === "more" ? activeGroup === "more" || moreOpen : activeGroup === item.key;
            return (
              <button
                key={item.key}
                type="button"
                className={cn(
                  "flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[11px] text-muted-foreground transition",
                  isActive && "bg-primary/10 font-semibold text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.08)]",
                )}
                onClick={() => openPrimaryItem(item.key as MobilePrimaryNavKey, item.to)}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
