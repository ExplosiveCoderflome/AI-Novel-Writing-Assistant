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
    <div className={cn("min-h-dvh bg-muted/20 text-foreground", moreOpen && "overflow-hidden")}>
      <header className="sticky top-0 z-40 border-b bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/82">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-2" onClick={() => setMoreOpen(false)}>
            <DesktopBrandMark className="h-8 w-8 shrink-0 drop-shadow-none" />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold">AI 小说创作工作台</div>
              <div className="truncate text-[11px] text-muted-foreground">{pageTitle}</div>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" className="h-8 px-3">
              <Link to="/novels/create?mode=director" onClick={() => setMoreOpen(false)}>
                <Plus className="h-3.5 w-3.5" />
                开书
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMoreOpen((current) => !current)}
              aria-label={moreOpen ? "关闭更多入口" : "打开更多入口"}
            >
              {moreOpen ? <X className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className={cn("mobile-site-main mobile-safe-bottom", getMobileRouteClassName(location.pathname))}>
        {children}
      </main>

      {moreOpen ? (
        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] top-14 z-50 bg-black/20 px-3 pb-3 backdrop-blur-sm">
          <div className="max-h-full overflow-y-auto rounded-3xl border bg-background p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-base font-semibold">更多入口</div>
                <div className="text-xs text-muted-foreground">选择要继续处理的工作区。</div>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setMoreOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4">
              {moreNavGroups.map((group) => (
                <section key={group.title} className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.title}
                  </div>
                  <div className="grid gap-2">
                    {group.items.map((item) => (
                      <Link
                        key={item.key}
                        to={item.to}
                        className={cn(
                          "flex items-center justify-between rounded-2xl border bg-muted/20 px-3 py-3 text-sm transition hover:border-primary/40 hover:bg-primary/5",
                          location.pathname === item.to && "border-primary/50 bg-primary/10 font-semibold",
                        )}
                        onClick={() => setMoreOpen(false)}
                      >
                        <span>{item.label}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur supports-[backdrop-filter]:bg-background/82">
        <div className="grid grid-cols-5 gap-1">
          {primaryNavItems.map((item) => {
            const Icon = primaryIcons[item.key as MobilePrimaryNavKey];
            const isActive = item.key === "more" ? activeGroup === "more" || moreOpen : activeGroup === item.key;
            return (
              <button
                key={item.key}
                type="button"
                className={cn(
                  "flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-1.5 text-[11px] text-muted-foreground transition",
                  isActive && "bg-primary/10 font-semibold text-primary",
                )}
                onClick={() => openPrimaryItem(item.key as MobilePrimaryNavKey, item.to)}
              >
                <Icon className="h-4 w-4" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
