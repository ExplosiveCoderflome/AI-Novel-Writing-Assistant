import type {
  DirectorCandidate,
  DirectorCandidateBatch,
  DirectorCorrectionPreset,
  DirectorRunMode,
} from "@ai-novel/shared/types/novelDirector";
import type {
  DirectorAutoApprovalGroup,
  DirectorAutoApprovalPoint,
} from "@ai-novel/shared/types/autoDirectorApproval";
import type { StyleIntentSummary } from "@ai-novel/shared/types/styleEngine";
import type { NovelBasicFormState } from "../novelBasicInfo.shared";
import type { DirectorAutoExecutionDraftState } from "./directorAutoExecutionPlan.shared";
import NovelAutoDirectorCandidateBatches from "./NovelAutoDirectorCandidateBatches";
import NovelAutoDirectorSetupPanel from "./NovelAutoDirectorSetupPanel";

interface NovelAutoDirectorCandidateSelectionContentProps {
  basicForm: NovelBasicFormState;
  genreOptions: Array<{ id: string; path: string; label: string }>;
  idea: string;
  onIdeaChange: (value: string) => void;
  runMode: DirectorRunMode;
  runModeOptions: Array<{ value: DirectorRunMode; label: string; description: string }>;
  onRunModeChange: (value: DirectorRunMode) => void;
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
  batches: DirectorCandidateBatch[];
  selectedPresets: DirectorCorrectionPreset[];
  feedback: string;
  onFeedbackChange: (value: string) => void;
  onTogglePreset: (preset: DirectorCorrectionPreset) => void;
  candidatePatchFeedbacks: Record<string, string>;
  onCandidatePatchFeedbackChange: (candidateId: string, value: string) => void;
  titlePatchFeedbacks: Record<string, string>;
  onTitlePatchFeedbackChange: (candidateId: string, value: string) => void;
  isPatchingCandidate: boolean;
  isRefiningTitle: boolean;
  isConfirming: boolean;
  onApplyCandidateTitleOption: (batchId: string, candidateId: string, option: { title: string }) => void;
  onPatchCandidate: (batchId: string, candidate: DirectorCandidate, feedback: string) => void;
  onRefineTitle: (batchId: string, candidate: DirectorCandidate, feedback: string) => void;
  onConfirmCandidate: (candidate: DirectorCandidate) => void;
  onGenerateNext: () => void;
}

export default function NovelAutoDirectorCandidateSelectionContent({
  basicForm,
  genreOptions,
  idea,
  onIdeaChange,
  runMode,
  runModeOptions,
  onRunModeChange,
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
  batches,
  selectedPresets,
  feedback,
  onFeedbackChange,
  onTogglePreset,
  candidatePatchFeedbacks,
  onCandidatePatchFeedbackChange,
  titlePatchFeedbacks,
  onTitlePatchFeedbackChange,
  isPatchingCandidate,
  isRefiningTitle,
  isConfirming,
  onApplyCandidateTitleOption,
  onPatchCandidate,
  onRefineTitle,
  onConfirmCandidate,
  onGenerateNext,
}: NovelAutoDirectorCandidateSelectionContentProps) {
  return (
    <div className="space-y-4">
      <NovelAutoDirectorSetupPanel
        basicForm={basicForm}
        genreOptions={genreOptions}
        idea={idea}
        onIdeaChange={onIdeaChange}
        runMode={runMode}
        runModeOptions={runModeOptions}
        onRunModeChange={onRunModeChange}
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
      />

      <NovelAutoDirectorCandidateBatches
        batches={batches}
        selectedPresets={selectedPresets}
        feedback={feedback}
        onFeedbackChange={onFeedbackChange}
        onTogglePreset={onTogglePreset}
        candidatePatchFeedbacks={candidatePatchFeedbacks}
        onCandidatePatchFeedbackChange={onCandidatePatchFeedbackChange}
        titlePatchFeedbacks={titlePatchFeedbacks}
        onTitlePatchFeedbackChange={onTitlePatchFeedbackChange}
        isGenerating={isGenerating}
        isPatchingCandidate={isPatchingCandidate}
        isRefiningTitle={isRefiningTitle}
        isConfirming={isConfirming}
        onApplyCandidateTitleOption={onApplyCandidateTitleOption}
        onPatchCandidate={onPatchCandidate}
        onRefineTitle={onRefineTitle}
        onConfirmCandidate={onConfirmCandidate}
        onGenerateNext={onGenerateNext}
      />
    </div>
  );
}
