import i18next from "i18next";
import { useTranslation } from "react-i18next";
import type { StoryMacroField } from "@ai-novel/shared/types/storyMacro";
import AiButton from "@/components/common/AiButton";
import { Button } from "@/components/ui/button";

export const ENGINE_TEXT_FIELDS: Array<{
  field: StoryMacroField;
  label: string;
  placeholder: string;
  multiline?: boolean;
}> = [
  { field: "expanded_premise", label: i18next.t("novels.storyMacroPlanTab.shared.ccylvj"), placeholder: i18next.t("novels.storyMacroPlanTab.shared.exd7mf"), multiline: true },
  { field: "protagonist_core", label: i18next.t("novels.storyMacroPlanTab.shared.jbmts1"), placeholder: i18next.t("novels.storyMacroPlanTab.shared.pqhtbo"), multiline: true },
  { field: "conflict_engine", label: i18next.t("novels.storyMacroPlanTab.shared.atcsdk"), placeholder: i18next.t("novels.storyMacroPlanTab.shared.8y2bcz"), multiline: true },
  { field: "mystery_box", label: i18next.t("dict.gen_6f4a9bfe"), placeholder: i18next.t("novels.storyMacroPlanTab.shared.cmyupf"), multiline: true },
  { field: "emotional_line", label: i18next.t("novels.storyMacroPlanTab.shared.cqh4fs"), placeholder: i18next.t("novels.storyMacroPlanTab.shared.wm7gad"), multiline: true },
  { field: "tone_reference", label: i18next.t("novels.storyMacroPlanTab.shared.awr8py"), placeholder: i18next.t("novels.storyMacroPlanTab.shared.92k0qh"), multiline: true },
];

export const SUMMARY_FIELDS: Array<{
  field: StoryMacroField;
  label: string;
  placeholder: string;
  multiline?: boolean;
}> = [
  { field: "selling_point", label: i18next.t("novels.storyMacroPlanTab.shared.w0lg3f"), placeholder: i18next.t("novels.storyMacroPlanTab.shared.o7ghsv") },
  { field: "core_conflict", label: i18next.t("novels.storyEngineStudio.jad1ma"), placeholder: i18next.t("novels.storyMacroPlanTab.shared.xupp5c") },
  { field: "main_hook", label: i18next.t("novels.storyEngineStudio.aehui3"), placeholder: i18next.t("novels.storyMacroPlanTab.shared.9kgul4") },
  { field: "progression_loop", label: i18next.t("novels.storyEngineStudio.d604zo"), placeholder: i18next.t("novels.storyMacroPlanTab.shared.7na8fy"), multiline: true },
  { field: "growth_path", label: i18next.t("dict.gen_eb4c8f80"), placeholder: i18next.t("novels.storyMacroPlanTab.shared.myny5c"), multiline: true },
  { field: "ending_flavor", label: i18next.t("novels.storyMacroPlanTab.shared.gdskb1"), placeholder: i18next.t("novels.storyMacroPlanTab.shared.2ir0ia") },
];

export function listToText(value: string[]): string {
  return value.join("\n");
}

export function textareaClassName(minHeight = "min-h-28") {
  const { t } = useTranslation();
  return `${minHeight} w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring`;
}

export function FieldActions(props: {
  field: StoryMacroField;
  lockedFields: Partial<Record<StoryMacroField, boolean>>;
  regeneratingField: StoryMacroField | "";
  storyInput: string;
  onToggleLock: (field: StoryMacroField) => void;
  onRegenerateField: (field: StoryMacroField) => void;
}) {
  const isLocked = Boolean(props.lockedFields[props.field]);
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant={isLocked ? "secondary" : "outline"}
        onClick={() => props.onToggleLock(props.field)}
      >
        {isLocked ? "已锁定" : "锁定"}
      </Button>
      <AiButton
        size="sm"
        variant="outline"
        onClick={() => props.onRegenerateField(props.field)}
        disabled={props.regeneratingField === props.field || isLocked || !props.storyInput.trim()}
      >
        {props.regeneratingField === props.field ? "重生成中..." : "重生成"}
      </AiButton>
    </div>
  );
}
