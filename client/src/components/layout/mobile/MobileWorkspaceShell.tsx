import type { ReactNode } from "react";
import DesktopBrandMark from "@/components/layout/DesktopBrandMark";
import { cn } from "@/lib/utils";

interface MobileWorkspaceShellProps {
  title: string;
  subtitle?: string;
  statusText?: string;
  actions?: ReactNode;
  children: ReactNode;
  bottomBar?: ReactNode;
  className?: string;
  contentClassName?: string;
}

export default function MobileWorkspaceShell(props: MobileWorkspaceShellProps) {
  const { title, subtitle, statusText, actions, children, bottomBar, className, contentClassName } = props;

  return (
    <div className={cn("min-h-screen bg-slate-50 text-foreground", className)}>
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <DesktopBrandMark className="mt-0.5 h-8 w-8 shrink-0 drop-shadow-none" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold leading-6">{title}</h1>
              {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
            </div>
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
        {statusText ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{statusText}</p> : null}
      </header>

      <main className={cn("min-h-0 px-3 py-4", bottomBar ? "pb-24" : "pb-6", contentClassName)}>{children}</main>

      {bottomBar ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 px-3 py-3 shadow-[0_-12px_28px_rgba(15,23,42,0.08)] backdrop-blur mobile-safe-bottom">
          {bottomBar}
        </div>
      ) : null}
    </div>
  );
}
