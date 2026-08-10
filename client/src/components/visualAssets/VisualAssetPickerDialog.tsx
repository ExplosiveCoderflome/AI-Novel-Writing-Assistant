import { VisualAssetLibraryDialog } from "./VisualAssetLibraryDialog";
import type { VisualAssetPickerDialogProps } from "./visualAssetLibrary.types";

export function VisualAssetPickerDialog({ onOpenChange, onSelect, selectionMode = "single", ...props }: VisualAssetPickerDialogProps) {
  return (
    <VisualAssetLibraryDialog
      {...props}
      onOpenChange={onOpenChange}
      selectionMode={selectionMode}
      onSelect={(selection) => {
        onSelect(selection);
        onOpenChange(false);
      }}
    />
  );
}
