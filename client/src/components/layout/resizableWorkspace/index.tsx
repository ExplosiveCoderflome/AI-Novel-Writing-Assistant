import { useEffect, useRef, useState, type ReactNode } from "react";
import { Group, Panel, Separator, useDefaultLayout, useGroupRef } from "react-resizable-panels";

interface Props {
  id: string;
  label: string;
  left: ReactNode;
  right: ReactNode;
  defaultLeft: number;
  minLeft: number;
  minRight: number;
  breakpoint: number;
}

// Width is measured locally so nested workspaces also stack before becoming cramped.
export function ResizableWorkspace({ id, label, left, right, defaultLeft, minLeft, minRight, breakpoint }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const group = useGroupRef();
  const [wide, setWide] = useState(false);
  const leftId = `${id}-left`, rightId = `${id}-right`;
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id,
    storage: {
      getItem: key => { try { return window.localStorage.getItem(key); } catch { return null; } },
      setItem: (key, value) => { try { window.localStorage.setItem(key, value); } catch { /* Layout remains usable without storage. */ } },
    },
  });
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWide(entries[0].contentRect.width >= breakpoint));
    observer.observe(element);
    return () => observer.disconnect();
  }, [breakpoint]);

  return <div ref={container} className="min-w-0">
    {wide && right ? <Group id={id} orientation="horizontal" groupRef={group} defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged} className="min-w-0 items-stretch">
      <Panel id={leftId} defaultSize={defaultLeft} minSize={`${minLeft}px`} className="min-w-0">{left}</Panel>
      <Separator aria-label={label} title="拖动调整宽度，双击恢复默认；方向键微调" onDoubleClick={() => group.current?.setLayout({ [leftId]: defaultLeft, [rightId]: 100 - defaultLeft })} className="group mx-1 flex w-3 shrink-0 cursor-col-resize touch-none items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        <span className="h-full w-px bg-border/50 transition-colors group-hover:bg-primary group-focus-visible:bg-primary" />
      </Separator>
      <Panel id={rightId} defaultSize={100 - defaultLeft} minSize={`${minRight}px`} className="min-w-0">{right}</Panel>
    </Group> : <div className="min-w-0 space-y-4">{left}{right}</div>}
  </div>;
}
