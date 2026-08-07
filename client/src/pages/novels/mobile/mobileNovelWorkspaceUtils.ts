import type { NovelWorkspaceTab } from "../novelWorkspaceNavigation";
import type { NovelEditViewProps } from "../components/NovelEditView.types";

export interface MobileSaveState {
  visible: boolean;
  label: string;
  savingLabel: string;
  isSaving: boolean;
  onSave: () => void;
}

export function getMobileNovelWorkspaceStatusText(input: {
  activeLabel: string;
  workflowLabel: string;
}): string {
  if (input.activeLabel === input.workflowLabel) {
    return `当前步骤：${input.activeLabel}`;
  }

  return `当前步骤：${input.activeLabel} · 流程推荐：${input.workflowLabel}`;
}

export function getMobileNovelSaveState(
  tab: NovelWorkspaceTab,
  props: NovelEditViewProps,
): MobileSaveState {
  switch (tab) {
    case "basic":
      return {
        visible: true,
        label: "Save basic information",
        savingLabel: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
        isSaving: props.basicTab.isSaving,
        onSave: props.basicTab.onSave,
      };
    case "story_macro":
      return {
        visible: true,
        label: "Save story plan",
        savingLabel: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
        isSaving: props.storyMacroTab.isSaving,
        onSave: props.storyMacroTab.onSaveEdits,
      };
    case "world":
      return {
        visible: false,
        label: "",
        savingLabel: "",
        isSaving: false,
        onSave: () => undefined,
      };
    case "character":
      return {
        visible: true,
        label: "save character",
        savingLabel: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
        isSaving: props.characterTab.isSavingCharacter,
        onSave: props.characterTab.onSaveCharacter,
      };
    case "outline":
      return {
        visible: true,
        label: "Save volume workspace",
        savingLabel: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
        isSaving: props.outlineTab.isSaving,
        onSave: props.outlineTab.onSave,
      };
    case "structured":
      return {
        visible: true,
        label: "Save the seal",
        savingLabel: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
        isSaving: props.structuredTab.isSaving,
        onSave: props.structuredTab.onSave,
      };
    default:
      return {
        visible: false,
        label: "",
        savingLabel: "",
        isSaving: false,
        onSave: () => undefined,
      };
  }
}
