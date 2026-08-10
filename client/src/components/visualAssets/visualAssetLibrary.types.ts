import type {
  VisualAssetKind,
  VisualAssetScopeRef,
  VisualAssetSelection,
} from "@ai-novel/shared/types/visualAsset";

export type VisualAssetSelectionMode = "browse" | "single" | "multiple";

export interface VisualAssetLibraryProps {
  scope?: VisualAssetScopeRef;
  allowedKinds?: readonly VisualAssetKind[];
  selectionMode?: VisualAssetSelectionMode;
  initialSelection?: readonly VisualAssetSelection[];
  onSelect?: (selection: VisualAssetSelection[]) => void;
  className?: string;
}

export interface VisualAssetLibraryDialogProps extends Omit<VisualAssetLibraryProps, "className"> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface VisualAssetPickerDialogProps extends Omit<VisualAssetLibraryDialogProps, "selectionMode" | "onSelect"> {
  selectionMode?: Exclude<VisualAssetSelectionMode, "browse">;
  onSelect: (selection: VisualAssetSelection[]) => void;
}
