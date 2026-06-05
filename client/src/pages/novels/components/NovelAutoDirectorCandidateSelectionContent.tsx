import type { DirectorIdeaInspiration, DirectorRunMode, DirectorWorldSetupMode } from "@ai-novel/shared/types/novelDirector";
import type {
  DirectorAutoApprovalGroup,
  DirectorAutoApprovalPoint,
} from "@ai-novel/shared/types/autoDirectorApproval";
import type { StyleIntentSummary } from "@ai-novel/shared/types/styleEngine";
import type { NovelBasicFormState } from "../novelBasicInfo.shared";
import type { DirectorAutoExecutionDraftState } from "./directorAutoExecutionPlan.shared";
import NovelAutoDirectorSetupPanel from "./NovelAutoDirectorSetupPanel";

interface NovelAutoDirectorCandidateSelectionContentProps {
  basicForm: NovelBasicFormState;
  genreOptions: Array<{ id: string; path: string; label: string }>;
  worldOptions: Array<{ id: string; name: string }>;
  idea: string;
  onIdeaChange: (value: string) => void;
  ideaInspirations: DirectorIdeaInspiration[];
  isGeneratingIdeaInspirations: boolean;
  onGenerateIdeaInspirations: () => void;
  runMode: DirectorRunMode;
  runModeOptions: Array<{ value: DirectorRunMode; label: string; description: string }>;
  onRunModeChange: (value: DirectorRunMode) => void;
  worldSetupMode: DirectorWorldSetupMode;
  onWorldSetupModeChange: (value: DirectorWorldSetupMode) => void;
  autoExecutionDraft: DirectorAutoExecutionDraftState;
  maxChapterCount?: number | null;
  onAutoExecutionDraftChange: (patch: Partial<DirectorAutoExecutionDraftState>) => void;
  autoApprovalEnabled: boolean;
  autoApprovalCodes: string[];
  autoApprovalGroups?: DirectorAutoApprovalGroup[];
  autoApprovalPoints?: DirectorAutoApprovalPoint[];
  onAutoApprovalEnabledChange: (enabled: boolean) => void;
  onAutoApprovalCodesChange: (next: string[]) => void;
  styleProfileOptions: Array<{ id: string; name: string }>;
  selectedStyleProfileId: string;
  selectedStyleSummary: StyleIntentSummary | null;
  onStyleProfileChange: (value: string) => void;
  onBasicFormChange?: (patch: Partial<NovelBasicFormState>) => void;
  canGenerate: boolean;
  isGenerating: boolean;
  batchCount: number;
  onGenerate: () => void;
  onReviewCandidates?: () => void;
}

export default function NovelAutoDirectorCandidateSelectionContent({
  basicForm,
  genreOptions,
  worldOptions,
  idea,
  onIdeaChange,
  ideaInspirations,
  isGeneratingIdeaInspirations,
  onGenerateIdeaInspirations,
  runMode,
  runModeOptions,
  onRunModeChange,
  worldSetupMode,
  onWorldSetupModeChange,
  autoExecutionDraft,
  maxChapterCount,
  onAutoExecutionDraftChange,
  autoApprovalEnabled,
  autoApprovalCodes,
  autoApprovalGroups,
  autoApprovalPoints,
  onAutoApprovalEnabledChange,
  onAutoApprovalCodesChange,
  styleProfileOptions,
  selectedStyleProfileId,
  selectedStyleSummary,
  onStyleProfileChange,
  onBasicFormChange,
  canGenerate,
  isGenerating,
  batchCount,
  onGenerate,
  onReviewCandidates,
}: NovelAutoDirectorCandidateSelectionContentProps) {
  return (
    <NovelAutoDirectorSetupPanel
      basicForm={basicForm}
      genreOptions={genreOptions}
      worldOptions={worldOptions}
      idea={idea}
      onIdeaChange={onIdeaChange}
      ideaInspirations={ideaInspirations}
      isGeneratingIdeaInspirations={isGeneratingIdeaInspirations}
      onGenerateIdeaInspirations={onGenerateIdeaInspirations}
      runMode={runMode}
      runModeOptions={runModeOptions}
      onRunModeChange={onRunModeChange}
      worldSetupMode={worldSetupMode}
      onWorldSetupModeChange={onWorldSetupModeChange}
      autoExecutionDraft={autoExecutionDraft}
      maxChapterCount={maxChapterCount}
      onAutoExecutionDraftChange={onAutoExecutionDraftChange}
      autoApprovalEnabled={autoApprovalEnabled}
      autoApprovalCodes={autoApprovalCodes}
      autoApprovalGroups={autoApprovalGroups}
      autoApprovalPoints={autoApprovalPoints}
      onAutoApprovalEnabledChange={onAutoApprovalEnabledChange}
      onAutoApprovalCodesChange={onAutoApprovalCodesChange}
      styleProfileOptions={styleProfileOptions}
      selectedStyleProfileId={selectedStyleProfileId}
      selectedStyleSummary={selectedStyleSummary}
      onStyleProfileChange={onStyleProfileChange}
      onBasicFormChange={onBasicFormChange}
      canGenerate={canGenerate}
      isGenerating={isGenerating}
      batchCount={batchCount}
      onGenerate={onGenerate}
      onReviewCandidates={onReviewCandidates}
    />
  );
}
