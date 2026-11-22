import { useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VisualAssetLibraryDialog } from "@/components/visualAssets";
import { ProjectNavigation } from "../Sidebar";

export default function GlobalNavigationMenu() {
  const [open, setOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <Button ref={trigger} type="button" size="sm" variant="ghost" className="group gap-1.5 data-[state=open]:bg-accent">
            全局菜单
            <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground group-data-[state=open]:rotate-180" />
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="bottom" align="start" sideOffset={6} collisionPadding={12} aria-label="全局菜单"
            className="z-50 max-h-[var(--radix-popover-content-available-height)] w-[min(39rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-xl bg-popover p-3 text-popover-foreground shadow-lg"
            onOpenAutoFocus={event => {
              event.preventDefault();
              (event.target as HTMLElement).querySelector("a")?.focus({ preventScroll: true });
            }}
            onCloseAutoFocus={event => { if (assetsOpen) event.preventDefault(); }}>
            <ProjectNavigation className="grid grid-cols-[repeat(auto-fit,minmax(min(10.5rem,100%),1fr))] items-start gap-4"
              onNavigate={() => setOpen(false)}
              onOpenVisualAssets={() => { setOpen(false); setAssetsOpen(true); }} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <VisualAssetLibraryDialog open={assetsOpen} onOpenChange={setAssetsOpen} onCloseAutoFocus={event => {
        event.preventDefault();
        trigger.current?.focus();
      }} />
    </>
  );
}
