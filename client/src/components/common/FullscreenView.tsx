import { useCallback, useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FullscreenViewProps {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  fullscreen?: boolean;
  defaultFullscreen?: boolean;
  onFullscreenChange?: (next: boolean) => void;
  className?: string;
  fullscreenClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  fullscreenBodyClassName?: string;
  toggleLabel?: string;
  exitLabel?: string;
}

export default function FullscreenView(props: FullscreenViewProps) {
  const {
    title,
    description,
    meta,
    actions,
    children,
    fullscreen,
    defaultFullscreen = false,
    onFullscreenChange,
    className,
    fullscreenClassName,
    headerClassName,
    bodyClassName,
    fullscreenBodyClassName,
    toggleLabel = "全屏查看",
    exitLabel = "退出全屏",
  } = props;
  const headingId = useId();
  const [internalFullscreen, setInternalFullscreen] = useState(defaultFullscreen);
  const isControlled = fullscreen !== undefined;
  const isFullscreen = isControlled ? fullscreen : internalFullscreen;

  const setFullscreen = useCallback((next: boolean) => {
    if (!isControlled) {
      setInternalFullscreen(next);
    }
    onFullscreenChange?.(next);
  }, [isControlled, onFullscreenChange]);

  useEffect(() => {
    if (!isFullscreen || typeof document === "undefined" || typeof window === "undefined") {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen, setFullscreen]);

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm",
        className,
        isFullscreen && "fixed inset-0 z-50 flex h-dvh w-screen flex-col rounded-none border-0",
        isFullscreen && fullscreenClassName,
      )}
    >
      <div
        className={cn(
          "shrink-0 border-b border-border/60 bg-[linear-gradient(135deg,hsl(var(--background))_0%,hsl(var(--muted)/0.45)_100%)] p-4",
          isFullscreen && "px-6 py-4",
          headerClassName,
        )}
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <div id={headingId} className="text-base font-semibold">
                {title}
              </div>
              {meta}
            </div>
            {description ? (
              <div className="text-sm leading-6 text-muted-foreground">
                {description}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {actions}
            <Button
              type="button"
              size="icon"
              variant={isFullscreen ? "outline" : "secondary"}
              onClick={() => setFullscreen(!isFullscreen)}
              title={isFullscreen ? exitLabel : toggleLabel}
              aria-label={isFullscreen ? exitLabel : toggleLabel}
              aria-pressed={isFullscreen}
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>
      <div className={cn(
        "min-h-0",
        bodyClassName,
        isFullscreen && "flex-1 overflow-hidden",
        isFullscreen && fullscreenBodyClassName,
      )}>
        {children}
      </div>
    </section>
  );
}
