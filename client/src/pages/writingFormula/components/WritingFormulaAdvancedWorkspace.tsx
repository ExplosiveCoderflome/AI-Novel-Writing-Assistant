import type { AntiAiRule, StyleProfile, StyleProfileFeature } from "@ai-novel/shared/types/styleEngine";
import WritingFormulaEditorPanel from "./WritingFormulaEditorPanel";

interface WritingFormulaEditorState {
  name: string;
  description: string;
  category: string;
  tags: string;
  applicableGenres: string;
  sourceContent: string;
  extractedFeatures: StyleProfileFeature[];
  analysisMarkdown: string;
  narrativeRules: string;
  characterRules: string;
  languageRules: string;
  rhythmRules: string;
  antiAiRuleIds: string[];
}

interface WritingFormulaAdvancedWorkspaceProps {
  antiAiRules: AntiAiRule[];
  selectedProfile: StyleProfile | null;
  editor: WritingFormulaEditorState;
  savePending: boolean;
  deletePending: boolean;
  reextractPending: boolean;
  onEditorChange: (patch: Partial<WritingFormulaEditorState>) => void;
  onToggleExtractedFeature: (featureId: string, checked: boolean) => void;
  onReextractFeatures: () => void;
  onToggleAntiAiRule: (ruleId: string, checked: boolean) => void;
  onSave: () => void;
  onDelete: () => void;
}

export default function WritingFormulaAdvancedWorkspace(props: WritingFormulaAdvancedWorkspaceProps) {
  return (
    <div className="mx-auto flex h-full min-h-0 max-w-[1120px] flex-col gap-4 overflow-y-auto xl:pr-1">
      <div className="rounded-lg bg-muted/30 px-4 py-3 text-sm leading-7 text-muted-foreground">
        {props.selectedProfile
          ? `为「${props.selectedProfile.name}」补充读感定位、生成规则和表达边界。`
          : "请从写法列表选择一套写法，或创建新的写法资产。"}
      </div>

      <WritingFormulaEditorPanel
        selectedProfile={props.selectedProfile}
        editor={props.editor}
        antiAiRules={props.antiAiRules}
        savePending={props.savePending}
        deletePending={props.deletePending}
        reextractPending={props.reextractPending}
        onEditorChange={props.onEditorChange}
        onToggleExtractedFeature={props.onToggleExtractedFeature}
        onReextractFeatures={props.onReextractFeatures}
        onToggleAntiAiRule={props.onToggleAntiAiRule}
        onSave={props.onSave}
        onDelete={props.onDelete}
      />
    </div>
  );
}
