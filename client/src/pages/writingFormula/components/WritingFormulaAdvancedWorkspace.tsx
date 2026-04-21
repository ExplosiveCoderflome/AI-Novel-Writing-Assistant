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
      <div className="rounded-2xl border bg-slate-50/70 px-4 py-3 text-sm leading-7 text-slate-700">
        {props.selectedProfile
          ? `当前正在维护「${props.selectedProfile.name}」这套写法的设定说明。应用测试和去 AI 味已经拆到独立入口，这里只负责把写法本身整理清楚。`
          : "当前还没有可编辑的写法。请先回到写法页列表，选中或新建一套写法。"}
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
