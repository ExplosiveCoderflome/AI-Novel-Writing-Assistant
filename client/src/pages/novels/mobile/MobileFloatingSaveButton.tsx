import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MobileSaveState } from "./mobileNovelWorkspaceUtils";

export default function MobileFloatingSaveButton({
  visible,
  label,
  savingLabel,
  isSaving,
  onSave,
}: MobileSaveState) {
  if (!visible) {
    return null;
  }

  return (
    <div
      className="mobile-floating-save-button fixed left-3 right-3 z-40 rounded-xl border border-border/70 bg-background/95 p-2 shadow-lg backdrop-blur"
      style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <Button type="button" className="h-11 w-full" onClick={onSave} disabled={isSaving}>
        <Save className="h-4 w-4" />
        {isSaving ? savingLabel : label}
      </Button>
    </div>
  );
}
