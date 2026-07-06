import NovelAutoDirectorCandidateBatches from "../components/NovelAutoDirectorCandidateBatches";
import NovelAutoDirectorProgressPanel from "../components/NovelAutoDirectorProgressPanel";
import { Button } from "@/components/ui/button";
import type { useAutoDirectorCreateController } from "./useAutoDirectorCreateController";

type AutoDirectorCreateController = ReturnType<typeof useAutoDirectorCreateController>;

interface StageCandidatesProps {
  controller: AutoDirectorCreateController;
  onRegenerateSettings: () => void;
}

export default function StageCandidates({
  controller,
  onRegenerateSettings,
}: StageCandidatesProps) {
  if (controller.dialogMode !== "candidate_selection") {
    return (
      <section className="space-y-4">
        <NovelAutoDirectorProgressPanel
          mode={controller.dialogMode}
          task={controller.directorTask}
          taskId={controller.workflowTaskId}
          titleHint={controller.pendingTitleHint}
          fallbackError={controller.executionError}
          onBackgroundContinue={controller.handleBackgroundContinue}
          onConfirmAndContinue={() => controller.continueMutation.mutate()}
          isConfirmingAndContinuing={controller.continueMutation.isPending}
          onOpenTaskCenter={controller.handleOpenTaskCenter}
        />
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-border/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="break-words text-2xl font-semibold leading-9 text-foreground [overflow-wrap:anywhere]">方向候选</div>
          <div className="mt-1 max-w-3xl break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
            选择一套方向创建项目，也可以继续生成新批次、微调某套方案或重做标题组。
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={onRegenerateSettings}
        >
          回改设定
        </Button>
      </div>
      <NovelAutoDirectorCandidateBatches
        batches={controller.batches}
        selectedPresets={controller.selectedPresets}
        feedback={controller.feedback}
        onFeedbackChange={controller.setFeedback}
        onTogglePreset={controller.togglePreset}
        candidatePatchFeedbacks={controller.candidatePatchFeedbacks}
        onCandidatePatchFeedbackChange={(candidateId, value) => controller.setCandidatePatchFeedbacks((prev) => ({
          ...prev,
          [candidateId]: value,
        }))}
        titlePatchFeedbacks={controller.titlePatchFeedbacks}
        onTitlePatchFeedbackChange={(candidateId, value) => controller.setTitlePatchFeedbacks((prev) => ({
          ...prev,
          [candidateId]: value,
        }))}
        isGenerating={controller.generateMutation.isPending}
        isPatchingCandidate={controller.patchCandidateMutation.isPending}
        isRefiningTitle={controller.refineTitleMutation.isPending}
        isConfirming={controller.confirmMutation.isPending}
        onApplyCandidateTitleOption={controller.applyCandidateTitleOption}
        onPatchCandidate={(batchId, candidate, nextFeedback) => controller.patchCandidateMutation.mutate({
          batchId,
          candidate,
          feedback: nextFeedback,
        })}
        onRefineTitle={(batchId, candidate, nextFeedback) => controller.refineTitleMutation.mutate({
          batchId,
          candidate,
          feedback: nextFeedback,
        })}
        onConfirmCandidate={controller.handleConfirmCandidate}
        onGenerateNext={() => controller.generateMutation.mutate()}
      />
    </section>
  );
}

