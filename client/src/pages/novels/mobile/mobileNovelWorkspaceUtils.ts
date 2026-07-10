import i18next from "i18next";
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
        label: i18next.t("gen.pages.novels.mobile.mobileNovelWorkspaceUtils.saveBasicInfo"),
        savingLabel: i18next.t("gen.pages.novels.mobile.mobileNovelWorkspaceUtils.savingInProgressDotDotDot"),
        isSaving: props.basicTab.isSaving,
        onSave: props.basicTab.onSave,
      };
    case "story_macro":
      return {
        visible: true,
        label: i18next.t("gen.pages.novels.mobile.mobileNovelWorkspaceUtils.saveStoryPlanning"),
        savingLabel: i18next.t("gen.pages.novels.mobile.mobileNovelWorkspaceUtils.savingInProgressDotDotDot"),
        isSaving: props.storyMacroTab.isSaving,
        onSave: props.storyMacroTab.onSaveEdits,
      };
    case "character":
      return {
        visible: true,
        label: i18next.t("gen.pages.novels.mobile.mobileNovelWorkspaceUtils.gen_保存角色_02kg"),
        savingLabel: i18next.t("gen.pages.novels.mobile.mobileNovelWorkspaceUtils.savingInProgressDotDotDot"),
        isSaving: props.characterTab.isSavingCharacter,
        onSave: props.characterTab.onSaveCharacter,
      };
    case "outline":
      return {
        visible: true,
        label: i18next.t("gen.pages.novels.mobile.mobileNovelWorkspaceUtils.saveVolumeWorkspace"),
        savingLabel: i18next.t("gen.pages.novels.mobile.mobileNovelWorkspaceUtils.savingInProgressDotDotDot"),
        isSaving: props.outlineTab.isSaving,
        onSave: props.outlineTab.onSave,
      };
    case "structured":
      return {
        visible: true,
        label: i18next.t("gen.pages.novels.mobile.mobileNovelWorkspaceUtils.saveSplitChapters"),
        savingLabel: i18next.t("gen.pages.novels.mobile.mobileNovelWorkspaceUtils.savingInProgressDotDotDot"),
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
