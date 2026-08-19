import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { APP_RUNTIME } from "@/lib/constants";
import { CURRENT_DESKTOP_RELEASE_NOTES } from "./desktopReleaseNotes";

const SEEN_PREFIX = "ai-novel.desktop.release-notes.seen.";

function getSeenKey(version: string): string {
  return `${SEEN_PREFIX}${version}`;
}

export default function DesktopReleaseNotesDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (APP_RUNTIME !== "desktop" || CURRENT_DESKTOP_RELEASE_NOTES.version === "0.0.0") return;
    const key = getSeenKey(CURRENT_DESKTOP_RELEASE_NOTES.version);
    if (window.localStorage.getItem(key) === "true") return;
    window.localStorage.setItem(key, "true");
    setOpen(true);
  }, []);

  if (APP_RUNTIME !== "desktop") return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <AppDialogContent
        className="max-w-xl"
        title={CURRENT_DESKTOP_RELEASE_NOTES.title}
        description={`桌面版 ${CURRENT_DESKTOP_RELEASE_NOTES.version.startsWith("v") ? CURRENT_DESKTOP_RELEASE_NOTES.version : `v${CURRENT_DESKTOP_RELEASE_NOTES.version}`} 已准备完成。`}
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/10 p-4">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-sm leading-6 text-foreground">{CURRENT_DESKTOP_RELEASE_NOTES.summary}</p>
          </div>
          <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
            {CURRENT_DESKTOP_RELEASE_NOTES.items.map((item) => <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />{item}</li>)}
          </ul>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
