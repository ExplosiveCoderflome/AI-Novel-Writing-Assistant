import { useId, useLayoutEffect, useRef, type CSSProperties, type HTMLAttributes } from "react";
import "./workspaceColumns.css";

type Side = "left" | "right";
type Column = { label: string; initial: string; min: number; collapsed?: boolean };
interface Props extends HTMLAttributes<HTMLDivElement> {
  layoutId: string;
  left?: Column;
  right?: Column;
  minCenter?: number;
  gap?: number;
}

// The content stays mounted when a responsive grid switches to tabs or stacked rows.
export function WorkspaceColumns({ layoutId, left, right, minCenter = 280, gap = 16, className = "", children, ...rest }: Props) {
  const sides = { left, right };
  const style = {
    "--workspace-center-min": `${minCenter}px`,
    "--workspace-gap": `${gap}px`,
    "--workspace-tracks": [left && "var(--left-track)", "minmax(0, 1fr)", right && "var(--right-track)"].filter(Boolean).join(" "),
  } as CSSProperties;
  for (const side of ["left", "right"] as const) {
    const column = sides[side];
    Object.assign(style, {
      [`--${side}-default`]: column?.initial ?? "0px",
      [`--${side}-min`]: `${column?.min ?? 0}px`,
      [`--${side}-gap`]: column ? "var(--workspace-gap)" : "0px",
    });
    if (!column || column.collapsed) Object.assign(style, { [`--${side}-track`]: column?.initial ?? "0px" });
  }
  return <div {...rest} className={`workspace-columns ${className}`} style={{ ...style, ...rest.style }}>
    {children}
    {left && !left.collapsed && <ColumnDivider side="left" column={left} layoutId={layoutId} minCenter={minCenter} />}
    {right && !right.collapsed && <ColumnDivider side="right" column={right} layoutId={layoutId} minCenter={minCenter} />}
  </div>;
}

function ColumnDivider({ side, column, layoutId, minCenter }: { side: Side; column: Column; layoutId: string; minCenter: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const drag = useRef<{ id: number; x: number; width: number; original: string } | null>(null);
  const variable = `--${side}-preferred`;
  const key = `workspace-width:${layoutId}:${side}`;
  const sign = side === "left" ? 1 : -1;

  function bounds(handle: HTMLDivElement) {
    const tracks = window.getComputedStyle(handle.parentElement!).gridTemplateColumns.split(/\s+/).map(parseFloat);
    const index = side === "left" ? 0 : tracks.length - 1;
    const width = tracks[index];
    return { width, max: Math.max(column.min, width + tracks[index + sign] - minCenter) };
  }

  function resize(handle: HTMLDivElement, target: number) {
    const { max } = bounds(handle);
    handle.parentElement!.style.setProperty(variable, `${Math.round(Math.max(column.min, Math.min(max, target)))}px`);
  }

  function save(handle: HTMLDivElement) {
    const value = handle.parentElement!.style.getPropertyValue(variable);
    try {
      if (value) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    } catch { /* The current layout still works when storage is unavailable. */ }
  }

  useLayoutEffect(() => {
    const handle = ref.current!;
    const grid = handle.parentElement!;
    try {
      const saved = localStorage.getItem(key);
      if (saved && /^\d+px$/.test(saved)) grid.style.setProperty(variable, saved);
    } catch { /* Start with the page default. */ }
    const panels = Array.from(grid.querySelectorAll<HTMLElement>(":scope > :not([data-column-divider])"));
    function updateAria() {
      if (!handle.offsetWidth) return;
      const { width, max } = bounds(handle);
      handle.setAttribute("aria-valuenow", String(Math.round(width)));
      handle.setAttribute("aria-valuemax", String(Math.round(max)));
      handle.setAttribute("aria-valuetext", `${Math.round(width)} 像素`);
      const visible = panels.filter(node => node.offsetWidth).sort((a, b) => a.offsetLeft - b.offsetLeft);
      const panel = side === "left" ? visible[0] : visible.at(-1);
      if (panel) {
        if (!panel.id) panel.id = panelId;
        handle.setAttribute("aria-controls", panel.id);
      }
    }
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateAria);
    observer?.observe(grid);
    panels.forEach(node => observer?.observe(node));
    updateAria();
    return () => { observer?.disconnect(); grid.style.removeProperty(variable); };
  }, [key, side, variable, column.min, minCenter, panelId]);

  return <div ref={ref} data-column-divider={side} role="separator" tabIndex={0} aria-orientation="vertical"
    aria-label={column.label} aria-valuemin={column.min} title={`${column.label}，双击恢复默认宽度，方向键微调`}
    onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0) return;
      const handle = event.currentTarget;
      drag.current = { id: event.pointerId, x: event.clientX, width: bounds(handle).width, original: handle.parentElement!.style.getPropertyValue(variable) };
      handle.setPointerCapture(event.pointerId);
      handle.focus({ preventScroll: true });
      event.preventDefault();
    }}
    onPointerMove={event => {
      const start = drag.current;
      if (start?.id === event.pointerId && event.clientX !== start.x) resize(event.currentTarget, start.width + sign * (event.clientX - start.x));
      else if (start?.id === event.pointerId) event.currentTarget.parentElement!.style.setProperty(variable, start.original);
    }}
    onPointerUp={event => {
      if (drag.current?.id !== event.pointerId) return;
      drag.current = null;
      save(event.currentTarget);
    }}
    onLostPointerCapture={event => {
      if (drag.current?.id !== event.pointerId) return;
      event.currentTarget.parentElement!.style.setProperty(variable, drag.current.original);
      drag.current = null;
    }}
    onDoubleClick={event => { event.currentTarget.parentElement!.style.removeProperty(variable); save(event.currentTarget); }}
    onKeyDown={event => {
      const { width, max } = bounds(event.currentTarget);
      const step = event.shiftKey ? 48 : 12;
      const targets: Record<string, number> = { ArrowLeft: width - sign * step, ArrowRight: width + sign * step, Home: column.min, End: max };
      if (!(event.key in targets)) return;
      event.preventDefault();
      resize(event.currentTarget, targets[event.key]);
      save(event.currentTarget);
    }} />;
}
