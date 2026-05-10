import type {
  DirectorCandidate,
  DirectorCandidateBatch,
  DirectorCorrectionPreset,
} from "@ai-novel/shared/types/novelDirector";
import {
  AppDialogContent,
  Dialog,
} from "@/components/ui/dialog";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";
import NovelAutoDirectorCandidateBatches from "./NovelAutoDirectorCandidateBatches";

interface NovelAutoDirectorCandidateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batches: DirectorCandidateBatch[];
  selectedPresets: DirectorCorrectionPreset[];
  feedback: string;
  onFeedbackChange: (value: string) => void;
  onTogglePreset: (preset: DirectorCorrectionPreset) => void;
  candidatePatchFeedbacks: Record<string, string>;
  onCandidatePatchFeedbackChange: (candidateId: string, value: string) => void;
  titlePatchFeedbacks: Record<string, string>;
  onTitlePatchFeedbackChange: (candidateId: string, value: string) => void;
  isGenerating: boolean;
  isPatchingCandidate: boolean;
  isRefiningTitle: boolean;
  isConfirming: boolean;
  onApplyCandidateTitleOption: (batchId: string, candidateId: string, option: { title: string }) => void;
  onPatchCandidate: (batchId: string, candidate: DirectorCandidate, feedback: string) => void;
  onRefineTitle: (batchId: string, candidate: DirectorCandidate, feedback: string) => void;
  onConfirmCandidate: (candidate: DirectorCandidate) => void | Promise<void>;
  onGenerateNext: () => void;
}

export default function NovelAutoDirectorCandidateDialog({
  open,
  onOpenChange,
  batches,
  selectedPresets,
  feedback,
  onFeedbackChange,
  onTogglePreset,
  candidatePatchFeedbacks,
  onCandidatePatchFeedbackChange,
  titlePatchFeedbacks,
  onTitlePatchFeedbackChange,
  isGenerating,
  isPatchingCandidate,
  isRefiningTitle,
  isConfirming,
  onApplyCandidateTitleOption,
  onPatchCandidate,
  onRefineTitle,
  onConfirmCandidate,
  onGenerateNext,
}: NovelAutoDirectorCandidateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        className={`${AUTO_DIRECTOR_MOBILE_CLASSES.dialogContent} lg:max-w-6xl`}
        title="确认书级方案"
        description="比较 AI 给出的整本书方向。你可以先微调标题或方案，再选用一套创建项目。"
        bodyClassName={AUTO_DIRECTOR_MOBILE_CLASSES.dialogBody}
      >
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
      </AppDialogContent>
    </Dialog>
  );
}
